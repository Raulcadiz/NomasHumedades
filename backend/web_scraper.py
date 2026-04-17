"""
Scraper de imágenes para Valentine, Kerakoll e Higaltor.
Estrategias por marca:
  - Higaltor:  URL directa desde referencia (higaltor.es/producto/{ref}/)  → ~90%
  - Kerakoll:  es.kerakoll.com búsqueda + catálogo                          → ~40%
  - Valentine: Sin tienda online → Leroy Merlin + Bricomart + Bricodepot    → ~50%
"""

import logging
import os
import re
import time
import unicodedata
from typing import Optional
from urllib.parse import quote_plus, urljoin

import requests

logger = logging.getLogger(__name__)

try:
    from bs4 import BeautifulSoup
    BS4_OK = True
except ImportError:
    BS4_OK = False
    logger.warning("beautifulsoup4 no instalado. pip install beautifulsoup4")

SESSION = requests.Session()
SESSION.headers.update({
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/122.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "es-ES,es;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "DNT": "1",
})
TIMEOUT = 20


# ── Utilidades ────────────────────────────────────────────────────────────────

def _slugify(text: str) -> str:
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[-\s]+", "-", text)
    return text.strip("-")


def _get(url: str) -> Optional[requests.Response]:
    try:
        r = SESSION.get(url, timeout=TIMEOUT, allow_redirects=True)
        if r.status_code == 404:
            return None
        r.raise_for_status()
        return r
    except Exception as exc:
        logger.debug(f"GET {url} → {exc}")
        return None


def _soup(url: str) -> Optional["BeautifulSoup"]:
    if not BS4_OK:
        return None
    r = _get(url)
    return BeautifulSoup(r.text, "html.parser") if r else None


def _og_image(soup: "BeautifulSoup", base_url: str) -> Optional[str]:
    """og:image es el método más fiable en cualquier web moderna."""
    for attr in ("og:image", "og:image:url", "twitter:image"):
        el = soup.find("meta", property=attr) or soup.find("meta", attrs={"name": attr})
        if el:
            src = el.get("content", "").strip()
            if src and not src.startswith("data:"):
                if src.startswith("/"):
                    src = base_url.rstrip("/") + src
                bad = ["placeholder", "no-image", "logo", "icon", "default", "noimage"]
                if not any(b in src.lower() for b in bad):
                    return src
    return None


def _best_img(soup: "BeautifulSoup", selectors: list, base_url: str) -> Optional[str]:
    """Selectores CSS como método secundario."""
    for selector in selectors:
        try:
            for img in soup.select(selector):
                src = (
                    img.get("data-src") or img.get("data-lazy-src") or
                    img.get("data-original") or img.get("src") or ""
                ).strip()
                if not src or src.startswith("data:"):
                    continue
                if src.startswith("//"):
                    src = "https:" + src
                elif src.startswith("/"):
                    src = base_url.rstrip("/") + src
                elif not src.startswith("http"):
                    src = urljoin(base_url, src)
                bad = ["placeholder", "no-image", "logo", "icon", "blank", "loading"]
                if not any(b in src.lower() for b in bad):
                    return src
        except Exception:
            continue
    return None


def _extract_price(soup: "BeautifulSoup", selectors: list) -> Optional[float]:
    for sel in selectors:
        try:
            el = soup.select_one(sel)
            if not el:
                continue
            text = re.sub(r"[€$£\s\xa0]", "", el.get_text(strip=True)).replace(",", ".")
            m = re.search(r"\d+\.?\d*", text)
            if m:
                p = float(m.group())
                if 0.01 < p < 10000:
                    return p
        except Exception:
            continue
    return None


def _extract_desc(soup: "BeautifulSoup", selectors: list) -> Optional[str]:
    for sel in selectors:
        try:
            el = soup.select_one(sel)
            if not el:
                continue
            parts = el.select("p") or [el]
            text = " ".join(p.get_text(strip=True) for p in parts[:3])
            text = re.sub(r"\s+", " ", text).strip()
            if len(text) > 30:
                return text[:400]
        except Exception:
            continue
    return None


