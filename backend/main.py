import logging
import os
import uuid

from fastapi import BackgroundTasks, Depends, FastAPI, File, HTTPException, Request, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from ai_model import classify_humidity
from auth import (
    create_access_token,
    get_current_user,
    get_optional_user,
    hash_password,
    require_admin,
    verify_password,
)
from database import Base, SessionLocal, engine, get_db
from email_service import enviar_cambio_estado, enviar_confirmacion_pedido, enviar_notificacion_admin
from models import BrandMargin, CartItem, Order, OrderItem, Product, User
from pricing import calculate_price
from seed_data import HUMIDITY_RECOMMENDATIONS, SEED_CATEGORIES, SEED_PRODUCTS
from shipping import calcular_envio, info_tarifas
import sumup as sumup_client
from diagnostic import (
    TIPO_INFO, NIVEL_INFO,
    diagnosticar,
    nivel_desde_confianza_ia,
)
import pdf_importer
import web_scraper

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
)
logger = logging.getLogger(__name__)

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="NomasHumedades API",
    version="2.0.0",
    description="API para nomashumedades.com — tienda de materiales y análisis de humedades.",
)

ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOADS_DIR = "uploads"
os.makedirs(UPLOADS_DIR, exist_ok=True)

# PDFs de proveedores — prioridad: catalogos/ (nuevos), fallback: tienda-online/marcas
MARCAS_DIR = os.getenv("MARCAS_DIR", "catalogos")
MARCAS_FALLBACK_DIR = os.getenv("MARCAS_FALLBACK_DIR", "../../tienda-online/marcas")

app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB

# ── Startup: crear tablas y sembrar datos ─────────────────────────────────────
@app.on_event("startup")
def startup():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        _seed_admin(db)
        _seed_products(db)
        db.commit()
        logger.info("Base de datos inicializada correctamente.")
    except Exception as exc:
        logger.error(f"Error en startup: {exc}")
        db.rollback()
    finally:
        db.close()


def _seed_admin(db: Session):
    admin_email = os.getenv("ADMIN_EMAIL", "admin@nomashumedades.com")
    admin_password = os.getenv("ADMIN_PASSWORD", "CambiarEnProduccion123!")
    if not db.query(User).filter(User.email == admin_email).first():
        admin = User(
            id=str(uuid.uuid4()),
            email=admin_email,
            nombre="Administrador",
            password_hash=hash_password(admin_password),
            rol="admin",
        )
        db.add(admin)
        logger.info(f"Usuario admin creado: {admin_email}")


def _seed_products(db: Session):
    if db.query(Product).count() > 0:
        return
    for data in SEED_PRODUCTS:
        p = Product(
            id=data["id"],
            nombre=data["nombre"],
            marca=data["marca"],
            categoria=data["categoria"],
            precio=data["precio"],
            descripcion=data["descripcion"],
            imagen=data["imagen"],
            stock=data["stock"],
            destacado=data.get("destacado", False),
            referencia=data.get("referencia"),
        )
        p.tags = data.get("tags", [])
        db.add(p)
    logger.info(f"{len(SEED_PRODUCTS)} productos sembrados en la base de datos.")


# ── Schemas Pydantic ──────────────────────────────────────────────────────────
class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=6)
    nombre: str = Field(..., min_length=2)
    telefono: str | None = None


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class CartItemRequest(BaseModel):
    producto_id: str
    cantidad: int = Field(..., gt=0, le=100)


class DeliveryMethod(BaseModel):
    metodo: str = Field(..., pattern="^(envio|recogida)$")
    direccion_envio: str | None = None
    telefono: str


class OrderCreateRequest(BaseModel):
    items: list[CartItemRequest]
    metodo_entrega: str = Field(..., pattern="^(envio|recogida)$")
    direccion_envio: str | None = None
    telefono: str
    metodo_pago: str = Field(default="transferencia", pattern="^(transferencia|sumup)$")


class ProductUpdateRequest(BaseModel):
    nombre: str | None = None
    precio: float | None = None
    descripcion: str | None = None
    imagen: str | None = None
    stock: int | None = None
    destacado: bool | None = None
    tags: list[str] | None = None


class ProductCreateRequest(BaseModel):
    id: str
    nombre: str
    marca: str
    categoria: str
    precio: float = Field(..., gt=0)
    descripcion: str
    imagen: str
    stock: int = Field(default=0, ge=0)
    tags: list[str] = []
    destacado: bool = False
    referencia: str | None = None


class PriceRequest(BaseModel):
    tipo: str = Field(..., pattern="^(condensacion|capilaridad|filtracion)$")
    m2: float = Field(..., gt=0, le=10000)
    altura: float = Field(..., gt=0, le=50)
    gravedad: str = Field(..., pattern="^(baja|media|alta)$")
    ubicacion: str = Field(..., pattern="^(interior|exterior)$")


