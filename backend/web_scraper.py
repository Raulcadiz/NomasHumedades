"""
Scraper de imágenes, descripciones y precios desde múltiples fuentes.
Estrategia: web oficial → Leroy Merlin → slug directo.
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

# ── Configuración de fuentes ──────────────────────────────────────────────────

BRAND_CONFIG = {
    "Valentine": {
        "base_url": "https://www.valentine.es",
        "search_urls": [
            "https://www.valentine.es/?s={query}&post_type=product",
            "https://www.valentine.es/buscar/{query}",
        ],
        "result_link_selector": (
            "ul.products li.product a.woocommerce-loop-product__link, "
            ".products li.product a, .product a.woocommerce-loop-product__link"
        ),
        "img_selectors": [
            ".woocommerce-product-gallery__image img",
            ".woocommerce-product-gallery img",
            ".wp-post-image",
            "img.attachment-woocommerce_single",
            ".product-images img",
        ],
        "price_selectors": [
            ".woocommerce-Price-amount bdi",
            ".woocommerce-Price-amount",
            "p.price .amount",
        ],
        "desc_selectors": [
            ".woocommerce-product-details__short-description",
            ".woocommerce-Tabs-panel--description",
            ".entry-summary p",
        ],
    },
    "Kerakoll": {
        "base_url": "https://www.kerakoll.com",
        "search_urls": [
            "https://www.kerakoll.com/es/search?q={query}",
        ],
        "result_link_selector": (
            ".product-name a, .product-title a, "
            ".search-result-item a, article.product a"
        ),
        "img_selectors": [
            ".product-detail-image img",
            ".product-gallery__main img",
            "img.product-main-image",
            ".product-img img",
            "img[itemprop='image']",
        ],
        "price_selectors": [
            ".product-price .price",
            "[data-price-type='finalPrice'] .price",
        ],
        "desc_selectors": [
            ".product-description",
            "[itemprop='description']",
            ".short-description",
        ],
    },
    "Higaltor": {
        "base_url": "https://higaltor.es",
        "search_urls": [
            "https://higaltor.es/?s={query}&post_type=product",
        ],
        "result_link_selector": (
            "ul.products li.product a.woocommerce-loop-product__link, "
            "li.product a"
        ),
        "img_selectors": [
            ".woocommerce-product-gallery__image img",
            ".wp-post-image",
            ".attachment-woocommerce_single",
        ],
        "price_selectors": [
            ".woocommerce-Price-amount bdi",
            ".woocommerce-Price-amount",
            "p.price .amount",
        ],
        "desc_selectors": [
            ".woocommerce-product-details__short-description",
            "#tab-description",
        ],
    },
}

# Fuentes de respaldo — distribuidores que venden estas marcas
FALLBACK_SOURCES = [
    {
        "name": "Leroy Merlin",
        "search_url": "https://www.leroymerlin.es/fp/search?q={query}",
        "result_link_selector": (
            "a[data-test='product-thumbnail'], "
            ".product-card a, article a.product-link, "
            "a.product-name, .catalog-product-card a"
        ),
        "img_selectors": [
            "img[data-test='main-product-image']",
            ".product-detail-slider img",
            ".swiper-slide img",
            ".product-gallery img",
            ".zoom-image img",
            "img.product-image",
        ],
        "price_selectors": [
            "[data-test='product-price']",
            ".price-block .price",
            ".product-price",
        ],
        "desc_selectors": [
            ".product-description__text",
            ".product-description p",
        ],
        "base_url": "https://www.leroymerlin.es",
    },
    {
        "name": "Bricodepot",
        "search_url": "https://www.bricodepot.es/search?query={query}",
        "result_link_selector": "a.product-item-photo, .product-item-name a",
        "img_selectors": [
            ".gallery-placeholder img",
            ".product.media img",
            "img.gallery-image",
        ],
        "price_selectors": [".price-final_price .price", ".price-wrapper .price"],
        "desc_selectors": [".product-attribute-description p"],
        "base_url": "https://www.bricodepot.es",
    },
]

# ── Utilidades ────────────────────────────────────────────────────────────────

def _slugify(text: str) -> str:
    """Convierte texto a slug WooCommerce (minúsculas, sin acentos, guiones)."""
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[-\s]+", "-", text)
    return text.strip("-")


def _get(url: str, retries: int = 2) -> Optional[requests.Response]:
    for attempt in range(retries):
        try:
            r = SESSION.get(url, timeout=TIMEOUT, allow_redirects=True)
            if r.status_code == 404:
                return None
            r.raise_for_status()
            return r
        except requests.exceptions.HTTPError as e:
            logger.debug(f"HTTP {e.response.status_code} en {url}")
            return None
        except requests.exceptions.Timeout:
            logger.debug(f"Timeout en {url} (intento {attempt+1})")
            time.sleep(1.0)
        except Exception as exc:
            logger.debug(f"GET {url} → {exc}")
            return None
    return None


def _soup(url: str) -> Optional["BeautifulSoup"]:
    if not BS4_OK:
        return None
    r = _get(url)
    if not r:
        return None
    return BeautifulSoup(r.text, "html.parser")


def _best_img(soup: "BeautifulSoup", selectors: list, base_url: str) -> Optional[str]:
    """Busca la mejor imagen en la página."""
    for selector in selectors:
        try:
            for img in soup.select(selector):
                src = (
                    img.get("data-src") or
                    img.get("data-lazy-src") or
                    img.get("data-original") or
                    (img.get("srcset", "").split()[0] if img.get("srcset") else None) or
                    img.get("src") or ""
                )
                src = src.strip()
                if not src or src.startswith("data:"):
                    continue
                # Ignorar imágenes muy pequeñas
                for dim_attr in ("width", "data-width", "height"):
                    try:
                        if int(img.get(dim_attr, 0)) < 80:
                            src = ""
                            break
                    except (ValueError, TypeError):
                        pass
                if not src:
                    continue
                # Normalizar URL
                if src.startswith("//"):
                    src = "https:" + src
                elif src.startswith("/"):
                    src = base_url.rstrip("/") + src
                elif not src.startswith("http"):
                    src = urljoin(base_url, src)
                # Descartar logos, placeholders
                low = src.lower()
                if any(x in low for x in ["placeholder", "no-image", "noimage", "blank", "logo", "icon", "spinner", "loading"]):
                    continue
                return src
        except Exception:
            continue
    return None


def _extract_price(soup: "BeautifulSoup", selectors: list) -> Optional[float]:
    for selector in selectors:
        try:
            el = soup.select_one(selector)
            if not el:
                continue
            text = re.sub(r"[€$£\s\xa0]", "", el.get_text(strip=True))
            text = text.replace(",", ".")
            m = re.search(r"\d+\.?\d*", text)
            if m:
                price = float(m.group())
                if 0.01 < price < 10000:
                    return price
        except Exception:
            continue
    return None


def _extract_desc(soup: "BeautifulSoup", selectors: list, max_chars: int = 400) -> Optional[str]:
    for selector in selectors:
        try:
            el = soup.select_one(selector)
            if not el:
                continue
            parts = el.select("p") or [el]
            text = " ".join(p.get_text(strip=True) for p in parts[:3])
            text = re.sub(r"\s+", " ", text).strip()
            if len(text) > 30:
                return text[:max_chars]
        except Exception:
            continue
    return None


def _find_product_link(soup: "BeautifulSoup", query: str, selector: str, base_url: str) -> Optional[str]:
    try:
        links = soup.select(selector)
        if links:
            for link in links[:3]:
                href = link.get("href", "")
                if href and href not in ("#", "") and not href.startswith("javascript"):
                    return href if href.startswith("http") else urljoin(base_url, href)
        # Fallback: buscar por palabras de la query
        words = [w.lower() for w in query.split()[:3] if len(w) > 3]
        for a in soup.find_all("a", href=True):
            text = a.get_text(strip=True).lower()
            if sum(1 for w in words if w in text) >= 2:
                href = a["href"]
                return href if href.startswith("http") else urljoin(base_url, href)
    except Exception:
        pass
    return None


# ── Resultado del scraping ────────────────────────────────────────────────────

class ProductData:
    def __init__(self):
        self.imagen: Optional[str] = None
        self.precio: Optional[float] = None
        self.descripcion: Optional[str] = None
        self.url_producto: Optional[str] = None
        self.fuente: str = ""


def _scrape_source(config: dict, query: str, brand_name: str = "") -> ProductData:
    """Intenta obtener datos de producto de una fuente (brand website o distribuidor)."""
    result = ProductData()
    base_url = config["base_url"]

    for search_tpl in config.get("search_urls", []):
        search_url = search_tpl.format(query=quote_plus(query))
        soup = _soup(search_url)
        if not soup:
            time.sleep(0.8)
            continue

        # Buscar enlace al producto en los resultados
        link = _find_product_link(soup, query, config.get("result_link_selector", "a"), base_url)

        if link:
            result.url_producto = link
            prod_soup = _soup(link)
            if prod_soup:
                result.imagen      = _best_img(prod_soup, config["img_selectors"], base_url)
                result.precio      = _extract_price(prod_soup, config.get("price_selectors", []))
                result.descripcion = _extract_desc(prod_soup, config.get("desc_selectors", []))
                if result.imagen:
                    return result
        else:
            # La página de búsqueda puede tener imágenes directamente
            img = _best_img(soup, config["img_selectors"], base_url)
            if img:
                result.imagen = img
                result.precio = _extract_price(soup, config.get("price_selectors", []))
                result.descripcion = _extract_desc(soup, config.get("desc_selectors", []))
                return result

        time.sleep(0.8)

    return result


def _scrape_producto(marca: str, nombre: str, referencia: str = "") -> ProductData:
    """
    Busca imagen, precio y descripción usando múltiples fuentes en orden:
    1. Web oficial de la marca (slug directo para Valentine)
    2. Fuentes de respaldo (Leroy Merlin, etc.)
    """
    # Construir la query de búsqueda
    clean_name = re.sub(rf"^{re.escape(marca)}\s+", "", nombre, flags=re.I).strip()
    query_parts = clean_name.split()[:4]
    if referencia and len(referencia) > 2:
        query_parts = [referencia] + query_parts[:2]
    query = " ".join(query_parts)
    query_con_marca = f"{marca} {clean_name}".strip()

    logger.info(f"[scraper] {marca}: '{query}'")

    brand_cfg = BRAND_CONFIG.get(marca)

    # ── Estrategia 1: URL directa por slug (Valentine WooCommerce) ────────────
    if marca == "Valentine" and brand_cfg:
        slug = _slugify(clean_name)
        if slug:
            direct_url = f"{brand_cfg['base_url']}/producto/{slug}/"
            soup = _soup(direct_url)
            if soup:
                result = ProductData()
                result.url_producto = direct_url
                result.imagen = _best_img(soup, brand_cfg["img_selectors"], brand_cfg["base_url"])
                result.precio = _extract_price(soup, brand_cfg["price_selectors"])
                result.descripcion = _extract_desc(soup, brand_cfg["desc_selectors"])
                if result.imagen:
                    result.fuente = "valentine.es (slug)"
                    logger.info(f"[scraper] Valentine slug directo: {direct_url}")
                    return result

    # ── Estrategia 2: Búsqueda en web oficial ────────────────────────────────
    if brand_cfg:
        result = _scrape_source(brand_cfg, query, marca)
        if result.imagen:
            result.fuente = brand_cfg["base_url"]
            return result
        # Intentar con query alternativa (referencia sola)
        if referencia:
            result = _scrape_source(brand_cfg, referencia, marca)
            if result.imagen:
                result.fuente = brand_cfg["base_url"]
                return result

    time.sleep(0.5)

    # ── Estrategia 3: Fuentes de respaldo (distribuidores) ───────────────────
    for fallback in FALLBACK_SOURCES:
        for q in [query_con_marca, query]:
            result = _scrape_source(fallback, q)
            if result.imagen:
                result.fuente = fallback["name"]
                logger.info(f"[scraper] {marca}: imagen desde {fallback['name']}")
                return result
            time.sleep(0.8)

    logger.debug(f"[scraper] {marca}: no se encontró imagen para '{query}'")
    return ProductData()


def _descargar_imagen(img_url: str, product_id: str, uploads_dir: str) -> Optional[str]:
    """Descarga la imagen y la guarda en uploads_dir."""
    try:
        r = SESSION.get(img_url, timeout=TIMEOUT, stream=True)
        r.raise_for_status()

        content_type = r.headers.get("Content-Type", "image/jpeg").split(";")[0].strip()
        ext_map = {
            "image/jpeg": "jpg", "image/jpg": "jpg",
            "image/png": "png", "image/webp": "webp", "image/gif": "gif",
        }
        ext = ext_map.get(content_type, "jpg")

        # Verificar que es realmente una imagen (mínimo 5KB)
        content = b"".join(r.iter_content(chunk_size=8192))
        if len(content) < 5000:
            logger.debug(f"[scraper] Imagen demasiado pequeña: {len(content)} bytes")
            return None

        safe_id = re.sub(r"[^a-z0-9-]", "-", product_id.lower())
        filename = f"{safe_id}.{ext}"
        filepath = os.path.join(uploads_dir, filename)

        with open(filepath, "wb") as f:
            f.write(content)

        logger.info(f"[scraper] Guardado: {filename} ({len(content)//1024} KB)")
        return f"/uploads/{filename}"

    except Exception as exc:
        logger.debug(f"[scraper] Error descargando {img_url}: {exc}")
        return None


# ── API pública ────────────────────────────────────────────────────────────────

class ScrapResult:
    def __init__(self, product_id: str, actualizado: bool, imagen: Optional[str],
                 precio: Optional[float] = None, descripcion: Optional[str] = None,
                 url_producto: Optional[str] = None, fuente: str = "", error: str = ""):
        self.product_id   = product_id
        self.actualizado  = actualizado
        self.imagen       = imagen
        self.precio       = precio
        self.descripcion  = descripcion
        self.url_producto = url_producto
        self.fuente       = fuente
        self.error        = error

    def to_dict(self):
        return {
            "product_id":   self.product_id,
            "actualizado":  self.actualizado,
            "imagen":       self.imagen,
            "precio":       self.precio,
            "descripcion":  self.descripcion,
            "url_producto": self.url_producto,
            "fuente":       self.fuente,
            "error":        self.error,
        }


def actualizar_imagen_producto(
    product_id: str, marca: str, nombre: str, referencia: str, uploads_dir: str,
) -> ScrapResult:
    if not BS4_OK:
        return ScrapResult(product_id, False, None, error="beautifulsoup4 no instalado")

    data = _scrape_producto(marca, nombre, referencia or "")

    if not data.imagen:
        return ScrapResult(
            product_id, False, None,
            precio=data.precio, descripcion=data.descripcion,
            url_producto=data.url_producto, fuente=data.fuente,
            error="No se encontró imagen",
        )

    local_path = _descargar_imagen(data.imagen, product_id, uploads_dir)
    if not local_path:
        return ScrapResult(
            product_id, False, None,
            precio=data.precio, descripcion=data.descripcion,
            url_producto=data.url_producto, fuente=data.fuente,
            error=f"Error descargando: {data.imagen}",
        )

    return ScrapResult(
        product_id, True, local_path,
        precio=data.precio, descripcion=data.descripcion,
        url_producto=data.url_producto, fuente=data.fuente,
    )


def actualizar_marca_completa(
    marca: str, productos: list, uploads_dir: str, solo_sin_imagen: bool = True,
) -> list:
    PLACEHOLDER = {"/img/placeholder.jpg", "/img/placeholder.svg", "", None}
    resultados = []
    for p in productos:
        if solo_sin_imagen and p.get("imagen") not in PLACEHOLDER:
            continue
        result = actualizar_imagen_producto(
            product_id=p["id"], marca=marca,
            nombre=p.get("nombre", ""), referencia=p.get("referencia", ""),
            uploads_dir=uploads_dir,
        )
        resultados.append(result)
        time.sleep(1.5)
    return resultados