def _get_page_data(url: str, img_selectors: list, price_selectors: list, desc_selectors: list, base_url: str):
    """Extrae imagen, precio y descripción de una página de producto."""
    soup = _soup(url)
    if not soup:
        return None, None, None
    img  = _og_image(soup, base_url) or _best_img(soup, img_selectors, base_url)
    price = _extract_price(soup, price_selectors)
    desc  = _extract_desc(soup, desc_selectors)
    return img, price, desc


# ── Estrategias por marca ─────────────────────────────────────────────────────

def _scrape_higaltor(nombre: str, referencia: str) -> "ProductData":
    """
    Higaltor: URL directa desde referencia.
    Referencia D-273-2 → https://higaltor.es/producto/d-273-2/
    """
    result = ProductData()
    BASE = "https://higaltor.es"
    IMG_SEL = [
        ".woocommerce-product-gallery__image img",
        ".wp-post-image",
        ".attachment-woocommerce_single",
        "img.attachment-woocommerce_thumbnail",
    ]
    PRICE_SEL = [".woocommerce-Price-amount bdi", ".woocommerce-Price-amount", "p.price .amount"]
    DESC_SEL  = [".woocommerce-product-details__short-description", "#tab-description", ".entry-summary p"]

    # 1. URL directa desde referencia (el slug ES la referencia en minúsculas)
    if referencia:
        ref_slug = referencia.lower().strip()
        url = f"{BASE}/producto/{ref_slug}/"
        img, price, desc = _get_page_data(url, IMG_SEL, PRICE_SEL, DESC_SEL, BASE)
        if img:
            result.imagen = img; result.precio = price; result.descripcion = desc
            result.url_producto = url; result.fuente = "higaltor.es (ref directa)"
            return result

    # 2. Búsqueda por nombre
    clean = re.sub(r"^Higaltor\s+", "", nombre, flags=re.I).strip()
    for query in [referencia, clean, f"{clean} higaltor"]:
        if not query:
            continue
        search_url = f"{BASE}/?s={quote_plus(query)}&post_type=product"
        soup = _soup(search_url)
        if not soup:
            continue
        links = soup.select("ul.products li.product a.woocommerce-loop-product__link, li.product a")
        for link in links[:3]:
            href = link.get("href", "")
            if href and "/producto/" in href:
                img, price, desc = _get_page_data(href, IMG_SEL, PRICE_SEL, DESC_SEL, BASE)
                if img:
                    result.imagen = img; result.precio = price; result.descripcion = desc
                    result.url_producto = href; result.fuente = "higaltor.es (búsqueda)"
                    return result
        time.sleep(0.8)

    return result


