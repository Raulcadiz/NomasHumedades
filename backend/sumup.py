"""
Cliente de la API de SumUp para pagos con tarjeta (Hosted Checkout).

Documentación de referencia: WebLaVega-main/docs/architecture/payment-system.md
API: https://api.sumup.com/v0.1

Flujo:
  1. create_checkout()  → obtiene URL del Hosted Checkout de SumUp
  2. Frontend abre esa URL en popup
  3. Usuario paga en SumUp
  4. SumUp redirige a nuestro return URL  → marcamos pedido como pagado
  5. Webhook de SumUp como confirmación de respaldo (idempotente)
"""
import hashlib
import hmac as _hmac
import logging
import os

import requests

logger = logging.getLogger(__name__)

# ── Configuración (desde .env) ────────────────────────────────────────────────
SUMUP_ENABLED = os.getenv("SUMUP_ENABLED", "false").lower() == "true"
SUMUP_API_KEY = os.getenv("SUMUP_API_KEY", "")          # sk_test_... o sk_live_...
SUMUP_MERCHANT_CODE = os.getenv("SUMUP_MERCHANT_CODE", "")
SUMUP_WEBHOOK_SECRET = os.getenv("SUMUP_WEBHOOK_SECRET", "")  # Opcional para verificar firma
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")

_SUMUP_API = "https://api.sumup.com/v0.1"


# ── Helpers ───────────────────────────────────────────────────────────────────
def is_configured() -> bool:
    """True si SumUp está habilitado y tiene credenciales configuradas."""
    return SUMUP_ENABLED and bool(SUMUP_API_KEY) and bool(SUMUP_MERCHANT_CODE)


def _auth_headers() -> dict:
    return {
        "Authorization": f"Bearer {SUMUP_API_KEY}",
        "Content-Type": "application/json",
    }


# ── Checkout ──────────────────────────────────────────────────────────────────
def create_checkout(order_id: str, amount_iva: float, description: str) -> dict:
    """
    Crea un Hosted Checkout en SumUp.

    Args:
        order_id:    UUID del pedido en nuestra DB.
        amount_iva:  Importe TOTAL con IVA incluido (lo que el cliente paga).
        description: Texto descriptivo visible en el dashboard SumUp.

    Returns:
        { checkout_id: str, checkout_url: str }

    Raises:
        requests.HTTPError si la API de SumUp devuelve error.
    """
    reference = f"NMH-{order_id[:8].upper()}"
    return_url = f"{BACKEND_URL}/api/sumup/return?order_id={order_id}&popup=1"

    payload = {
        "amount": round(amount_iva, 2),
        "currency": "EUR",
        "checkout_reference": reference,
        "description": description,
        "merchant_code": SUMUP_MERCHANT_CODE,
        "redirect_url": return_url,    # SumUp redirige aquí después del pago
        "hosted_checkout": {"enabled": True},
    }

    try:
        res = requests.post(
            f"{_SUMUP_API}/checkouts",
            json=payload,
            headers=_auth_headers(),
            timeout=15,
        )
        res.raise_for_status()
        data = res.json()

        # La URL puede estar en distintos sitios según la versión de la API
        checkout_url = (
            data.get("hosted_checkout_url")
            or (data.get("hosted_checkout") or {}).get("url")
        )

        logger.info(f"SumUp checkout creado: {data.get('id')} — {amount_iva:.2f} EUR — ref: {reference}")
        return {"checkout_id": data["id"], "checkout_url": checkout_url}

    except requests.HTTPError as exc:
        body = exc.response.text if exc.response is not None else "sin respuesta"
        logger.error(f"SumUp API error al crear checkout: {body}")
        raise


def get_checkout_status(checkout_id: str) -> str:
    """
    Consulta el estado de un checkout en SumUp.
    Posibles valores: PENDING, PAID, FAILED, EXPIRED...
    """
    try:
        res = requests.get(
            f"{_SUMUP_API}/checkouts/{checkout_id}",
            headers=_auth_headers(),
            timeout=10,
        )
        res.raise_for_status()
        return res.json().get("status", "PENDING").upper()
    except Exception as exc:
        logger.error(f"Error consultando estado SumUp checkout {checkout_id}: {exc}")
        return "UNKNOWN"


# ── Webhook ───────────────────────────────────────────────────────────────────
def verify_webhook_signature(body: bytes, signature: str) -> bool:
    """
    Verifica la firma HMAC-SHA256 del webhook de SumUp.
    Si SUMUP_WEBHOOK_SECRET no está configurado, devuelve True (sin verificar).
    Siempre usa compare_digest para evitar timing attacks.
    """
    if not SUMUP_WEBHOOK_SECRET:
        logger.warning("SUMUP_WEBHOOK_SECRET no configurado — verificación de firma omitida")
        return True

    mac = _hmac.new(
        SUMUP_WEBHOOK_SECRET.encode("utf-8"),
        body,
        hashlib.sha256,
    )
    expected = mac.hexdigest()
    return _hmac.compare_digest(expected, signature or "")


# ── HTML de cierre de popup ───────────────────────────────────────────────────
def popup_close_html(order_id: str, status: str = "paid") -> str:
    """
    Página HTML mínima que se sirve en la return URL del popup.
    Envía un postMessage al padre y cierra la ventana.
    """
    frontend_fallback = f"{FRONTEND_URL}/pedido/{order_id}"
    return f"""<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Procesando pago...</title>
  <style>
    body {{ font-family: Arial, sans-serif; display: flex; align-items: center;
           justify-content: center; min-height: 100vh; margin: 0; background: #f9fafb; }}
    .box {{ text-align: center; padding: 40px; }}
    .icon {{ font-size: 48px; margin-bottom: 16px; }}
  </style>
</head>
<body>
  <div class="box">
    <div class="icon">{"✅" if status == "paid" else "⏳"}</div>
    <p>{"Pago completado. Cerrando ventana..." if status == "paid" else "Procesando..."}</p>
  </div>
  <script>
    const orderId = "{order_id}";
    const status = "{status}";
    try {{
      if (window.opener && !window.opener.closed) {{
        window.opener.postMessage(
          {{ type: "SUMUP_RETURN", orderId: orderId, status: status }},
          "*"
        );
      }}
    }} catch(e) {{}}

    // Cerrar popup después de un breve instante
    setTimeout(function() {{
      try {{ window.close(); }} catch(e) {{}}
      // Fallback si no puede cerrarse (tab normal)
      if (!window.closed) {{
        window.location.href = "{frontend_fallback}";
      }}
    }}, 1200);
  </script>
</body>
</html>"""
