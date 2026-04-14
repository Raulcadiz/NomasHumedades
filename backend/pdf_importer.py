"""
Importador de productos desde PDFs de proveedores.

Soporta:
  - Valentine  : Tarifa General (precio por formato/color; extrae formato más grande, precio Blanco)
  - Kerakoll   : Tarifa Enero 2026 (precio por kg/l/u, con código K-xxxxx)
  - Higaltor   : Catálogo 2024 (referencias D-xxx / H-xxx desde tablas de tratamiento)

Uso:
    from pdf_importer import importar_marca, importar_todos
    productos = importar_marca("valentine", "/ruta/a/marcas")
"""

import glob
import os
import re

try:
    import pdfplumber  # pip install pdfplumber

    PDF_OK = True
except ImportError:
    PDF_OK = False


# ── Utilidades ────────────────────────────────────────────────────────────────

def _to_float(s: str) -> float:
    return float(s.strip().replace(".", "").replace(",", "."))


def _dedup(products: list, key: str) -> list:
    seen: set = set()
    out = []
    for p in products:
        v = p.get(key)
        if v and v not in seen:
            seen.add(v)
            out.append(p)
    return out


def _tags_for(section: str, desc: str) -> list:
    tags = [section] if section else []
    dl = desc.lower()
    if "exterior" in dl:
        tags.append("exterior")
    if "interior" in dl:
        tags.append("interior")
    if "humedad" in dl or "antihumedad" in dl:
        tags.append("antihumedad")
    if "impermeabl" in dl:
        tags.append("impermeabilizante")
    if "fachada" in dl:
        tags.append("fachada")
    # deduplicate preserving order
    return list(dict.fromkeys(tags))


# ── Valentine ─────────────────────────────────────────────────────────────────

_VAL_SECTION_MAP = {
    "FACHADAS Y CUBIERTAS": "impermeabilizantes",
    "PAREDES Y TECHOS": "pinturas",
    "LÍNEA DEPORTIVA": "pinturas",
    "MADERA Y METAL": "esmaltes",
    "IMPRIMACIONES Y PREPARACIONES PARA FACHADAS": "imprimaciones",
    "IMPRIMACIONES Y PREPARACIONES PARA MADERA": "imprimaciones",
    "ANTIHUMEDAD": "antihumedad",
    "BARNICES Y LASURES": "barnices",
    "ESMALTES": "esmaltes",
    "DISOLVENTES": "auxiliares",
    "PROTECTORES": "impermeabilizantes",
}

# Product line: "PRODUCT NAME A0188" or "PRODUCT NAME 19100"
_VAL_PROD_RE = re.compile(r"^(.+?)\s+([A-Z]\d{4}|\d{5})\s*$")
# Price row: "15 L  15  250,42  ..."   or   "15 L  15  -  275,46  ..."
_VAL_PRICE_ROW_RE = re.compile(
    r"^(\d+(?:[.,]\d*)?)\s*(?:L|Kg|KG|kg)\s+\S+\s+([\d.,]+|-)"
)
_VAL_RENDIMIENTO_RE = re.compile(r"^Rendimiento:", re.I)
_VAL_COLOR_HEADER_RE = re.compile(
    r"^(?:Blanco|Incoloro|Gris|Negro|Beige|Natural|Colores\s+[A-D])\b"
)


