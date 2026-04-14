# No+Humedades — Tienda Online

Tienda online profesional para **nomashumedades.com**, distribuidor de materiales de construcción en Cádiz.

**Marcas distribuidas:** Valentine (pinturas) · Kerakoll (morteros/adhesivos) · Higaltor (impermeabilizantes)

---

## Arquitectura

```
ecommerce-store/
├── backend/                    # API REST — Python / FastAPI
│   ├── main.py                 # Todos los endpoints
│   ├── models.py               # Modelos ORM (User, Product, Order…)
│   ├── database.py             # SQLite + SQLAlchemy
│   ├── auth.py                 # JWT Bearer tokens + bcrypt
│   ├── seed_data.py            # Catálogo inicial (22 productos)
│   ├── shipping.py             # Cálculo de costes de envío
│   ├── email_service.py        # Emails automáticos (SMTP)
│   ├── sumup.py                # Integración pago con tarjeta (SumUp)
│   ├── diagnostic.py           # Motor de diagnóstico de humedades
│   ├── pdf_importer.py         # Importador de productos desde PDFs
│   ├── ai_model.py             # Modelo CLIP (análisis por foto)
│   ├── requirements.txt
│   └── .env                    # Variables de entorno (NO subir a git)
│
├── frontend/                   # Next.js 14 (Pages Router)
│   ├── pages/
│   │   ├── index.js            # Home
│   │   ├── catalog.js          # Catálogo con filtros
│   │   ├── product/[id].js     # Ficha de producto
│   │   ├── cart.js             # Carrito + checkout
│   │   ├── auth.js             # Login / Registro
│   │   ├── analysis.js         # Diagnóstico (cuestionario + foto IA)
│   │   ├── mis-pedidos.js      # Historial de pedidos
│   │   ├── pedido/[id].js      # Detalle de pedido + seguimiento
│   │   └── admin.js            # Panel de administración
│   ├── components/
│   │   └── SumUpCheckout.js    # Widget de pago SumUp (popup)
│   ├── lib/
│   │   └── api.js              # apiFetch, getToken, isLoggedIn, isAdmin…
│   ├── styles/globals.css
│   └── .env.local              # Variables públicas del frontend
│
└── tienda-online/
    └── marcas/                 # PDFs de tarifas de proveedores
        ├── VALENTINE_Tarifa General_Marzo 2025.pdf
        ├── Tarifa Kerakoll - enero 2026.pdf
        └── CATÁLOGO 2024 peq.pdf   (Higaltor)
```

---

## Arranque en desarrollo

### 1. Backend

```bash
cd backend

# Instalar dependencias (Python 3.11+)
pip install -r requirements.txt

# Editar variables de entorno
# (ya existe .env con valores de desarrollo)

# Arrancar servidor (con recarga automática)
uvicorn main:app --reload
# → http://localhost:8000
# → Swagger UI: http://localhost:8000/docs
```

Al arrancar por primera vez se crea `nomashumedades.db` (SQLite) y se cargan 22 productos de ejemplo.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
# → http://localhost:3000
```

### 3. Variables de entorno

**`backend/.env`** (editar antes de usar en producción):

| Variable | Descripción | Valor por defecto |
|---|---|---|
| `SECRET_KEY` | Clave JWT — generar aleatoria | _cambiar_ |
| `DATABASE_URL` | URL base de datos | `sqlite:///./nomashumedades.db` |
| `ADMIN_EMAIL` | Email del admin inicial | `admin@nomashumedades.com` |
| `ADMIN_PASSWORD` | Contraseña del admin | _cambiar_ |
| `ALLOWED_ORIGINS` | CORS (separar con coma) | `http://localhost:3000` |
| `SMTP_HOST` | Servidor SMTP | (vacío = emails desactivados) |
| `SMTP_USER` / `SMTP_PASSWORD` | Credenciales SMTP | — |
| `EMAIL_ADMIN` | Email donde llegan avisos de pedidos | — |
| `SUMUP_ENABLED` | Activar pago con tarjeta | `false` |
| `SUMUP_API_KEY` | API Key de SumUp | — |
| `SUMUP_MERCHANT_CODE` | Código de comerciante SumUp | — |
| `MARCAS_DIR` | Ruta a los PDFs de proveedores | `../../tienda-online/marcas` |
| `IBAN` | IBAN para transferencias | — |
| `ENVIO_GRATIS_DESDE` | Importe mínimo para envío gratis | `75.0` |
| `PRECIO_ENVIO_ESTANDAR` | Tarifa envío normal | `6.95` |
| `PRECIO_ENVIO_PESADO` | Tarifa envío pesado (morteros…) | `12.95` |

**`frontend/.env.local`**:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_IBAN=ES00 0000 0000 0000 0000 0000
NEXT_PUBLIC_TELEFONO=+34 956 XXX XXX
```

---

## API — Endpoints principales

### Autenticación
| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/api/auth/register` | Registro de usuario |
| `POST` | `/api/auth/login` | Login → devuelve JWT |

Todas las rutas protegidas requieren `Authorization: Bearer <token>`.

### Catálogo
| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/productos` | Listar (filtros: marca, categoria, search) |
| `GET` | `/api/productos/{id}` | Detalle de producto |
| `GET` | `/api/productos-destacados` | Solo destacados |
| `GET` | `/api/categorias` | Listar categorías |

### Carrito y pedidos
| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/carrito` | Ver carrito (auth) |
| `POST` | `/api/carrito` | Añadir producto (auth) |
| `PUT` | `/api/carrito/{id}` | Cambiar cantidad (auth) |
| `DELETE` | `/api/carrito/{id}` | Eliminar línea (auth) |
| `DELETE` | `/api/carrito` | Vaciar carrito (auth) |
| `GET` | `/api/envio/calcular` | Calcular coste de envío |
| `POST` | `/api/pedidos` | Crear pedido (auth) |
| `GET` | `/api/pedidos` | Mis pedidos (auth) |
| `GET` | `/api/pedidos/{id}` | Detalle de pedido (auth) |

