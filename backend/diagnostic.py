"""
Motor de diagnóstico de humedades basado en reglas (cuestionario).

No requiere IA ni imagen. Determina el tipo y nivel de gravedad a partir
de las respuestas del usuario a un cuestionario de 4 pasos.

Tipos de humedad:
  - condensacion: diferencia de temperatura, ventilación insuficiente
  - capilaridad:  ascenso de agua desde el suelo por los poros del muro
  - filtracion:   entrada de agua exterior (lluvia, grietas, cubiertas)

Niveles de gravedad:
  - bajo:   problema incipiente, monitorizar y prevenir
  - medio:  tratamiento recomendado a corto plazo
  - alto:   intervención urgente para evitar daños estructurales
"""

from seed_data import HUMIDITY_RECOMMENDATIONS

# ── Descripciones por tipo ────────────────────────────────────────────────────
TIPO_INFO = {
    "condensacion": {
        "label": "Humedad por Condensación",
        "icono": "💧",
        "descripcion": (
            "La humedad se forma cuando el vapor de agua del interior choca con "
            "superficies frías (paredes, ventanas, techos). Es muy frecuente en "
            "viviendas con poca ventilación o mal aislamiento."
        ),
        "causas": [
            "Ventilación insuficiente en baños, cocinas o dormitorios",
            "Puentes térmicos en paredes o ventanas",
            "Calefacción intermitente con cambios bruscos de temperatura",
            "Exceso de vapor (cocinar, tender ropa interior)",
        ],
        "pasos_solucion": [
            "Mejorar la ventilación con extractores o ventilación cruzada",
            "Aplicar pintura antimoho o antihumedad en paredes afectadas",
            "Instalar deshumidificador en zonas críticas",
            "Revisar el aislamiento térmico de paredes y ventanas",
        ],
    },
    "capilaridad": {
        "label": "Humedad por Capilaridad",
        "icono": "📈",
        "descripcion": (
            "El agua asciende desde el suelo o cimientos a través de los poros "
            "del muro por capilaridad. Se reconoce por las manchas en la parte baja "
            "de las paredes y las eflorescencias (salitre blanco)."
        ),
        "causas": [
            "Ausencia o deterioro de barrera antihumedad horizontal",
            "Terreno muy húmedo o nivel freático elevado",
            "Muros en contacto directo con el suelo sin impermeabilizar",
            "Cimentaciones antiguas sin protección adecuada",
        ],
        "pasos_solucion": [
            "Tratamiento de inyección de resinas (barrera química)",
            "Aplicar mortero impermeable en el zócalo (rasante hydro)",
            "Instalar lámina barrera antihumedad horizontal si es posible",
            "Aplicar hidrofugante en fachadas y muros exteriores",
        ],
    },
    "filtracion": {
        "label": "Humedad por Filtración",
        "icono": "🔍",
        "descripcion": (
            "El agua penetra desde el exterior a través de grietas, juntas deterioradas, "
            "cubiertas o fachadas con deficiencias. Empeora claramente con la lluvia."
        ),
        "causas": [
            "Grietas o fisuras en fachada, terraza o cubierta",
            "Impermeabilización de cubierta deteriorada o inexistente",
            "Juntas o sellados defectuosos alrededor de ventanas y puertas",
            "Tuberías con fugas o instalaciones antiguas",
        ],
        "pasos_solucion": [
            "Localizar y sellar grietas con sellador de poliuretano elástico",
            "Impermeabilizar la cubierta o terraza con membrana líquida",
            "Revisar y renovar el sistema de impermeabilización de fachada",
            "Aplicar hidrofugante de fachada tras reparar las fisuras",
        ],
    },
}

# ── Niveles de gravedad ───────────────────────────────────────────────────────
NIVEL_INFO = {
    "bajo": {
        "label": "Nivel Bajo",
        "color": "#059669",
        "bg": "#d1fae5",
        "icono": "🟢",
        "descripcion": "El problema está en fase inicial. Con las medidas preventivas adecuadas se puede controlar sin grandes obras.",
    },
    "medio": {
        "label": "Nivel Medio",
        "color": "#f59e0b",
        "bg": "#fef3c7",
        "icono": "🟡",
        "descripcion": "Se recomienda intervenir a corto plazo. Sin tratamiento el problema avanzará y generará daños mayores.",
    },
    "alto": {
        "label": "Nivel Alto",
        "color": "#ef4444",
        "bg": "#fee2e2",
        "icono": "🔴",
        "descripcion": "Intervención urgente necesaria. Puede provocar daños estructurales, problemas de salud por moho o pérdida de valor del inmueble.",
    },
}