def _parse_valentine(pdf_path: str) -> list:
    products = []
    current_section = "pinturas"

    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            text = page.extract_text() or ""
            lines = [ln.strip() for ln in text.split("\n")]

            i = 0
            while i < len(lines):
                line = lines[i]
                line_up = line.upper()

                # Section detection
                for key, cat in _VAL_SECTION_MAP.items():
                    if line_up.startswith(key):
                        current_section = cat
                        break

                # Product line
                m = _VAL_PROD_RE.match(line)
                if m:
                    name_part = m.group(1).strip()
                    code = m.group(2)

                    # Skip invalid: starts with digit, too short, or is a footer
                    if len(name_part) < 3 or name_part[0].isdigit():
                        i += 1
                        continue
                    if any(tok in name_part for tok in ("Marzo", "Precios", "tarifa")):
                        i += 1
                        continue

                    # Collect description
                    desc_lines = []
                    j = i + 1
                    while j < len(lines) and j < i + 6:
                        ln = lines[j]
                        if not ln:
                            j += 1
                            continue
                        if (
                            _VAL_COLOR_HEADER_RE.match(ln)
                            or _VAL_PRICE_ROW_RE.match(ln)
                            or _VAL_RENDIMIENTO_RE.match(ln)
                        ):
                            break
                        desc_lines.append(ln)
                        j += 1
                    desc = " ".join(desc_lines).strip()

                    # Find price: largest format, Blanco column (first numeric after "-")
                    precio = None
                    best_vol = -1.0
                    k = j
                    while k < min(len(lines), i + 25):
                        pm = _VAL_PRICE_ROW_RE.match(lines[k])
                        if pm:
                            price_str = pm.group(2)
                            if price_str != "-":
                                try:
                                    vol = _to_float(pm.group(1))
                                    price = _to_float(price_str)
                                    if vol > best_vol and price > 0:
                                        best_vol = vol
                                        precio = price
                                except (ValueError, AttributeError):
                                    pass
                        if _VAL_RENDIMIENTO_RE.match(lines[k]):
                            break
                        k += 1

                    products.append(
                        {
                            "id": f"val-{code.lower()}",
                            "nombre": f"Valentine {name_part}",
                            "marca": "Valentine",
                            "categoria": current_section,
                            "precio": round(precio, 2) if precio else 0.0,
                            "descripcion": desc[:400]
                            or f"Producto Valentine referencia {code}",
                            "imagen": "/img/placeholder.svg",
                            "stock": 50,
                            "tags": _tags_for(current_section, desc),
                            "destacado": False,
                            "referencia": code,
                        }
                    )

                i += 1

    return _dedup(products, "referencia")


# ── Kerakoll ──────────────────────────────────────────────────────────────────

_KER_SECTION_MAP = {
    "COLOCACIÓN": "adhesivos",
    "CONSTRUCCIÓN": "morteros",
    "WOOD": "adhesivos",
    "SUPERFICIES": "pinturas",
    "REFUERZO": "morteros",
}

_KER_LINE_HEADER_RE = re.compile(r"^LÍNEA\s+(\w+)", re.I)
_KER_TABLE_HEADER_RE = re.compile(r"TIPO.*VOL\..*PRECIO", re.I)

# K-code price lines: K70094 sacos 25 kg 1050 kg/palet 1,060€/kg barcode
_KER_CODE_RE = re.compile(
    r"^(K\w+)\s+.*?(\d+(?:[.,]\d+)?)\s*€\/(kg|l|u\.|m2)"
)

# Lines that are clearly descriptions (not product names)
_KER_DESC_STARTS = (
    "ex ", "gel-", "adhesivo", "mortero", "membrana", "impermeab",
    "pintura", "esmalte", "ligante", "nivelante", "sellante", "estuco",
    "consolidante", "hidrofug", "bicompon", "detergente", "fijador",
    "promotor", "imprimac", "recubrim", "revestim", "espuma", "limpiador",
    "resina", "barniz", "protector", "espátula", "separad", "rend",
)


def _looks_like_desc(line: str) -> bool:
    ll = line.lower()
    # Use original line to check case (not ll, which is always lowercase)
    return any(ll.startswith(s) for s in _KER_DESC_STARTS) or line[0].islower()


def _kerakoll_unit_price(line: str) -> tuple | None:
    """Return (code, total_price_eur) or None."""
    m = _KER_CODE_RE.match(line)
    if not m:
        return None

    code = m.group(1)
    price_per_unit = _to_float(m.group(2))
    unit = m.group(3)

    # Extract package size: look for "sacos 25 kg", "botes 20 kg", "rollos 23 m2"
    parts = line.split()
    pkg_size = None
    for j, p in enumerate(parts):
        if re.match(r"^\d+$", p) and j > 0:
            if parts[j - 1] in ("sacos", "botes", "bidones", "rollos", "barras"):
                try:
                    pkg_size = int(p)
                    break
                except ValueError:
                    pass
        # Handle "12x300" → 12 units
        cx = re.match(r"^(\d+)x\d+$", p)
        if cx:
            pkg_size = int(cx.group(1))
            break

    if pkg_size and unit in ("kg", "l", "m2"):
        total = round(price_per_unit * pkg_size, 2)
    else:
        total = round(price_per_unit, 2)

    return code, total


