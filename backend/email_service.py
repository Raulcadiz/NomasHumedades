"""
Servicio de email para confirmaciones de pedido.
Usa SMTP estándar (Gmail, IONOS, cualquier proveedor).
Si SMTP_HOST no está configurado, los emails se omiten sin error.
"""
import logging
import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

logger = logging.getLogger(__name__)

# ── Configuración SMTP desde .env ────────────────────────────────────────────
SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
EMAIL_FROM = os.getenv("EMAIL_FROM", SMTP_USER)
EMAIL_ADMIN = os.getenv("EMAIL_ADMIN", "")
TIENDA_NOMBRE = os.getenv("TIENDA_NOMBRE", "NomasHumedades")
TIENDA_TELEFONO = os.getenv("TIENDA_TELEFONO", "+34 XXX XXX XXX")
IBAN = os.getenv("IBAN", "ES00 0000 0000 0000 0000 0000")


def _send(to: str, subject: str, html: str):
    """Envía un email. Si SMTP no está configurado, lo registra en log y continúa."""
    if not SMTP_HOST or not SMTP_USER:
        logger.info(f"[Email simulado] Para: {to} | Asunto: {subject}")
        return

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"{TIENDA_NOMBRE} <{EMAIL_FROM}>"
    msg["To"] = to
    msg.attach(MIMEText(html, "html", "utf-8"))

    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as server:
            server.ehlo()
            server.starttls()
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.sendmail(EMAIL_FROM, to, msg.as_string())
        logger.info(f"Email enviado a {to}: {subject}")
    except Exception as exc:
        logger.error(f"Error enviando email a {to}: {exc}")


# ── Templates ─────────────────────────────────────────────────────────────────

def _items_html(items: list) -> str:
    rows = ""
    for item in items:
        rows += f"""
        <tr>
          <td style="padding:8px;border-bottom:1px solid #eee">{item['nombre']}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;text-align:center">{item['cantidad']}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">{item['precio']:.2f} €</td>
          <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">{item['subtotal']:.2f} €</td>
        </tr>"""
    return rows


def _base_template(contenido: str) -> str:
    return f"""
    <!DOCTYPE html>
    <html lang="es">
    <head><meta charset="UTF-8"></head>
    <body style="font-family:Arial,sans-serif;background:#f5f5f5;margin:0;padding:0">
      <div style="max-width:600px;margin:32px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1)">
        <div style="background:#1e3a5f;padding:24px;text-align:center">
          <h1 style="color:#fff;margin:0;font-size:24px">{TIENDA_NOMBRE}</h1>
          <p style="color:#93c5fd;margin:4px 0 0">Materiales y productos químicos para la construcción</p>
        </div>
        <div style="padding:32px">
          {contenido}
        </div>
        <div style="background:#f3f4f6;padding:16px;text-align:center;font-size:12px;color:#6b7280">
          {TIENDA_NOMBRE} · Cádiz · {TIENDA_TELEFONO}
        </div>
      </div>
    </body>
    </html>"""


# ── Emails de confirmación ────────────────────────────────────────────────────

def enviar_confirmacion_pedido(
    email_cliente: str,
    nombre_cliente: str,
    order_id: str,
    items: list,
    subtotal: float,
    coste_envio: float,
    total: float,
    metodo_entrega: str,
    direccion_envio: str,
    metodo_pago: str,
):
    """Email de confirmación al cliente."""
    es_recogida = metodo_entrega == "recogida"
    envio_texto = "🏪 Recogida en tienda (gratis)" if es_recogida else f"🚚 Envío a domicilio — {direccion_envio}"

    pago_html = ""
    if metodo_pago == "transferencia":
        pago_html = f"""
        <div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;padding:16px;margin:16px 0">
          <h3 style="color:#92400e;margin:0 0 8px">🏦 Datos para la transferencia bancaria</h3>
          <p style="margin:4px 0"><strong>IBAN:</strong> {IBAN}</p>
          <p style="margin:4px 0"><strong>Concepto / Referencia:</strong> {order_id[:8].upper()}</p>
          <p style="margin:8px 0 0;font-size:13px;color:#78350f">
            Incluye el número de pedido en el concepto para que podamos identificar tu pago.
          </p>
        </div>"""

    contenido = f"""
    <h2 style="color:#1e3a5f">✅ Pedido confirmado</h2>
    <p>Hola <strong>{nombre_cliente}</strong>, hemos recibido tu pedido correctamente.</p>

    <div style="background:#f9fafb;border-radius:6px;padding:12px;margin:16px 0">
      <p style="margin:0;font-size:13px;color:#6b7280">Número de pedido</p>
      <p style="margin:4px 0 0;font-size:18px;font-weight:700;color:#1e3a5f;font-family:monospace">
        {order_id[:8].upper()}
      </p>
    </div>

    <table style="width:100%;border-collapse:collapse;margin:16px 0">
      <thead>
        <tr style="background:#f3f4f6">
          <th style="padding:8px;text-align:left">Producto</th>
          <th style="padding:8px;text-align:center">Cant.</th>
          <th style="padding:8px;text-align:right">Precio</th>
          <th style="padding:8px;text-align:right">Subtotal</th>
        </tr>
      </thead>
      <tbody>{_items_html(items)}</tbody>
    </table>

    <div style="text-align:right;margin:8px 0">
      <p style="margin:4px 0;color:#6b7280">Subtotal: {subtotal:.2f} €</p>
      <p style="margin:4px 0;color:#6b7280">Envío: {"Gratis" if coste_envio == 0 else f"{coste_envio:.2f} €"}</p>
      <p style="margin:4px 0;color:#6b7280">IVA (21%): {(total * 0.21):.2f} €</p>
      <p style="margin:8px 0;font-size:18px;font-weight:700;color:#1e3a5f">
        Total (IVA incl.): {(total * 1.21):.2f} €
      </p>
    </div>

    <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0">

    <p><strong>Entrega:</strong> {envio_texto}</p>
    <p><strong>Pago:</strong> {"🏦 Transferencia bancaria" if metodo_pago == "transferencia" else "💳 Tarjeta (SumUp)"}</p>

    {pago_html}

    <p style="margin-top:24px;color:#6b7280;font-size:13px">
      Si tienes alguna duda llámanos al <strong>{TIENDA_TELEFONO}</strong>.
    </p>"""

    _send(
        to=email_cliente,
        subject=f"✅ Pedido {order_id[:8].upper()} confirmado — {TIENDA_NOMBRE}",
        html=_base_template(contenido),
    )