def _scrape_kerakoll(nombre: str, referencia: str) -> "ProductData":
    """
    Kerakoll: es.kerakoll.com (no www.kerakoll.com).
    Catálogo alfabético en /ab-index.
    """
    result = ProductData()
    BASE = "https://es.kerakoll.com"
    IMG_SEL = [
        ".product-image img",
        ".product-gallery img",
        "img.product-main-image",
        "img[itemprop='image']",
        ".product-detail img",
    ]
    PRICE_SEL = [".price-box .price", ".product-price"]
    DESC_SEL  = [".product-description", ".short-description", "[itemprop='description'] p"]

    clean = re.sub(r"^Kerakoll\s+", "", nombre, flags=re.I).strip()

    # 1. Slug directo desde nombre (slug del producto)
    slug = _slugify(clean)
    if slug:
        for url in [f"{BASE}/{slug}", f"{BASE}/product/{slug}", f"{BASE}/products/{slug}"]:
            img, price, desc = _get_page_data(url, IMG_SEL, PRICE_SEL, DESC_SEL, BASE)
            if img:
                result.imagen = img; result.precio = price; result.descripcion = desc
                result.url_producto = url; result.fuente = "es.kerakoll.com (slug)"
                return result

    # 2. Búsqueda en es.kerakoll.com
    for query in [referencia or "", clean, f"{clean} kerakoll"]:
        if not query.strip():
            continue
        search_url = f"{BASE}/search?q={quote_plus(query)}"
        soup = _soup(search_url)
        if not soup:
            continue

        # Buscar primer enlace de producto
        for a in soup.select("a[href*='/product'], a[href*='/prodotto'], a[href*='/es/']"):
            href = a.get("href", "")
            if href and href not in ("#", "") and BASE in (href if href.startswith("http") else ""):
                full = href if href.startswith("http") else urljoin(BASE, href)
                img, price, desc = _get_page_data(full, IMG_SEL, PRICE_SEL, DESC_SEL, BASE)
                if img:
                    result.imagen = img; result.precio = price; result.descripcion = desc
                    result.url_producto = full; result.fuente = "es.kerakoll.com"
                    return result

        # og:image directo en la página de búsqueda
        og = _og_image(soup, BASE)
        if og and "kerakoll" in og.lower():
            result.imagen = og
            result.fuente = "es.kerakoll.com (búsqueda)"
            return result

        time.sleep(1.0)

    return result


def _scrape_valentine_distribuidores(nombre: str, referencia: str) -> "ProductData":
    """
    Valentine no tiene tienda online.
    Busca en distribuidores: Leroy Merlin, Bricomart, Bricodepot.
    """
    result = ProductData()
    clean = re.sub(r"^Valentine\s+", "", nombre, flags=re.I).strip()

    DISTRIBUIDORES = [
        {
            "name": "Leroy Merlin",
            "base": "https://www.leroymerlin.es",
            "search": "https://www.leroymerlin.es/fp/search?q={query}",
            "link_sel": "a[data-test='product-thumbnail'], .product-card a, a.product-name",
            "img_sel": ["img[data-test='main-product-image']", ".product-detail-slider img", ".swiper-slide img", "img.product-image"],
            "price_sel": ["[data-test='product-price']", ".price-block .price"],
            "desc_sel": [".product-description__text", ".product-description p"],
        },
        {
            "name": "Bricomart",
            "base": "https://www.bricomart.es",
            "search": "https://www.bricomart.es/catalogsearch/result/?q={query}",
            "link_sel": ".product-item-name a, .product-item-photo",
            "img_sel": [".gallery-placeholder img", ".product.media img", "img.gallery-image"],
            "price_sel": [".price-final_price .price", ".price-wrapper .price"],
            "desc_sel": [".product-attribute-description p"],
        },
        {
            "name": "Bricodepot",
            "base": "https://www.bricodepot.es",
            "search": "https://www.bricodepot.es/search?query={query}",
            "link_sel": ".product-item-name a, a.product-item-photo",
            "img_sel": [".gallery-placeholder img", ".product.media img"],
            "price_sel": [".price-final_price .price"],
            "desc_sel": [".product-attribute-description p"],
        },
    ]

    queries = [f"Valentine {referencia}", f"Valentine {clean}", clean]
    queries = [q for q in queries if q.strip()]

    for dist in DISTRIBUIDORES:
        for query in queries[:2]:
            search_url = dist["search"].format(query=quote_plus(query))
            soup = _soup(search_url)
            if not soup:
                time.sleep(0.8)
                continue

            # Buscar enlace al primer producto
            link = None
            for a in soup.select(dist["link_sel"])[:3]:
                href = a.get("href", "")
                if href and href not in ("#", ""):
                    link = href if href.startswith("http") else urljoin(dist["base"], href)
                    break

            if link:
                img, price, desc = _get_page_data(link, dist["img_sel"], dist["price_sel"], dist["desc_sel"], dist["base"])
                if img:
                    result.imagen = img; result.precio = price; result.descripcion = desc
                    result.url_producto = link; result.fuente = dist["name"]
                    return result
            else:
                # og:image directo en resultados de búsqueda
                og = _og_image(soup, dist["base"])
                if og:
                    result.imagen = og
                    result.fuente = dist["name"]
                    return result

            time.sleep(1.0)

    return result