def _parse_kerakoll(pdf_path: str) -> list:
    products = []
    current_section = "adhesivos"

    with pdfplumber.open(pdf_path) as pdf:
        all_lines = []
        for page in pdf.pages:
            text = page.extract_text() or ""
            all_lines.extend(ln.strip() for ln in text.split("\n"))

    n = len(all_lines)
    state = "idle"  # idle → desc → price
    current: dict | None = None
    desc_parts: list = []
    got_price = False

    def _finalize():
        nonlocal current, desc_parts, got_price
        if current and current.get("nombre"):
            current["descripcion"] = " ".join(desc_parts)[:400]
            products.append(current)
        current = None
        desc_parts = []
        got_price = False

    for idx, line in enumerate(all_lines):
        if not line:
            continue

        # Section header: "LÍNEA COLOCACIÓN"
        sm = _KER_LINE_HEADER_RE.match(line)
        if sm:
            key = sm.group(1).upper()
            for k, cat in _KER_SECTION_MAP.items():
                if k in key:
                    current_section = cat
                    break
            _finalize()
            state = "idle"
            continue

        # Skip table header rows
        if _KER_TABLE_HEADER_RE.search(line):
            continue

        # K-code price line
        result = _kerakoll_unit_price(line)
        if result:
            code, price = result
            if current and not got_price:
                current["precio"] = price
                current["referencia"] = code
                current["id"] = f"ker-{code.lower()}"
                got_price = True
            state = "price"
            continue

        # Leaving price block → finalize
        if state == "price":
            _finalize()
            state = "idle"

        # Detect product name (exclude K-code lines like "K70094 sacos...")
        if (
            state == "idle"
            and line
            and not re.match(r"^K\w{4,}", line)
            and len(line) < 70
            and line[0].isupper()
            and not _looks_like_desc(line)
            and not re.match(r"^(Rendimiento|Dosif|Precio|Página|ℓ/m|Price)", line, re.I)
        ):
            # Confirm by peeking ahead: next meaningful line should look like a description
            next_line = next(
                (all_lines[j] for j in range(idx + 1, min(idx + 4, n)) if all_lines[j].strip()),
                "",
            )
            if next_line and _looks_like_desc(next_line):
                current = {
                    "id": f"ker-{len(products)}",
                    "nombre": f"Kerakoll {line}",
                    "marca": "Kerakoll",
                    "categoria": current_section,
                    "precio": 0.0,
                    "descripcion": "",
                    "imagen": "/img/placeholder.svg",
                    "stock": 30,
                    "tags": _tags_for(current_section, ""),
                    "destacado": False,
                    "referencia": f"KER{len(products):04d}",
                }
                desc_parts = []
                got_price = False
                state = "desc"
                continue

        if state == "desc" and line:
            if not re.match(r"^K\w{4,}", line) and not _KER_CODE_RE.match(line):
                desc_parts.append(line)

    _finalize()
    return _dedup(products, "referencia")


# ── Higaltor ──────────────────────────────────────────────────────────────────

# Product references from treatment tables: D-369, H-973-F, D-340-DHR-MC etc.
_HIG_PROD_RE = re.compile(
    r"\b([DH]-[\w-]+)\b\s+[\d\/]+\s*(?:gr|ml|l|kg)?\s*(.*?)$", re.I
)


def _parse_higaltor(pdf_path: str) -> list:
    products_by_code: dict = {}

    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            text = page.extract_text() or ""
            for raw_line in text.split("\n"):
                line = raw_line.strip()
                m = _HIG_PROD_RE.search(line)
                if not m:
                    continue
                code = m.group(1).upper()
                desc_raw = (m.group(2) or "").strip()

                if code not in products_by_code:
                    dl = desc_raw.lower()
                    if "limpiador" in dl or "desinfect" in dl:
                        cat = "auxiliares"
                    elif "pintur" in dl:
                        cat = "pinturas"
                    else:
                        cat = "impermeabilizantes"

                    products_by_code[code] = {
                        "id": f"hig-{re.sub(r'[^a-z0-9]', '', code.lower())}",
                        "nombre": f"Higaltor {code}",
                        "marca": "Higaltor",
                        "categoria": cat,
                        "precio": 0.0,
                        "descripcion": desc_raw[:200]
                        or f"Tratamiento Higaltor referencia {code}",
                        "imagen": "/img/placeholder.svg",
                        "stock": 20,
                        "tags": [cat, "tratamiento"],
                        "destacado": False,
                        "referencia": code,
                    }

    return list(products_by_code.values())


