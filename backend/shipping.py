"""
Módulo de cálculo de costes de envío.
Las tarifas son configurables vía variables de entorno.
"""
import os

# ── Configuración de tarifas (editables en .env) ─────────────────────────────

# A partir de este importe (sin IVA) el envío es GRATIS
ENVIO_GRATIS_DESDE = float(os.getenv("ENVIO_GRATIS_DESDE", "75.0"))

# Precio base del envío estándar (sin IVA)
PRECIO_ENVIO_ESTANDAR = float(os.getenv("PRECIO_ENVIO_ESTANDAR", "6.95"))

# Precio envío con bultos pesados (morteros, sacos de 25kg, etc.)
PRECIO_ENVIO_PESADO = float(os.getenv("PRECIO_ENVIO_PESADO", "12.95"))

# Umbral de precio a partir del cual se aplica la tarifa de bulto pesado
UMBRAL_PEDIDO_PESADO = float(os.getenv("UMBRAL_PEDIDO_PESADO", "0.0"))  # 0 = desactivado

# Categorías que se consideran pesadas (separadas por coma en .env)
_cats_pesadas = os.getenv("CATEGORIAS_PESADAS", "morteros,herramientas")
CATEGORIAS_PESADAS = {c.strip() for c in _cats_pesadas.split(",") if c.strip()}


def calcular_envio(subtotal: float, categorias_en_carrito: list[str] = None) -> dict:
    """
    Calcula el coste de envío según el subtotal y las categorías del carrito.

    Returns:
        dict con:
            - coste: float — coste de envío (0.0 si es gratis)
            - gratis: bool — True si el envío es gratuito
            - motivo: str — explicación del precio
            - gratis_desde: float — umbral para envío gratuito
    """
    cats = set(categorias_en_carrito or [])
    tiene_pesados = bool(cats & CATEGORIAS_PESADAS)

    # Envío gratuito por importe
    if subtotal >= ENVIO_GRATIS_DESDE:
        return {
            "coste": 0.0,
            "gratis": True,
            "motivo": f"Envío gratuito en pedidos de {ENVIO_GRATIS_DESDE:.0f} € o más",
            "gratis_desde": ENVIO_GRATIS_DESDE,
        }

    # Tarifa por bultos pesados (morteros, sacos, etc.)
    if tiene_pesados:
        faltan = ENVIO_GRATIS_DESDE - subtotal
        return {
            "coste": PRECIO_ENVIO_PESADO,
            "gratis": False,
            "motivo": f"Tarifa especial por bulto pesado. Añade {faltan:.2f} € más para envío gratis.",
            "gratis_desde": ENVIO_GRATIS_DESDE,
        }

    # Envío estándar
    faltan = ENVIO_GRATIS_DESDE - subtotal
    return {
        "coste": PRECIO_ENVIO_ESTANDAR,
        "gratis": False,
        "motivo": f"Envío estándar. Añade {faltan:.2f} € más para envío gratis.",
        "gratis_desde": ENVIO_GRATIS_DESDE,
    }


def info_tarifas() -> dict:
    """Devuelve la configuración de tarifas para mostrar en el frontend."""
    return {
        "gratis_desde": ENVIO_GRATIS_DESDE,
        "estandar": PRECIO_ENVIO_ESTANDAR,
        "pesado": PRECIO_ENVIO_PESADO,
        "categorias_pesadas": list(CATEGORIAS_PESADAS),
        "recogida_en_tienda": 0.0,
    }