# ── Clase de resultado ─────────────────────────────────────────────────────────

class ProductData:
    def __init__(self):
        self.imagen: Optional[str] = None
        self.precio: Optional[float] = None
        self.descripcion: Optional[str] = None
        self.url_producto: Optional[str] = None
        self.fuente: str = ""


def _scrape_producto(marca: str, nombre: str, referencia: str = "") -> ProductData:
    if marca == "Higaltor":
        return _scrape_higaltor(nombre, referencia)
    elif marca == "Kerakoll":
        return _scrape_kerakoll(nombre, referencia)
    elif marca == "Valentine":
        return _scrape_valentine_distribuidores(nombre, referencia)
    return ProductData()


def _descargar_imagen(img_url: str, product_id: str, uploads_dir: str) -> Optional[str]:
    try:
        r = SESSION.get(img_url, timeout=TIMEOUT, stream=True)
        r.raise_for_status()
        content_type = r.headers.get("Content-Type", "image/jpeg").split(";")[0].strip()
        ext_map = {"image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png",
                   "image/webp": "webp", "image/gif": "gif"}
        ext = ext_map.get(content_type, "jpg")
        content = b"".join(r.iter_content(8192))
        if len(content) < 5000:
            logger.debug(f"[scraper] Imagen demasiado pequeña ({len(content)} bytes): {img_url}")
            return None
        safe_id = re.sub(r"[^a-z0-9-]", "-", product_id.lower())
        filename = f"{safe_id}.{ext}"
        with open(os.path.join(uploads_dir, filename), "wb") as f:
            f.write(content)
        logger.info(f"[scraper] Guardado: {filename} ({len(content)//1024} KB)")
        return f"/uploads/{filename}"
    except Exception as exc:
        logger.debug(f"[scraper] Error descargando {img_url}: {exc}")
        return None


# ── API pública ────────────────────────────────────────────────────────────────

class ScrapResult:
    def __init__(self, product_id, actualizado, imagen,
                 precio=None, descripcion=None, url_producto=None, fuente="", error=""):
        self.product_id   = product_id
        self.actualizado  = actualizado
        self.imagen       = imagen
        self.precio       = precio
        self.descripcion  = descripcion
        self.url_producto = url_producto
        self.fuente       = fuente
        self.error        = error

    def to_dict(self):
        return vars(self)


def actualizar_imagen_producto(product_id, marca, nombre, referencia, uploads_dir) -> ScrapResult:
    if not BS4_OK:
        return ScrapResult(product_id, False, None, error="beautifulsoup4 no instalado")

    data = _scrape_producto(marca, nombre, referencia or "")

    if not data.imagen:
        return ScrapResult(product_id, False, None,
                           precio=data.precio, descripcion=data.descripcion,
                           fuente=data.fuente, error="No se encontró imagen")

    local = _descargar_imagen(data.imagen, product_id, uploads_dir)
    if not local:
        return ScrapResult(product_id, False, None,
                           precio=data.precio, descripcion=data.descripcion,
                           fuente=data.fuente, error=f"Error descargando: {data.imagen}")

    return ScrapResult(product_id, True, local,
                       precio=data.precio, descripcion=data.descripcion,
                       url_producto=data.url_producto, fuente=data.fuente)


def actualizar_marca_completa(marca, productos, uploads_dir, solo_sin_imagen=True):
    PLACEHOLDER = {"/img/placeholder.jpg", "/img/placeholder.svg", "", None}
    resultados = []
    for p in productos:
        if solo_sin_imagen and p.get("imagen") not in PLACEHOLDER:
            continue
        result = actualizar_imagen_producto(p["id"], marca, p.get("nombre", ""),
                                            p.get("referencia", ""), uploads_dir)
        resultados.append(result)
        time.sleep(1.5)
    return resultados