# ── PDF Finder ────────────────────────────────────────────────────────────────

def find_pdfs(marcas_dir: str, fallback_dir: str = "") -> dict:
    """
    Locate brand PDFs.
    Searches marcas_dir first (priority), then fallback_dir for any brand not found.
    Returns {"valentine": path|None, "kerakoll": path|None, "higaltor": path|None}
    """
    result: dict = {"valentine": None, "kerakoll": None, "higaltor": None}

    dirs_to_search = [d for d in [marcas_dir, fallback_dir] if d and os.path.isdir(d)]

    for search_dir in dirs_to_search:
        for pdf_path in glob.glob(os.path.join(search_dir, "*.pdf")):
            name_low = os.path.basename(pdf_path).lower()
            if "valentine" in name_low and result["valentine"] is None:
                result["valentine"] = pdf_path
            elif "kerakoll" in name_low and "tarifa" in name_low and result["kerakoll"] is None:
                result["kerakoll"] = pdf_path
            elif result["higaltor"] is None:
                if "higaltor" in name_low and "presentacion" not in name_low:
                    result["higaltor"] = pdf_path
                elif "gama" in name_low or ("catalogo" in name_low and "higaltor" not in name_low):
                    result["higaltor"] = pdf_path

    return result


# ── Public API ────────────────────────────────────────────────────────────────

def importar_marca(marca: str, marcas_dir: str, fallback_dir: str = "") -> list:
    """
    Extract products from a single brand's PDF.

    Args:
        marca: 'valentine' | 'kerakoll' | 'higaltor'
        marcas_dir: primary directory (e.g. backend/catalogos with latest PDFs)
        fallback_dir: secondary directory searched if brand PDF not found in primary

    Returns:
        List of product dicts compatible with seed_data / Product model.

    Raises:
        RuntimeError: if pdfplumber is not installed.
        FileNotFoundError: if no PDF found for the brand.
    """
    if not PDF_OK:
        raise RuntimeError(
            "pdfplumber no está instalado. Ejecuta: pip install pdfplumber"
        )

    pdfs = find_pdfs(marcas_dir, fallback_dir)
    pdf_path = pdfs.get(marca)

    if not pdf_path:
        dirs = marcas_dir + (f" / {fallback_dir}" if fallback_dir else "")
        raise FileNotFoundError(
            f"No se encontró PDF para '{marca}' en {dirs}"
        )

    if marca == "valentine":
        return _parse_valentine(pdf_path)

    if marca == "kerakoll":
        return _parse_kerakoll(pdf_path)

    if marca == "higaltor":
        # Try all Higaltor-related PDFs in both directories
        all_hig: list = []
        search_dirs = [d for d in [marcas_dir, fallback_dir] if d and os.path.isdir(d)]
        for search_dir in search_dirs:
            for p in glob.glob(os.path.join(search_dir, "*.pdf")):
                n = os.path.basename(p).lower()
                if ("higaltor" in n or "catalogo" in n or "cat" in n or "gama" in n) and "presentacion" not in n:
                    all_hig.extend(_parse_higaltor(p))
        return _dedup(all_hig, "referencia")

    raise ValueError(f"Marca desconocida: {marca}. Use 'valentine', 'kerakoll' o 'higaltor'.")


def importar_todos(marcas_dir: str, fallback_dir: str = "") -> dict:
    """
    Import all brands. Returns {"valentine": [...], "kerakoll": [...], "higaltor": [...]}.
    Missing PDFs → empty list (no exception raised).
    """
    result: dict = {}
    for marca in ("valentine", "kerakoll", "higaltor"):
        try:
            result[marca] = importar_marca(marca, marcas_dir, fallback_dir)
        except (FileNotFoundError, RuntimeError) as exc:
            result[marca] = []
            print(f"[pdf_importer] {marca}: {exc}")
    return result