def enviar_notificacion_admin(
    order_id: str,
    email_cliente: str,
    nombre_cliente: str,
    items: list,
    total: float,
    coste_envio: float,
    metodo_entrega: str,
    direccion_envio: str,
    metodo_pago: str,
):
    """Email de notificación al administrador cuando hay un pedido nuevo."""
    if not EMAIL_ADMIN:
        return

    entrega = "Recogida en tienda" if metodo_entrega == "recogida" else f"Envío → {direccion_envio}"

    contenido = f"""
    <h2 style="color:#1e3a5f">🛒 Nuevo pedido recibido</h2>

    <table style="width:100%;border-collapse:collapse">
      <tr><td style="padding:6px;color:#6b7280;width:130px">Pedido</td>
          <td style="padding:6px;font-weight:700;font-family:monospace">{order_id[:8].upper()}</td></tr>
      <tr style="background:#f9fafb">
          <td style="padding:6px;color:#6b7280">Cliente</td>
          <td style="padding:6px">{nombre_cliente} ({email_cliente})</td></tr>
      <tr><td style="padding:6px;color:#6b7280">Total</td>
          <td style="padding:6px;font-weight:700;color:#059669">{total:.2f} € (+ IVA)</td></tr>
      <tr style="background:#f9fafb">
          <td style="padding:6px;color:#6b7280">Entrega</td>
          <td style="padding:6px">{entrega}</td></tr>
      <tr><td style="padding:6px;color:#6b7280">Pago</td>
          <td style="padding:6px">{"Transferencia bancaria" if metodo_pago == "transferencia" else "SumUp (tarjeta)"}</td></tr>
    </table>

    <table style="width:100%;border-collapse:collapse;margin:16px 0">
      <thead>
        <tr style="background:#f3f4f6">
          <th style="padding:8px;text-align:left">Producto</th>
          <th style="padding:8px;text-align:center">Cant.</th>
          <th style="padding:8px;text-align:right">Subtotal</th>
        </tr>
      </thead>
      <tbody>{"".join(f"<tr><td style='padding:8px;border-bottom:1px solid #eee'>{i['nombre']}</td><td style='padding:8px;text-align:center'>{i['cantidad']}</td><td style='padding:8px;text-align:right'>{i['subtotal']:.2f} €</td></tr>" for i in items)}
      </tbody>
    </table>

    <p style="text-align:center;margin-top:24px">
      <a href="#" style="background:#1e3a5f;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none">
        Ver en panel de administración
      </a>
    </p>"""

    _send(
        to=EMAIL_ADMIN,
        subject=f"🛒 Nuevo pedido {order_id[:8].upper()} — {nombre_cliente} — {total:.2f} €",
        html=_base_template(contenido),
    )


def enviar_cambio_estado(
    email_cliente: str,
    nombre_cliente: str,
    order_id: str,
    estado: str,
):
    """Email al cliente cuando el administrador cambia el estado de su pedido."""
    MENSAJES = {
        "pagado": ("✅ Pago confirmado", "Hemos confirmado el pago de tu pedido. Estamos preparando tu envío."),
        "preparando": ("📦 Preparando tu pedido", "Estamos preparando tu pedido para el envío."),
        "enviado": ("🚚 Tu pedido está en camino", "Tu pedido ha salido de nuestro almacén y está en camino. Pronto lo recibirás."),
        "entregado": ("✅ Pedido entregado", "Tu pedido ha sido entregado. Gracias por confiar en nosotros."),
        "cancelado": ("❌ Pedido cancelado", f"Tu pedido ha sido cancelado. Si tienes alguna duda llámanos al {TIENDA_TELEFONO}."),
    }

    if estado not in MENSAJES:
        return

    asunto_estado, mensaje = MENSAJES[estado]

    contenido = f"""
    <h2 style="color:#1e3a5f">{asunto_estado}</h2>
    <p>Hola <strong>{nombre_cliente}</strong>,</p>
    <p>{mensaje}</p>
    <div style="background:#f9fafb;border-radius:6px;padding:12px;margin:16px 0">
      <p style="margin:0;font-size:13px;color:#6b7280">Número de pedido</p>
      <p style="margin:4px 0 0;font-size:18px;font-weight:700;color:#1e3a5f;font-family:monospace">
        {order_id[:8].upper()}
      </p>
    </div>
    <p style="color:#6b7280;font-size:13px">
      Si tienes alguna duda llámanos al <strong>{TIENDA_TELEFONO}</strong>.
    </p>"""

    _send(
        to=email_cliente,
        subject=f"{asunto_estado} — Pedido {order_id[:8].upper()} — {TIENDA_NOMBRE}",
        html=_base_template(contenido),
    )