### Pago con tarjeta (SumUp)
| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/sumup/config` | ¿SumUp activo? |
| `POST` | `/api/pago/crear-sesion-sumup` | Crea checkout en SumUp |
| `GET` | `/api/pago/sumup-status/{order_id}` | Consulta estado |
| `POST` | `/api/sumup/webhook` | Webhook de SumUp (HMAC-SHA256) |

### Diagnóstico de humedades
| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/api/diagnostico` | Diagnóstico por cuestionario (sin IA) |
| `POST` | `/api/analyze` | Diagnóstico por foto (modelo CLIP) |

### Admin (requiere rol admin)
| Método | Ruta | Descripción |
|---|---|---|
| `GET/POST` | `/api/admin/productos` | Gestión de productos |
| `PUT/DELETE` | `/api/admin/productos/{id}` | Editar / eliminar |
| `GET` | `/api/admin/pedidos` | Ver todos los pedidos |
| `PUT` | `/api/admin/pedidos/{id}/estado` | Cambiar estado |
| `POST` | `/api/admin/upload-image` | Subir imagen de producto |
| `GET` | `/api/admin/importar-productos/preview` | Preview importación PDF |
| `POST` | `/api/admin/importar-productos/confirmar` | Confirmar importación |

---

## Funcionalidades implementadas

### 🔐 Autenticación segura
- Contraseñas hasheadas con **bcrypt** (passlib)
- Tokens **JWT** con expiración — patrón Bearer
- Roles: `cliente` / `admin`

### 🛒 Tienda completa
- Carrito persistente en base de datos (SQLite)
- Envío a domicilio (tarifa estándar/pesada) o recogida en tienda
- Envío **gratis desde 75 €** (configurable en `.env`)
- Métodos de pago: transferencia bancaria + tarjeta (SumUp)
- Historial de pedidos con seguimiento de estado

### 💳 Pago con tarjeta (SumUp Hosted Checkout)
- Popup de pago integrado
- Estado verificado por polling + webhook HMAC-SHA256
- Idempotente: nunca marca un pedido pagado dos veces
- Activar: `SUMUP_ENABLED=true` en `.env` + credenciales de SumUp

### 📧 Emails automáticos
- Confirmación de pedido (con datos de transferencia si aplica)
- Notificación al admin de nuevo pedido
- Aviso al cliente en cada cambio de estado (pagado, preparando, enviado…)
- Se desactivan automáticamente si `SMTP_HOST` está vacío

### 🩺 Diagnóstico de humedades
- **Modo cuestionario**: 4 preguntas → árbol de reglas → tipo + nivel de gravedad
- **Modo foto IA**: modelo CLIP (openai/clip-vit-base-patch32) → clasificación automática
- Los resultados muestran causas, soluciones y productos recomendados — **sin precio**

### 📦 Importador de catálogo desde PDFs
- Panel admin → pestaña "Importar PDFs"
- **Valentine**: 81 productos con precio (tarifa Marzo 2025)
- **Kerakoll**: 117 productos con precio (tarifa Enero 2026)
- **Higaltor**: 34 referencias sin precio — mostrar "Consultar precio" en tienda
- Al reimportar, las referencias ya existentes se omiten automáticamente

---

## Despliegue en producción (VPS Ubuntu)

### Prerrequisitos
```bash
sudo apt update && sudo apt install -y python3.11 python3-pip python3.11-venv nodejs npm nginx
```

### Backend
```bash
cd /var/www/nomashumedades/backend
python3.11 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
nano .env    # editar con valores reales de producción
```

### Frontend
```bash
cd /var/www/nomashumedades/frontend
npm ci
npm run build
```

### Servicios systemd
```bash
sudo cp deploy/backend.service  /etc/systemd/system/
sudo cp deploy/frontend.service /etc/systemd/system/
# Editar TU_DOMINIO.COM en ambos archivos
sudo systemctl daemon-reload
sudo systemctl enable --now backend frontend
```

### nginx + HTTPS
```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/nomashumedades
# Editar TU_DOMINIO.COM en el fichero
sudo ln -s /etc/nginx/sites-available/nomashumedades /etc/nginx/sites-enabled/
sudo nginx -t && sudo nginx -s reload

# Certificado SSL gratuito
sudo certbot --nginx -d nomashumedades.com -d www.nomashumedades.com
```

### ⚠️ Cambiar antes de salir a producción
1. `SECRET_KEY` → clave aleatoria de 32+ chars: `python -c "import secrets; print(secrets.token_hex(32))"`
2. `ADMIN_PASSWORD` → contraseña fuerte
3. `ALLOWED_ORIGINS` → dominio real (ej. `https://nomashumedades.com`)
4. `BACKEND_URL` / `FRONTEND_URL` → URLs reales
5. `SUMUP_API_KEY` → clave live (en lugar de `sk_test_`)
6. SMTP real para emails

---

## Primer acceso al panel admin

El usuario administrador se crea automáticamente al primer arranque:
- **Email:** valor de `ADMIN_EMAIL` en `.env`
- **Contraseña:** valor de `ADMIN_PASSWORD` en `.env`

Panel de administración → `http://localhost:3000/admin`
