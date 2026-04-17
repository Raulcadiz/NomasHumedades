"""
Scraper de webs de proveedores para obtener imágenes, descripciones y precios.
Busca productos por nombre/referencia en las webs de Valentine, Kerakoll e Higaltor.
"""

import logging
import os
import re
import time
import uuid
from typing import Optional
from urllib.parse import quote_plus, urljoin, urlparse

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
    "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
    "DNT": "1",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
})
TIMEOUT = 20

# ── Configuración por marca ───────────────────────────────────────────────────

BRAND_CONFIG = {
    "Valentine": {
        "base_url": "https://www.valentine.es",
        "search_urls": [
            "https://www.valentine.es/buscar/{query}",
            "https://www.valentine.es/?s={query}&post_type=product",
        ],
        "result_link_selector": (
            "ul.products li.product a.woocommerce-loop-product__link, "
            ".products .product a, .product-name a, h2.woocommerce-loop-product__title"
        ),
        "img_selectors": [
            ".woocommerce-product-gallery__image img",
            ".woocommerce-product-gallery img",
            ".wp-post-image",
            "img.attachment-woocommerce_single",
            ".product-images img",
            "article.product img",
        ],
        "price_selectors": [
            ".woocommerce-Price-amount bdi",
            ".woocommerce-Price-amount",
            "p.price .amount",
            "span.price",
            ".price ins .amount",
            ".price .amount",
        ],
        "desc_selectors": [
            ".woocommerce-product-details__short-description",
            "#tab-description .woocommerce-Tabs-panel",
            ".product-short-description",
            ".entry-summary p",
        ],
    },
    "Kerakoll": {
        "base_url": "https://www.kerakoll.com",
        "search_urls": [
            "https://www.kerakoll.com/es/search?q={query}",
            "https://www.kerakoll.com/es/products?search={query}",
        ],
        "result_link_selector": (
            ".product-name a, .product-title a, "
            ".search-result-item a, .product-item a, "
            "article.product a, .products a"
        ),
        "img_selectors": [
            ".product-detail-image img",
            ".product-image img",
            ".product-gallery__main img",
            "img.product-main-image",
            ".product-img img",
            "img[itemprop='image']",
        ],
        "price_selectors": [
            ".product-price .price",
            ".price-box .price",
            "[data-price-type='finalPrice'] .price",
            ".product-price",
        ],
        "desc_selectors": [
            ".product-description",
            ".product-detail-description",
            "[itemprop='description']",
            ".product-info-main .description",
            ".short-description",
        ],
    },
    "Higaltor": {
        "base_url": "https://higaltor.es",
        "search_urls": [
            "https://higaltor.es/?s={query}&post_type=product",
            "https://higaltor.es/?s={query}",
        ],
        "result_link_selector": (
            "ul.products li.product a.woocommerce-loop-product__link, "
            ".products li.product a, li.product a"
        ),
        "img_selectors": [
            ".woocommerce-product-gallery__image img",
            ".wp-post-image",
            ".attachment-woocommerce_single",
            "img.attachment-woocommerce_thumbnail",
            ".product-img img",
            "article.product img",
        ],
        "price_selectors": [
            ".woocommerce-Price-amount bdi",
            ".woocommerce-Price-amount",
            "p.price .amount",
            ".price ins .amount",
            ".price .amount",
        ],
        "desc_selectors": [
            ".woocommerce-product-details__short-description",
            "#tab-description",
            ".product-short-description",
            ".entry-summary p",
        ],
    },
}

# ── Utilidades ────────────────────────────────────────────────────────────────

def _get(url: str) -> Optional[requests.Response]:
    try:
        r = SESSION.get(url, timeout=TIMEOUT, allow_redirects=True)
        r.raise_for_status()
        return r
    except requests.exceptions.HTTPError as e:
        logger.debug(f"HTTP {e.response.status_code} en {url}")
        return None
    except Exception as exc:
        logger.debug(f"GET {url} → {exc}")
        return None


def _soup(url: str) -> Optional["BeautifulSoup"]:
    if not BS4_OK:
        return None
    r = _get(url)
    if not r:
        return None
    return BeautifulSoup(r.text, "html.parser")


def _best_img_src(soup: "BeautifulSoup", selectors: list, base_url: str) -> Optional[str]:
    """Busca la mejor imagen de producto en la página según los selectores dados."""
    for selector in selectors:
        try:
            imgs = soup.select(selector)
            for img in imgs:
                src = img.get("data-src") or img.get("data-lazy-src") or img.get("srcset", "").split()[0] or img.get("src") or ""
                src = src.strip()
                if not src or src.startswith("data:"):
                    continue
                width = img.get("width") or img.get("data-width") or ""
                try:
                    if int(width) < 100:
                        continue
                except (ValueError, TypeError):
                    pass
                if src.startswith("//"):
                    src = "https:" + src
                elif src.startswith("/"):
                    src = base_url.rstrip("/") + src
                elif not src.startswith("http"):
                    src = urljoin(base_url, src)
                if any(x in src.lower() for x in ["placeholder", "no-image", "noimage", "blank", "logo", "icon"]):
                    continue
                return src
        except Exception:
            continue
    return None


