import json
import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from database import Base


def _new_uuid():
    return str(uuid.uuid4())


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=_new_uuid)
    email = Column(String, unique=True, index=True, nullable=False)
    nombre = Column(String, nullable=False)
    telefono = Column(String, nullable=True)
    password_hash = Column(String, nullable=False)
    rol = Column(String, default="user")  # "user" | "admin"
    created_at = Column(DateTime, default=datetime.utcnow)

    cart_items = relationship("CartItem", back_populates="user", cascade="all, delete-orphan")
    orders = relationship("Order", back_populates="user")


class Product(Base):
    __tablename__ = "products"

    id = Column(String, primary_key=True)
    nombre = Column(String, nullable=False)
    marca = Column(String, nullable=False)
    categoria = Column(String, nullable=False)
    precio = Column(Float, nullable=False)
    descripcion = Column(Text, nullable=False)
    imagen = Column(String, nullable=False)
    stock = Column(Integer, default=0)
    _tags = Column("tags", Text, default="[]")
    destacado = Column(Boolean, default=False)
    referencia = Column(String, nullable=True)

    @property
    def tags(self):
        return json.loads(self._tags or "[]")

    @tags.setter
    def tags(self, value):
        self._tags = json.dumps(value or [])

    def to_dict(self):
        return {
            "id": self.id,
            "nombre": self.nombre,
            "marca": self.marca,
            "categoria": self.categoria,
            "precio": self.precio,
            "descripcion": self.descripcion,
            "imagen": self.imagen,
            "stock": self.stock,
            "tags": self.tags,
            "destacado": self.destacado,
            "referencia": self.referencia,
        }


class CartItem(Base):
    __tablename__ = "cart_items"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    product_id = Column(String, ForeignKey("products.id"), nullable=False)
    cantidad = Column(Integer, nullable=False, default=1)

    user = relationship("User", back_populates="cart_items")
    product = relationship("Product")


class Order(Base):
    __tablename__ = "orders"

    id = Column(String, primary_key=True, default=_new_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    subtotal = Column(Float, nullable=False, default=0.0)
    coste_envio = Column(Float, nullable=False, default=0.0)
    total = Column(Float, nullable=False)
    metodo_entrega = Column(String, default="envio")   # "envio" | "recogida"
    direccion_envio = Column(String, nullable=False)
    telefono = Column(String, nullable=False)
    metodo_pago = Column(String, default="transferencia")
    sumup_checkout_id = Column(String, nullable=True)   # ID del checkout en SumUp
    estado = Column(String, default="pendiente")
    fecha = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="orders")
    items = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan")


class OrderItem(Base):
    __tablename__ = "order_items"

    id = Column(Integer, primary_key=True, autoincrement=True)
    order_id = Column(String, ForeignKey("orders.id"), nullable=False)
    product_id = Column(String, nullable=False)
    nombre = Column(String, nullable=False)
    cantidad = Column(Integer, nullable=False)
    precio = Column(Float, nullable=False)
    subtotal = Column(Float, nullable=False)

    order = relationship("Order", back_populates="items")


class BrandMargin(Base):
    """Porcentaje de margen comercial por marca. Se aplica al mostrar precios en la tienda."""
    __tablename__ = "brand_margins"

    marca = Column(String, primary_key=True)  # 'Valentine' | 'Kerakoll' | 'Higaltor'
    margen = Column(Float, nullable=False, default=0.0)  # % p.ej. 25.0 = +25%


class StoreSetting(Base):
    """Configuración editable de la tienda. Campos sensibles (IBAN, SMTP) se almacenan cifrados."""
    __tablename__ = "store_settings"

    key = Column(String, primary_key=True)
    value = Column(Text, nullable=True, default="")
    encrypted = Column(Boolean, default=False)  # True → valor cifrado con Fernet