# ── Motor de diagnóstico ──────────────────────────────────────────────────────
def diagnosticar(
    zona: str,
    sintomas: list[str],
    posicion_muro: str,
    empeora_lluvia: str,
) -> dict:
    """
    Determina el tipo de humedad y el nivel de gravedad a partir del cuestionario.

    Args:
        zona: 'interior_pared' | 'exterior_pared' | 'suelo' | 'techo' | 'terraza' | 'sotano'
        sintomas: lista de ['manchas_oscuras', 'salitre', 'pintura_levantada',
                             'olor_humedad', 'condensacion_ventanas', 'grietas']
        posicion_muro: 'base_muro' | 'zona_media' | 'parte_alta' | 'multiple'
        empeora_lluvia: 'si' | 'no' | 'aveces'

    Returns:
        dict con tipo, nivel, confianza, info del tipo, info del nivel y
        IDs de productos recomendados.
    """
    s = set(sintomas)
    tiene = lambda x: x in s  # noqa

    tipo, nivel, confianza = _reglas(zona, s, posicion_muro, empeora_lluvia)

    # Ajuste por síntomas agravantes
    if tipo == "condensacion" and tiene("olor_humedad"):
        nivel = _subir_nivel(nivel)

    if tipo == "filtracion" and tiene("grietas"):
        nivel = _subir_nivel(nivel)

    if tipo == "capilaridad" and tiene("salitre") and posicion_muro == "base_muro":
        nivel = _subir_nivel(nivel)

    return {
        "tipo": tipo,
        "nivel_gravedad": nivel,
        "confianza": confianza,
        "origen": "cuestionario",
        **TIPO_INFO[tipo],
        "nivel_info": NIVEL_INFO[nivel],
        "ids_recomendados": HUMIDITY_RECOMMENDATIONS.get(tipo, []),
    }


def _reglas(zona, sintomas, posicion_muro, empeora_lluvia):
    """Árbol de reglas principal → devuelve (tipo, nivel, confianza)."""
    s = sintomas
    tiene = lambda x: x in s  # noqa
    llueve = empeora_lluvia in ("si", "aveces")

    # ── Terraza / cubierta ──────────────────────────────────────────
    if zona == "terraza":
        if llueve:
            return "filtracion", "alto", 0.95
        return "filtracion", "medio", 0.85

    # ── Sótano / garaje ────────────────────────────────────────────
    if zona == "sotano":
        if posicion_muro == "base_muro" or tiene("salitre"):
            return "capilaridad", "alto", 0.90
        if llueve:
            return "filtracion", "medio", 0.80
        return "capilaridad", "medio", 0.75

    # ── Suelo / solera ─────────────────────────────────────────────
    if zona == "suelo":
        return "capilaridad", "alto", 0.92

    # ── Techo ──────────────────────────────────────────────────────
    if zona == "techo":
        if llueve:
            return "filtracion", "alto", 0.90
        if tiene("condensacion_ventanas") or not llueve:
            return "condensacion", "medio", 0.78
        return "filtracion", "medio", 0.70

    # ── Pared exterior / fachada ───────────────────────────────────
    if zona == "exterior_pared":
        if llueve and (tiene("grietas") or tiene("manchas_oscuras")):
            return "filtracion", "alto", 0.92
        if llueve:
            return "filtracion", "medio", 0.80
        if posicion_muro == "base_muro" or tiene("salitre"):
            return "capilaridad", "medio", 0.75
        return "filtracion", "bajo", 0.65

    # ── Pared interior ─────────────────────────────────────────────
    # (zona == 'interior_pared' o cualquier otro valor)
    if tiene("salitre") and posicion_muro == "base_muro":
        if llueve:
            return "filtracion", "medio", 0.82
        return "capilaridad", "alto", 0.88

    if tiene("condensacion_ventanas"):
        if tiene("olor_humedad"):
            return "condensacion", "medio", 0.88
        return "condensacion", "bajo", 0.83

    if llueve and tiene("grietas"):
        return "filtracion", "medio", 0.80

    if llueve:
        return "filtracion", "bajo", 0.70

    if posicion_muro == "base_muro" and (tiene("salitre") or tiene("manchas_oscuras")):
        return "capilaridad", "medio", 0.75

    if tiene("manchas_oscuras") or tiene("pintura_levantada"):
        return "condensacion", "bajo", 0.65

    # Caso por defecto con poca información
    return "condensacion", "bajo", 0.50


def _subir_nivel(nivel: str) -> str:
    """Sube un peldaño el nivel de gravedad (máximo: alto)."""
    escalera = ["bajo", "medio", "alto"]
    idx = escalera.index(nivel)
    return escalera[min(idx + 1, len(escalera) - 1)]


# ── Helpers de nivel para análisis por foto ───────────────────────────────────
def nivel_desde_confianza_ia(tipo: str, confianza: float) -> str:
    """
    Estima el nivel de gravedad para el análisis por foto.
    La confianza de la IA es sobre el tipo, no sobre la gravedad,
    así que usamos heurísticas por tipo.
    """
    if tipo == "filtracion":
        # Filtraciones suelen ser graves
        return "alto" if confianza >= 0.65 else "medio"
    if tipo == "capilaridad":
        return "medio" if confianza >= 0.55 else "bajo"
    # condensacion
    return "bajo" if confianza >= 0.6 else "medio"