def _extract_price(soup: "BeautifulSoup", selectors: list) -> Optional[float]:
    """Intenta extraer el precio de la página del producto."""
    for selector in selectors:
        try:
            el = soup.select_one(selector)
            if not el:
                continue
            text = el.get_text(strip=True)
            # Limpiar: quitar símbolos y convertir comas a puntos
            text = re.sub(r"[€$£\s]", "", text)
            text = text.replace(",", ".")
            # Extraer el primer número decimal
            match = re.search(r"\d+\.?\d*", text)
            if match:
                price = float(match.group())
                if 0.01 < price < 10000:  # Sanity check
                    return price
        except Exception:
            continue
    return None


def _extract_description(soup: "BeautifulSoup", selectors: list, max_chars: int = 400) -> Optional[str]:
    """Intenta extraer la descripción del producto."""
    for selector in selectors:
        try:
            el = soup.select_one(selector)
            if not el:
                continue
            # Preferir párrafos si el selector devuelve un contenedor
            paragraphs = el.select("p")
            if paragraphs:
                text = " ".join(p.get_text(strip=True) for p in paragraphs[:3])
            else:
                text = el.get_text(separator=" ", strip=True)
            text = re.sub(r"\s+", " ", text).strip()
            if len(text) > 30:  # Ignorar textos muy cortos
                return text[:max_chars]
        except Exception:
            continue
    return None


def _find_product_link(soup: "BeautifulSoup", query: str, selector: str, base_url: str) -> Optional[str]:
    """Busca el enlace al producto más relevante en los resultados de búsqueda."""
    try:
        links = soup.select(selector)
        if links:
            for link in links[:3]:
                href = link.get("href", "")
                if href and href != "#" and not href.startswith("javascript"):
                    if not href.startswith("http"):
                        href = urljoin(base_url, href)
                    return href

        # Fallback: cualquier enlace con términos de búsqueda
        query_words = [w.lower() for w in query.split()[:3] if len(w) > 3]
        for a in soup.find_all("a", href=True):
            text = a.get_text(strip=True).lower()
            if any(w in text for w in query_words):
                href = a["href"]
                if not href.startswith("http"):
                    href = urljoin(base_url, href)
                return href
    except Exception:
        pass
    return None


# ── Scraper principal ─────────────────────────────────────────────────────────

class ProductData:
    """Datos extraídos de la web del fabricante."""
    def __init__(self):
        self.imagen: Optional[str] = None
        self.precio: Optional[float] = None
        self.descripcion: Optional[str] = None
        self.url_producto: Optional[str] = None

    def to_dict(self):
        return {
            "imagen": self.imagen,
            "precio": self.precio,
            "descripcion": self.descripcion,
            "url_producto": self.url_producto,
        }


def _scrape_producto(marca: str, nombre: str, referencia: str = "") -> ProductData:
    """
    Busca imagen, precio y descripción del producto en la web del fabricante.
    """
    result = ProductData()

    if not BS4_OK:
        return result

    config = BRAND_CONFIG.get(marca)
    if not config:
        return result

    base_url = config["base_url"]

    # Construir query de búsqueda
    clean_name = re.sub(rf"^{re.escape(marca)}\s+", "", nombre, flags=re.I).strip()
    query_parts = clean_name.split()[:4]
    if referencia and len(referencia) > 2:
        query_parts = [referencia] + query_parts[:2]
    query = " ".join(query_parts)

    logger.info(f"[scraper] {marca}: buscando '{query}'")

    for search_url_tpl in config["search_urls"]:
        search_url = search_url_tpl.format(query=quote_plus(query))
        soup = _soup(search_url)
        if not soup:
            time.sleep(1.0)
            continue

        # Buscar página del producto
        product_link = _find_product_link(soup, query, config["result_link_selector"], base_url)

        if product_link:
            result.url_producto = product_link
            product_soup = _soup(product_link)
            if product_soup:
                result.imagen      = _best_img_src(product_soup, config["img_selectors"], base_url)
                result.precio      = _extract_price(product_soup, config["price_selectors"])
                result.descripcion = _extract_description(product_soup, config["desc_selectors"])

                if result.imagen:
                    logger.info(f"[scraper] {marca}: imagen={result.imagen[:60]}...")
                if result.precio:
                    logger.info(f"[scraper] {marca}: precio={result.precio}")
                if result.descripcion:
                    logger.info(f"[scraper] {marca}: desc={result.descripcion[:60]}...")

                if result.imagen:
                    return result  # Éxito — tenemos al menos imagen

        else:
            # La página de búsqueda puede mostrar imágenes directamente
            img = _best_img_src(soup, config["img_selectors"], base_url)
            if img:
                result.imagen = img
                return result

        time.sleep(1.0)

    logger.debug(f"[scraper] {marca}: no se encontró nada para '{query}'")
    return result


