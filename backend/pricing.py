BASE_PRICES = {
    "capilaridad": 80.0,
    "condensacion": 25.0,
    "filtracion": 60.0,
}

GRAVITY_MULTIPLIERS = {
    "baja": 1.0,
    "media": 1.2,
    "alta": 1.5,
}


def calculate_price(
    tipo: str,
    m2: float,
    altura: float,
    gravedad: str,
    ubicacion: str,
) -> dict:
    base = BASE_PRICES.get(tipo, 50.0)
    gravity = GRAVITY_MULTIPLIERS.get(gravedad, 1.0)

    price = base * m2 * gravity

    if altura > 2.5:
        price *= 1.10

    if ubicacion == "exterior":
        price *= 1.15

    return {"precio_estimado": round(price, 2)}