# ── Health ────────────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {"status": "ok", "service": "nomashumedades"}


# ── Envíos ────────────────────────────────────────────────────────────────────
@app.get("/api/envio/tarifas")
def get_shipping_rates():
    """Devuelve la configuración de tarifas de envío para mostrar en el frontend."""
    return info_tarifas()


@app.post("/api/envio/calcular")
def calcular_coste_envio(
    metodo_entrega: str,
    subtotal: float,
    categorias: str = "",
    db: Session = Depends(get_db),
):
    """
    Calcula el coste de envío antes de confirmar el pedido.
    - metodo_entrega: 'envio' | 'recogida'
    - subtotal: importe del carrito sin IVA
    - categorias: categorías presentes en el carrito (separadas por coma)
    """
    if metodo_entrega == "recogida":
        return {"coste": 0.0, "gratis": True, "motivo": "Recogida gratuita en tienda"}

    cats = [c.strip() for c in categorias.split(",") if c.strip()]
    return calcular_envio(subtotal, cats)


# ── Auth ──────────────────────────────────────────────────────────────────────
@app.post("/api/auth/register", status_code=status.HTTP_201_CREATED)
def register(data: UserCreate, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == data.email).first():
        raise HTTPException(status_code=400, detail="Ya existe una cuenta con ese email")

    user = User(
        id=str(uuid.uuid4()),
        email=data.email,
        nombre=data.nombre,
        telefono=data.telefono,
        password_hash=hash_password(data.password),
        rol="user",
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token(user.id, user.rol)
    logger.info(f"Nuevo usuario registrado: {user.email}")
    return {
        "access_token": token,
        "token_type": "bearer",
        "email": user.email,
        "nombre": user.nombre,
        "rol": user.rol,
    }


@app.post("/api/auth/login")
def login(data: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email).first()
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Email o contraseña incorrectos")

    token = create_access_token(user.id, user.rol)
    logger.info(f"Login: {user.email}")
    return {
        "access_token": token,
        "token_type": "bearer",
        "email": user.email,
        "nombre": user.nombre,
        "rol": user.rol,
    }


@app.get("/api/auth/me")
def get_me(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "email": current_user.email,
        "nombre": current_user.nombre,
        "telefono": current_user.telefono,
        "rol": current_user.rol,
    }


# ── Márgenes por marca ────────────────────────────────────────────────────────
def _get_margins(db: Session) -> dict:
    """Devuelve {marca: margen_pct} para las 3 marcas."""
    rows = db.query(BrandMargin).all()
    margins = {"Valentine": 0.0, "Kerakoll": 0.0, "Higaltor": 0.0}
    for row in rows:
        if row.marca in margins:
            margins[row.marca] = row.margen
    return margins


def _apply_margin(product_dict: dict, margins: dict) -> dict:
    """Aplica el margen comercial al precio del producto."""
    margen = margins.get(product_dict.get("marca", ""), 0.0)
    if margen and product_dict.get("precio", 0) > 0:
        product_dict["precio"] = round(product_dict["precio"] * (1 + margen / 100), 2)
    return product_dict


# ── Productos ─────────────────────────────────────────────────────────────────
@app.get("/api/productos")
def get_products(
    categoria: str | None = None,
    marca: str | None = None,
    search: str | None = None,
    db: Session = Depends(get_db),
):
    q = db.query(Product)
    if categoria:
        q = q.filter(Product.categoria == categoria)
    if marca:
        q = q.filter(Product.marca.ilike(marca))
    products = q.all()

    if search:
        s = search.lower()
        products = [
            p for p in products
            if s in p.nombre.lower() or s in p.descripcion.lower()
        ]

    margins = _get_margins(db)
    return [_apply_margin(p.to_dict(), margins) for p in products]


@app.get("/api/productos/{product_id}")
def get_product(product_id: str, db: Session = Depends(get_db)):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    margins = _get_margins(db)
    return _apply_margin(product.to_dict(), margins)


@app.get("/api/categorias")
def get_categories():
    return SEED_CATEGORIES


@app.get("/api/productos-destacados")
def get_featured_products(db: Session = Depends(get_db)):
    margins = _get_margins(db)
    return [_apply_margin(p.to_dict(), margins) for p in db.query(Product).filter(Product.destacado == True).all()]


# ── Carrito ───────────────────────────────────────────────────────────────────
def _cart_response(user: User, db: Session):
    items_out = []
    total = 0.0
    for item in db.query(CartItem).filter(CartItem.user_id == user.id).all():
        product = db.query(Product).filter(Product.id == item.product_id).first()
        if product:
            subtotal = product.precio * item.cantidad
            items_out.append({
                "producto": product.to_dict(),
                "cantidad": item.cantidad,
                "subtotal": round(subtotal, 2),
            })
            total += subtotal
    return {"items": items_out, "total": round(total, 2)}


@app.get("/api/carrito")
def get_cart(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _cart_response(current_user, db)


@app.post("/api/carrito")
def add_to_cart(
    item: CartItemRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    product = db.query(Product).filter(Product.id == item.producto_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    existing = (
        db.query(CartItem)
        .filter(CartItem.user_id == current_user.id, CartItem.product_id == item.producto_id)
        .first()
    )
    if existing:
        existing.cantidad += item.cantidad
    else:
        db.add(CartItem(user_id=current_user.id, product_id=item.producto_id, cantidad=item.cantidad))

    db.commit()
    return {"message": "Producto añadido al carrito"}


@app.put("/api/carrito/{product_id}")
def update_cart_item(
    product_id: str,
    cantidad: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = (
        db.query(CartItem)
        .filter(CartItem.user_id == current_user.id, CartItem.product_id == product_id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Producto no está en el carrito")

    if cantidad <= 0:
        db.delete(item)
    else:
        item.cantidad = cantidad

    db.commit()
    return {"message": "Carrito actualizado"}


@app.delete("/api/carrito/{product_id}")
def remove_from_cart(
    product_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = (
        db.query(CartItem)
        .filter(CartItem.user_id == current_user.id, CartItem.product_id == product_id)
        .first()
    )
    if item:
        db.delete(item)
        db.commit()
    return {"message": "Producto eliminado del carrito"}


@app.delete("/api/carrito")
def clear_cart(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    db.query(CartItem).filter(CartItem.user_id == current_user.id).delete()
    db.commit()
    return {"message": "Carrito vaciado"}


# ── Pedidos ───────────────────────────────────────────────────────────────────
@app.post("/api/pedidos", status_code=status.HTTP_201_CREATED)
def create_order(
    data: OrderCreateRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if data.metodo_entrega == "envio" and not data.direccion_envio:
        raise HTTPException(status_code=400, detail="La dirección de envío es obligatoria para envío a domicilio")

    order_id = str(uuid.uuid4())
    subtotal = 0.0
    order_items = []
    categorias_en_carrito = []

    for item in data.items:
        product = db.query(Product).filter(Product.id == item.producto_id).first()
        if not product:
            raise HTTPException(status_code=400, detail=f"Producto {item.producto_id} no encontrado")
        importe = product.precio * item.cantidad
        subtotal += importe
        categorias_en_carrito.append(product.categoria)
        order_items.append(
            OrderItem(
                order_id=order_id,
                product_id=item.producto_id,
                nombre=product.nombre,
                cantidad=item.cantidad,
                precio=product.precio,
                subtotal=round(importe, 2),
            )
        )

    # Calcular coste de envío
    if data.metodo_entrega == "recogida":
        coste_envio = 0.0
    else:
        envio_info = calcular_envio(subtotal, categorias_en_carrito)
        coste_envio = envio_info["coste"]

    total = round(subtotal + coste_envio, 2)

    order = Order(
        id=order_id,
        user_id=current_user.id,
        total=total,
        coste_envio=coste_envio,
        metodo_entrega=data.metodo_entrega,
        direccion_envio=data.direccion_envio or "RECOGIDA EN TIENDA",
        telefono=data.telefono,
        metodo_pago=data.metodo_pago,
        estado="pendiente",
    )
    db.add(order)
    for oi in order_items:
        db.add(oi)

    db.query(CartItem).filter(CartItem.user_id == current_user.id).delete()
    db.commit()

    logger.info(f"Pedido creado: {order_id} — {current_user.email} — {total:.2f}€")

    # Emails en segundo plano (no bloquean la respuesta)
    items_data = [{"nombre": oi.nombre, "cantidad": oi.cantidad, "precio": oi.precio, "subtotal": oi.subtotal} for oi in order_items]
    background_tasks.add_task(
        enviar_confirmacion_pedido,
        email_cliente=current_user.email,
        nombre_cliente=current_user.nombre,
        order_id=order_id,
        items=items_data,
        subtotal=subtotal,
        coste_envio=coste_envio,
        total=total,
        metodo_entrega=data.metodo_entrega,
        direccion_envio=data.direccion_envio or "RECOGIDA EN TIENDA",
        metodo_pago=data.metodo_pago,
    )
    background_tasks.add_task(
        enviar_notificacion_admin,
        order_id=order_id,
        email_cliente=current_user.email,
        nombre_cliente=current_user.nombre,
        items=items_data,
        total=total,
        coste_envio=coste_envio,
        metodo_entrega=data.metodo_entrega,
        direccion_envio=data.direccion_envio or "RECOGIDA EN TIENDA",
        metodo_pago=data.metodo_pago,
    )

    return {
        "order_id": order_id,
        "subtotal": subtotal,
        "coste_envio": coste_envio,
        "total": total,
        "estado": "pendiente",
        "metodo_entrega": data.metodo_entrega,
        "message": "Pedido creado correctamente",
    }


@app.get("/api/pedidos")
def get_orders(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    orders = db.query(Order).filter(Order.user_id == current_user.id).order_by(Order.fecha.desc()).all()
    return [
        {
            "id": o.id,
            "subtotal": o.subtotal,
            "coste_envio": o.coste_envio,
            "total": o.total,
            "estado": o.estado,
            "fecha": o.fecha.isoformat(),
            "metodo_pago": o.metodo_pago,
            "metodo_entrega": o.metodo_entrega,
            "direccion_envio": o.direccion_envio,
            "items": [
                {"nombre": i.nombre, "cantidad": i.cantidad, "precio": i.precio, "subtotal": i.subtotal}
                for i in o.items
            ],
        }
        for o in orders
    ]


@app.get("/api/pedidos/{order_id}")
def get_order(
    order_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    order = (
        db.query(Order)
        .filter(Order.id == order_id, Order.user_id == current_user.id)
        .first()
    )
    if not order:
        raise HTTPException(status_code=404, detail="Pedido no encontrado")
    return {
        "id": order.id,
        "subtotal": order.subtotal,
        "coste_envio": order.coste_envio,
        "total": order.total,
        "estado": order.estado,
        "fecha": order.fecha.isoformat(),
        "metodo_pago": order.metodo_pago,
        "metodo_entrega": order.metodo_entrega,
        "direccion_envio": order.direccion_envio,
        "telefono": order.telefono,
        "items": [
            {"nombre": i.nombre, "cantidad": i.cantidad, "precio": i.precio, "subtotal": i.subtotal}
            for i in order.items
        ],
    }


# ── Pago SumUp ────────────────────────────────────────────────────────────────

@app.get("/api/sumup/config")
def sumup_config():
    """Informa al frontend si SumUp está habilitado y configurado."""
    return {"enabled": sumup_client.is_configured()}


@app.post("/api/pago/crear-sesion-sumup")
def crear_sesion_sumup(
    order_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Crea un Hosted Checkout en SumUp para un pedido existente.
    El pedido debe estar en estado 'pendiente' y pertenecer al usuario.
    """
    if not sumup_client.is_configured():
        raise HTTPException(status_code=503, detail="El pago con tarjeta no está disponible en este momento")

    order = db.query(Order).filter(Order.id == order_id, Order.user_id == current_user.id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Pedido no encontrado")
    if order.estado not in ("pendiente",):
        raise HTTPException(status_code=400, detail=f"El pedido ya está en estado '{order.estado}'")

    amount_iva = round(order.total * 1.21, 2)
    description = f"Pago NomasHumedades — {order_id[:8].upper()}"

    try:
        checkout = sumup_client.create_checkout(order_id, amount_iva, description)
    except Exception as exc:
        logger.error(f"Error creando checkout SumUp para pedido {order_id}: {exc}")
        raise HTTPException(status_code=502, detail="Error al conectar con la pasarela de pago. Inténtalo de nuevo.")

    # Guardar checkout_id en el pedido (idempotencia)
    order.sumup_checkout_id = checkout["checkout_id"]
    db.commit()

    logger.info(f"Sesión SumUp creada para pedido {order_id}: {checkout['checkout_id']}")
    return {
        "checkout_id": checkout["checkout_id"],
        "checkout_url": checkout["checkout_url"],
        "amount": amount_iva,
        "currency": "EUR",
        "order_id": order_id,
    }


@app.get("/api/pago/sumup-status/{order_id}")
def sumup_payment_status(order_id: str, db: Session = Depends(get_db)):
    """
    Polling del estado del pago SumUp.
    No requiere auth — el UUID del pedido actúa como token de acceso.
    Comprueba primero nuestra DB (si ya fue marcado por webhook) y luego la API de SumUp.
    """
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Pedido no encontrado")

    # Si ya está pagado en nuestra DB (vía webhook u otro camino), devolver directamente
    if order.estado == "pagado":
        return {"status": "paid", "order_id": order_id}
    if order.estado == "cancelado":
        return {"status": "failed", "order_id": order_id}

    # Consultar estado en SumUp si tenemos el checkout_id
    if order.sumup_checkout_id:
        sumup_status = sumup_client.get_checkout_status(order.sumup_checkout_id)
        if sumup_status == "PAID":
            # Confirmar pago desde polling (idempotente)
            _confirm_sumup_payment(order, db)
            return {"status": "paid", "order_id": order_id}
        if sumup_status in ("FAILED", "EXPIRED"):
            return {"status": "failed", "order_id": order_id}

    return {"status": "pending", "order_id": order_id}


@app.get("/api/sumup/return", response_class=HTMLResponse)
def sumup_return_url(
    order_id: str,
    popup: int = 0,
    db: Session = Depends(get_db),
):
    """
    Return URL al que SumUp redirige dentro del popup tras el pago.
    Confirma el pago, cierra el popup y notifica a la ventana principal via postMessage.
    """
    order = db.query(Order).filter(Order.id == order_id).first()
    status = "pending"

    if order:
        # Intentar confirmar por consulta a SumUp
        if order.sumup_checkout_id:
            sumup_status = sumup_client.get_checkout_status(order.sumup_checkout_id)
            if sumup_status == "PAID" and order.estado == "pendiente":
                _confirm_sumup_payment(order, db)
                status = "paid"
            elif order.estado == "pagado":
                status = "paid"
        elif order.estado == "pagado":
            status = "paid"

    return HTMLResponse(content=sumup_client.popup_close_html(order_id, status))


@app.post("/api/sumup/webhook", status_code=204)
async def sumup_webhook(request: Request, db: Session = Depends(get_db)):
    """
    Webhook de SumUp — confirmación de pago asíncrona (respaldo al return URL).
    Verifica firma HMAC-SHA256 si SUMUP_WEBHOOK_SECRET está configurado.
    Idempotente: si el pedido ya está pagado no hace nada.
    """
    body = await request.body()
    signature = request.headers.get("X-SumUp-Signature", "")

    if not sumup_client.verify_webhook_signature(body, signature):
        logger.warning("Firma de webhook SumUp inválida — rechazado")
        raise HTTPException(status_code=401, detail="Firma inválida")

    try:
        data = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="JSON inválido")

    event_type = data.get("event_type", "")
    payload = data.get("payload", {})

    if event_type == "checkout.status.updated" and payload.get("status", "").upper() == "PAID":
        checkout_id = payload.get("checkout_id", "")
        order = db.query(Order).filter(Order.sumup_checkout_id == checkout_id).first()
        if order and order.estado == "pendiente":
            _confirm_sumup_payment(order, db)
            logger.info(f"Pago SumUp confirmado vía webhook: pedido {order.id}")

    return  # 204 No Content


def _confirm_sumup_payment(order: Order, db: Session):
    """
    Marca el pedido como pagado. Idempotente: comprueba estado antes de cambiar.
    Llama al email de cambio de estado en segundo plano (no bloquea).
    """
    if order.estado != "pendiente":
        return  # Ya procesado

    order.estado = "pagado"
    db.commit()
    logger.info(f"Pedido {order.id} marcado como PAGADO (SumUp)")

    # Email de confirmación de pago (en segundo plano)
    from email_service import enviar_cambio_estado
    try:
        enviar_cambio_estado(
            email_cliente=order.user.email,
            nombre_cliente=order.user.nombre,
            order_id=order.id,
            estado="pagado",
        )
    except Exception as exc:
        logger.error(f"Error enviando email de confirmación de pago: {exc}")


# ── Análisis de Humedad (por foto con IA) ─────────────────────────────────────
@app.post("/api/analyze")
async def analyze(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="Tipo de archivo no soportado. Use JPEG, PNG o WebP.")

    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="Imagen demasiado grande (máx 10 MB).")

    ext = (file.filename or "image.jpg").rsplit(".", 1)[-1].lower()
    filepath = os.path.join(UPLOADS_DIR, f"{uuid.uuid4()}.{ext}")
    with open(filepath, "wb") as f:
        f.write(contents)

    try:
        result = classify_humidity(contents)
    except Exception as exc:
        logger.exception("Error al clasificar imagen")
        raise HTTPException(status_code=500, detail=f"Error en clasificación IA: {exc}")

    tipo = result["tipo"]
    confianza = result["confianza"]

    # Nivel de gravedad estimado (heurístico por tipo + confianza IA)
    nivel = nivel_desde_confianza_ia(tipo, confianza)

    # Enriquecer con info del tipo y nivel (sin precio)
    result["nivel_gravedad"] = nivel
    result["nivel_info"] = NIVEL_INFO[nivel]
    result["origen"] = "foto_ia"
    result.update({k: v for k, v in TIPO_INFO[tipo].items() if k != "ids_recomendados"})

    # Productos recomendados (sin precio en el resultado del análisis)
    recommended_ids = HUMIDITY_RECOMMENDATIONS.get(tipo, [])
    result["productos_recomendados"] = [
        {k: v for k, v in p.to_dict().items() if k != "precio"}
        for p in db.query(Product).filter(Product.id.in_(recommended_ids)).all()
    ]

    logger.info(f"Análisis foto: {tipo} — nivel {nivel} ({confianza:.0%} confianza IA)")
    return result


# ── Diagnóstico por cuestionario (sin foto, basado en reglas) ─────────────────
class DiagnosticoRequest(BaseModel):
    zona: str = Field(..., pattern="^(interior_pared|exterior_pared|suelo|techo|terraza|sotano)$")
    sintomas: list[str]
    posicion_muro: str = Field(..., pattern="^(base_muro|zona_media|parte_alta|multiple)$")
    empeora_lluvia: str = Field(..., pattern="^(si|no|aveces)$")


@app.post("/api/diagnostico")
def diagnostico_por_preguntas(
    data: DiagnosticoRequest,
    db: Session = Depends(get_db),
):
    """
    Diagnóstico de humedad basado en cuestionario (sin IA, sin foto).
    Devuelve tipo, nivel de gravedad, causas, pasos de solución y productos recomendados.
    Los productos NO incluyen precio (el análisis es orientativo, no comercial).
    """
    sintomas_validos = {
        "manchas_oscuras", "salitre", "pintura_levantada",
        "olor_humedad", "condensacion_ventanas", "grietas",
    }
    sintomas_limpios = [s for s in data.sintomas if s in sintomas_validos]

    resultado = diagnosticar(
        zona=data.zona,
        sintomas=sintomas_limpios,
        posicion_muro=data.posicion_muro,
        empeora_lluvia=data.empeora_lluvia,
    )

    # Enriquecer productos recomendados (sin precio)
    ids = resultado.pop("ids_recomendados", [])
    resultado["productos_recomendados"] = [
        {k: v for k, v in p.to_dict().items() if k != "precio"}
        for p in db.query(Product).filter(Product.id.in_(ids)).all()
    ]

    logger.info(f"Diagnóstico cuestionario: {resultado['tipo']} — nivel {resultado['nivel_gravedad']}")
    return resultado


@app.post("/api/calculate")
def calculate(data: PriceRequest):
    result = calculate_price(
        tipo=data.tipo,
        m2=data.m2,
        altura=data.altura,
        gravedad=data.gravedad,
        ubicacion=data.ubicacion,
    )
    return result


# ── Admin — Productos ─────────────────────────────────────────────────────────
@app.get("/api/admin/productos")
def admin_get_products(
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return [p.to_dict() for p in db.query(Product).all()]


@app.post("/api/admin/productos", status_code=status.HTTP_201_CREATED)
def admin_create_product(
    data: ProductCreateRequest,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if db.query(Product).filter(Product.id == data.id).first():
        raise HTTPException(status_code=400, detail="Ya existe un producto con ese ID")

    p = Product(
        id=data.id,
        nombre=data.nombre,
        marca=data.marca,
        categoria=data.categoria,
        precio=data.precio,
        descripcion=data.descripcion,
        imagen=data.imagen,
        stock=data.stock,
        destacado=data.destacado,
        referencia=data.referencia,
    )
    p.tags = data.tags
    db.add(p)
    db.commit()
    db.refresh(p)
    logger.info(f"Producto creado por admin: {p.id}")
    return p.to_dict()


@app.put("/api/admin/productos/{product_id}")
def admin_update_product(
    product_id: str,
    updates: ProductUpdateRequest,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    data = updates.model_dump(exclude_none=True)
    if "tags" in data:
        product.tags = data.pop("tags")
    for key, value in data.items():
        setattr(product, key, value)

    db.commit()
    db.refresh(product)
    logger.info(f"Producto actualizado por admin: {product_id}")
    return product.to_dict()


@app.delete("/api/admin/productos/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
def admin_delete_product(
    product_id: str,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    db.delete(product)
    db.commit()
    logger.info(f"Producto eliminado por admin: {product_id}")


# ── Admin — Márgenes por marca ───────────────────────────────────────────────

class MargenesBulkRequest(BaseModel):
    Valentine: float = Field(default=0.0, ge=0, le=500)
    Kerakoll: float = Field(default=0.0, ge=0, le=500)
    Higaltor: float = Field(default=0.0, ge=0, le=500)


@app.get("/api/admin/margenes")
def admin_get_margenes(
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Devuelve el porcentaje de margen configurado para cada marca."""
    return _get_margins(db)


@app.put("/api/admin/margenes")
def admin_set_margenes(
    data: MargenesBulkRequest,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Guarda los márgenes de las 3 marcas de una vez."""
    valores = {"Valentine": data.Valentine, "Kerakoll": data.Kerakoll, "Higaltor": data.Higaltor}
    for marca, margen in valores.items():
        row = db.query(BrandMargin).filter(BrandMargin.marca == marca).first()
        if row:
            row.margen = margen
        else:
            db.add(BrandMargin(marca=marca, margen=margen))
    db.commit()
    logger.info(f"Márgenes actualizados: {valores}")
    return valores


# ── Admin — Pedidos ───────────────────────────────────────────────────────────
@app.get("/api/admin/pedidos")
def admin_get_orders(
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    orders = db.query(Order).order_by(Order.fecha.desc()).all()
    return [
        {
            "id": o.id,
            "user_email": o.user.email,
            "total": o.total,
            "estado": o.estado,
            "fecha": o.fecha.isoformat(),
            "metodo_pago": o.metodo_pago,
            "direccion_envio": o.direccion_envio,
            "items_count": len(o.items),
        }
        for o in orders
    ]


@app.put("/api/admin/pedidos/{order_id}/estado")
def admin_update_order_status(
    order_id: str,
    estado: str,
    background_tasks: BackgroundTasks,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    valid_states = {"pendiente", "pagado", "preparando", "enviado", "entregado", "cancelado"}
    if estado not in valid_states:
        raise HTTPException(status_code=400, detail=f"Estado inválido. Valores válidos: {valid_states}")

    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Pedido no encontrado")

    order.estado = estado
    db.commit()
    logger.info(f"Pedido {order_id} → {estado} (por admin)")

    # Notificar al cliente del cambio de estado
    background_tasks.add_task(
        enviar_cambio_estado,
        email_cliente=order.user.email,
        nombre_cliente=order.user.nombre,
        order_id=order_id,
        estado=estado,
    )

    return {"order_id": order_id, "estado": estado}


# ── Admin — Subir imágenes ────────────────────────────────────────────────────
@app.post("/api/admin/upload-image")
async def upload_image(
    file: UploadFile = File(...),
    _: User = Depends(require_admin),
):
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="Tipo de archivo no soportado")

    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="Imagen demasiado grande (máx 10 MB)")

    ext = (file.filename or "image.jpg").rsplit(".", 1)[-1].lower()
    filename = f"{uuid.uuid4()}.{ext}"
    filepath = os.path.join(UPLOADS_DIR, filename)
    with open(filepath, "wb") as f:
        f.write(contents)

    return {"filename": filename, "url": f"/uploads/{filename}"}


# ── Admin — Importar productos desde PDFs ─────────────────────────────────────

class ImportarConfirmarRequest(BaseModel):
    marca: str
    productos: list[dict]


@app.get("/api/admin/importar-productos/preview")
def importar_preview(
    marca: str = "todos",
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    Extrae productos de los PDFs de proveedores sin guardar nada.
    marca: 'valentine' | 'kerakoll' | 'higaltor' | 'todos'
    Compara con la BD para identificar nuevos vs. ya existentes.
    """
    marcas_dir = os.path.abspath(MARCAS_DIR)
    fallback_dir = os.path.abspath(MARCAS_FALLBACK_DIR)

    if marca == "todos":
        all_productos = []
        try:
            by_marca = pdf_importer.importar_todos(marcas_dir, fallback_dir)
            for m, prods in by_marca.items():
                all_productos.extend(prods)
        except Exception as exc:
            raise HTTPException(status_code=500, detail=str(exc))
    else:
        if marca not in ("valentine", "kerakoll", "higaltor"):
            raise HTTPException(status_code=400, detail="marca debe ser 'valentine', 'kerakoll', 'higaltor' o 'todos'")
        try:
            all_productos = pdf_importer.importar_marca(marca, marcas_dir, fallback_dir)
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc))
        except RuntimeError as exc:
            raise HTTPException(status_code=500, detail=str(exc))

    # Classify: new vs. existing (by referencia)
    existing_refs = {
        p.referencia
        for p in db.query(Product).all()
        if p.referencia
    }

    for p in all_productos:
        p["es_nuevo"] = p.get("referencia") not in existing_refs

    nuevos = sum(1 for p in all_productos if p["es_nuevo"])
    logger.info(f"Preview importación ({marca}): {len(all_productos)} productos, {nuevos} nuevos")

    return {
        "total": len(all_productos),
        "nuevos": nuevos,
        "existentes": len(all_productos) - nuevos,
        "productos": all_productos,
    }


@app.post("/api/admin/importar-productos/confirmar")
def importar_confirmar(
    data: ImportarConfirmarRequest,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    Inserta los productos indicados en la base de datos.
    Omite los que ya tienen la misma referencia.
    """
    if data.marca not in ("valentine", "kerakoll", "higaltor", "todos"):
        raise HTTPException(status_code=400, detail="Marca inválida")

    existing_refs = {
        p.referencia
        for p in db.query(Product).all()
        if p.referencia
    }
    existing_ids = {p.id for p in db.query(Product).all()}

    importados = 0
    omitidos = 0

    for prod_data in data.productos:
        ref = prod_data.get("referencia")
        if ref and ref in existing_refs:
            omitidos += 1
            continue

        # Ensure unique id
        prod_id = prod_data.get("id", "")
        if prod_id in existing_ids:
            prod_id = f"{prod_id}-{importados}"
        existing_ids.add(prod_id)

        p = Product(
            id=prod_id,
            nombre=prod_data.get("nombre", "Sin nombre"),
            marca=prod_data.get("marca", ""),
            categoria=prod_data.get("categoria", "general"),
            precio=float(prod_data.get("precio", 0)),
            descripcion=prod_data.get("descripcion", ""),
            imagen=prod_data.get("imagen", "/img/placeholder.jpg"),
            stock=int(prod_data.get("stock", 50)),
            destacado=bool(prod_data.get("destacado", False)),
            referencia=ref,
        )
        p.tags = prod_data.get("tags", [])
        db.add(p)
        importados += 1
        if ref:
            existing_refs.add(ref)

    db.commit()
    logger.info(f"Importación confirmada: {importados} insertados, {omitidos} omitidos")
    return {"importados": importados, "omitidos": omitidos}


# ── Admin — Scraper web (actualizar imágenes desde webs de fabricantes) ────────

class ActualizarImagenesRequest(BaseModel):
    marca: str = Field(..., pattern="^(Valentine|Kerakoll|Higaltor|todas)$")
    solo_sin_imagen: bool = True


@app.post("/api/admin/actualizar-imagenes")
def admin_actualizar_imagenes(
    data: ActualizarImagenesRequest,
    background_tasks: BackgroundTasks,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    Lanza actualización de imágenes desde las webs de los fabricantes.
    Para cada producto sin imagen (o todos si solo_sin_imagen=False),
    busca la imagen en la web oficial y la descarga.
    Se ejecuta en segundo plano; devuelve inmediatamente el número de productos a procesar.
    """
    PLACEHOLDER = {"/img/placeholder.jpg", "/img/placeholder.svg", "", None}

    if data.marca == "todas":
        marcas = ["Valentine", "Kerakoll", "Higaltor"]
    else:
        marcas = [data.marca]

    productos_a_procesar = []
    for m in marcas:
        prods = db.query(Product).filter(Product.marca == m).all()
        for p in prods:
            if data.solo_sin_imagen and p.imagen not in PLACEHOLDER:
                continue
            productos_a_procesar.append({
                "id": p.id,
                "nombre": p.nombre,
                "referencia": p.referencia or "",
                "imagen": p.imagen,
                "marca": p.marca,
            })

    if not productos_a_procesar:
        return {"mensaje": "No hay productos a procesar", "total": 0}

    uploads_dir = os.path.abspath(UPLOADS_DIR)

    def _run_scraper():
        """Tarea en segundo plano: actualiza imágenes y guarda en DB."""
        db2 = SessionLocal()
        try:
            actualizados = 0
            for prod_data in productos_a_procesar:
                result = web_scraper.actualizar_imagen_producto(
                    product_id=prod_data["id"],
                    marca=prod_data["marca"],
                    nombre=prod_data["nombre"],
                    referencia=prod_data["referencia"],
                    uploads_dir=uploads_dir,
                )
                if result.actualizado and result.imagen:
                    p = db2.query(Product).filter(Product.id == result.product_id).first()
                    if p:
                        p.imagen = result.imagen
                        actualizados += 1
            db2.commit()
            logger.info(f"Scraper finalizado: {actualizados}/{len(productos_a_procesar)} imágenes actualizadas")
        except Exception as exc:
            logger.error(f"Error en scraper de imágenes: {exc}")
            db2.rollback()
        finally:
            db2.close()

    background_tasks.add_task(_run_scraper)

    logger.info(f"Scraper iniciado en segundo plano: {len(productos_a_procesar)} productos")
    return {
        "mensaje": f"Actualización iniciada en segundo plano para {len(productos_a_procesar)} productos",
        "total": len(productos_a_procesar),
    }


@app.get("/api/admin/actualizar-imagenes/estado")
def admin_estado_imagenes(
    marca: str = "todas",
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Devuelve estadísticas de imágenes por marca."""
    PLACEHOLDER = {"/img/placeholder.jpg", "/img/placeholder.svg", "", None}
    stats = {}
    marcas = ["Valentine", "Kerakoll", "Higaltor"] if marca == "todas" else [marca]
    for m in marcas:
        total = db.query(Product).filter(Product.marca == m).count()
        sin_imagen = sum(
            1 for p in db.query(Product).filter(Product.marca == m).all()
            if p.imagen in PLACEHOLDER
        )
        stats[m] = {"total": total, "con_imagen": total - sin_imagen, "sin_imagen": sin_imagen}
    return stats