def _descargar_imagen(img_url: str, product_id: str, uploads_dir: str) -> Optional[str]:
    """Descarga la imagen y la guarda en uploads_dir. Retorna /uploads/{filename} o None."""
    try:
        r = SESSION.get(img_url, timeout=TIMEOUT, stream=True)
        r.raise_for_status()

        content_type = r.headers.get("Content-Type", "image/jpeg")
        ext_map = {
            "image/jpeg": "jpg", "image/jpg": "jpg",
            "image/png": "png", "image/webp": "webp", "image/gif": "gif",
        }
        ext = ext_map.get(content_type.split(";")[0].strip(), "jpg")

        safe_id = re.sub(r"[^a-z0-9-]", "-", product_id.lower())
        filename = f"{safe_id}.{ext}"
        filepath = os.path.join(uploads_dir, filename)

        with open(filepath, "wb") as f:
            for chunk in r.iter_content(chunk_size=8192):
                f.write(chunk)

        logger.info(f"[scraper] Imagen guardada: {filename}")
        return f"/uploads/{filename}"

    except Exception as exc:
        logger.debug(f"[scraper] Error descargando {img_url}: {exc}")
        return None


# ── API pública ────────────────────────────────────────────────────────────────

class ScrapResult:
    def __init__(self, product_id: str, actualizado: bool, imagen: Optional[str],
                 precio: Optional[float] = None, descripcion: Optional[str] = None,
                 url_producto: Optional[str] = None, error: str = ""):
        self.product_id  = product_id
        self.actualizado = actualizado
        self.imagen      = imagen
        self.precio      = precio
        self.descripcion = descripcion
        self.url_producto = url_producto
        self.error       = error

    def to_dict(self):
        return {
            "product_id":   self.product_id,
            "actualizado":  self.actualizado,
            "imagen":       self.imagen,
            "precio":       self.precio,
            "descripcion":  self.descripcion,
            "url_producto": self.url_producto,
            "error":        self.error,
        }


def actualizar_imagen_producto(
    product_id: str,
    marca: str,
    nombre: str,
    referencia: str,
    uploads_dir: str,
) -> ScrapResult:
    """
    Busca imagen, precio y descripción del producto en la web del fabricante.
    Descarga la imagen al servidor local.
    """
    if not BS4_OK:
        return ScrapResult(product_id, False, None, error="beautifulsoup4 no instalado")

    data = _scrape_producto(marca, nombre, referencia or "")

    if not data.imagen:
        return ScrapResult(
            product_id, False, None,
            precio=data.precio, descripcion=data.descripcion,
            url_producto=data.url_producto,
            error="No se encontró imagen en la web del fabricante",
        )

    local_path = _descargar_imagen(data.imagen, product_id, uploads_dir)
    if not local_path:
        return ScrapResult(
            product_id, False, None,
            precio=data.precio, descripcion=data.descripcion,
            url_producto=data.url_producto,
            error=f"Error descargando imagen desde {data.imagen}",
        )

    return ScrapResult(
        product_id, True, local_path,
        precio=data.precio,
        descripcion=data.descripcion,
        url_producto=data.url_producto,
    )


def actualizar_marca_completa(
    marca: str,
    productos: list,
    uploads_dir: str,
    solo_sin_imagen: bool = True,
) -> list:
    """
    Actualiza imagen, precio y descripción para todos los productos de una marca.

    Args:
        marca: 'Valentine' | 'Kerakoll' | 'Higaltor'
        productos: lista de dicts con keys: id, nombre, referencia, imagen
        uploads_dir: directorio donde guardar las imágenes descargadas
        solo_sin_imagen: si True, solo actualiza productos con imagen placeholder

    Returns:
        lista de ScrapResult
    """
    PLACEHOLDER_PATHS = {"/img/placeholder.jpg", "/img/placeholder.svg", "", None}
    resultados = []

    for p in productos:
        if solo_sin_imagen and p.get("imagen") not in PLACEHOLDER_PATHS:
            continue

        result = actualizar_imagen_producto(
            product_id=p["id"],
            marca=marca,
            nombre=p.get("nombre", ""),
            referencia=p.get("referencia", ""),
            uploads_dir=uploads_dir,
        )
        resultados.append(result)
        time.sleep(1.5)  # Respetuosos con el servidor

    return resultados
