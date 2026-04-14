"""
Scraper de webs de proveedores para obtener imágenes y descripciones actualizadas.
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
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
    "DNT": "1",
})
TIMEOUT = 15

# ── Configuración por marca ───────────────────────────────────────────────────

BRAND_CONFIG = {
    "Valentine": {
        "base_url": "https://www.valentine.es",
        "search_urls": [
            "https://www.valentine.es/buscar/{query}",
            "https://www.valentine.es/search?q={query}",
        ],
        "product_link_selector": "a.product-link, .product-name a, h2.product-title a, .products a",
        "img_selectors": [
            ".product-images img",
            ".woocommerce-product-gallery__image img",
            ".product-img img",
            ".ficha-imagen img",
            "article.product img",
            ".wp-post-image",
        ],
        "result_link_selector": ".products .product a, .product-item a, .product-link",
    },
    "Kerakoll": {
        "base_url": "https://www.kerakoll.com",
        "search_urls": [
            "https://www.kerakoll.com/es/search?q={query}",
            "https://www.kerakoll.com/es/buscar/{query}",
        ],
        "img_selectors": [
            ".product-detail-image img",
            ".product-img img",
            ".product-images img",
            ".product-gallery img",
            ".woocommerce-product-gallery img",
            "img.product-image",
        ],
        "result_link_selector": ".product-name a, .product-title a, .products a, .search-result a",
    },
    "Higaltor": {
        "base_url": "https://higaltor.es",
        "search_urls": [
            "https://higaltor.es/?s={query}&post_type=product",
            "https://higaltor.es/?s={query}",
            "https://www.higaltor.es/?s={query}",
        ],
        "img_selectors": [
            ".woocommerce-product-gallery__image img",
            ".wp-post-image",
            ".attachment-woocommerce_thumbnail",
            ".product-img img",
            "article.product img",
        ],
        "result_link_selector": ".products .product a.woocommerce-loop-product__link, .product-item a, li.product a",
    },
}

# ── Utilidades ────────────────────────────────────────────────────────────────

def _get(url: str) -> Optional[requests.Response]:
    try:
        r = SESSION.get(url, timeout=TIMEOUT, allow_redirects=True)
        r.raise_for_status()
        return r
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
                # Priorizar data-src (lazy loading) sobre src
                src = img.get("data-src") or img.get("data-lazy-src") or img.get("src") or ""
                src = src.strip()
                if not src or src.startswith("data:"):
                    continue
                # Ignorar imágenes pequeñas (iconos, thumbnails de carrito, etc.)
                width = img.get("width") or img.get("data-width") or ""
                try:
                    if int(width) < 150:
                        continue
                except (ValueError, TypeError):
                    pass
                # Convertir URL relativa a absoluta
                if src.startswith("//"):
                    src = "https:" + src
                elif src.startswith("/"):
                    src = base_url.rstrip("/") + src
                elif not src.startswith("http"):
                    src = urljoin(base_url, src)
                # Ignorar placeholders genéricos
                if any(x in src.lower() for x in ["placeholder", "no-image", "noimage", "blank"]):
                    continue
                return src
        except Exception:
            continue
    return None


def _find_product_link(soup: "BeautifulSoup", query: str, selector: str) -> Optional[str]:
    """Busca el enlace al producto más relevante en los resultados de búsqueda."""
    try:
        links = soup.select(selector)
        if not links:
            # Fallback: buscar cualquier enlace que contenga términos de búsqueda
            query_words = [w.lower() for w in query.split()[:3]]
            for a in soup.find_all("a", href=True):
                text = a.get_text(strip=True).lower()
                if any(w in text for w in query_words):
                    return a["href"]
        for link in links[:3]:  # Solo mirar los primeros 3 resultados
            href = link.get("href", "")
            if href and href != "#":
                return href
    except Exception:
        pass
    return None


# ── Scraper por marca ─────────────────────────────────────────────────────────

def _scrape_imagen(marca: str, nombre: str, referencia: str = "") -> Optional[str]:
    """
    Intenta encontrar la imagen oficial del producto en la web del fabricante.
    Retorna URL de la imagen o None si no encuentra nada.
    """
    if not BS4_OK:
        return None

    config = BRAND_CONFIG.get(marca)
    if not config:
        return None

    base_url = config["base_url"]

    # Construir la query de búsqueda
    # Quitar prefijo de marca del nombre (e.g. "Valentine IMPRI..." → "IMPRI...")
    clean_name = re.sub(rf"^{re.escape(marca)}\s+", "", nombre, flags=re.I).strip()
    # Usar solo las primeras palabras significativas
    query_parts = clean_name.split()[:4]
    if referencia:
        query_parts = [referencia] + query_parts[:2]
    query = " ".join(query_parts)

    logger.info(f"[scraper] {marca}: buscando '{query}'")

    # Intentar cada URL de búsqueda
    for search_url_tpl in config["search_urls"]:
        search_url = search_url_tpl.format(query=quote_plus(query))
        soup = _soup(search_url)
        if not soup:
            time.sleep(0.5)
            continue

        # Buscar el enlace al producto en los resultados
        product_link = _find_product_link(soup, query, config["result_link_selector"])

        if product_link:
            # Convertir a URL absoluta
            if not product_link.startswith("http"):
                product_link = urljoin(base_url, product_link)

            product_soup = _soup(product_link)
            if product_soup:
                img_url = _best_img_src(product_soup, config["img_selectors"], base_url)
                if img_url:
                    logger.info(f"[scraper] {marca}: imagen encontrada → {img_url}")
                    return img_url
        else:
            # Puede que la página de búsqueda ya muestre imágenes directamente
            img_url = _best_img_src(soup, config["img_selectors"], base_url)
            if img_url:
                logger.info(f"[scraper] {marca}: imagen directa en búsqueda → {img_url}")
                return img_url

        time.sleep(0.8)  # Ser respetuosos con el servidor

    logger.debug(f"[scraper] {marca}: no se encontró imagen para '{query}'")
    return None


def _descargar_imagen(img_url: str, product_id: str, uploads_dir: str) -> Optional[str]:
    """
    Descarga la imagen desde img_url y la guarda en uploads_dir.
    Retorna la ruta relativa /uploads/{filename} o None si falla.
    """
    try:
        r = SESSION.get(img_url, timeout=TIMEOUT, stream=True)
        r.raise_for_status()

        # Detectar extensión por Content-Type
        content_type = r.headers.get("Content-Type", "image/jpeg")
        ext_map = {
            "image/jpeg": "jpg",
            "image/jpg": "jpg",
            "image/png": "png",
            "image/webp": "webp",
            "image/gif": "gif",
        }
        ext = ext_map.get(content_type.split(";")[0].strip(), "jpg")

        # Usar product_id como nombre de archivo (predecible y sin colisiones)
        safe_id = re.sub(r"[^a-z0-9-]", "-", product_id.lower())
        filename = f"{safe_id}.{ext}"
        filepath = os.path.join(uploads_dir, filename)

        with open(filepath, "wb") as f:
            for chunk in r.iter_content(chunk_size=8192):
                f.write(chunk)

        logger.info(f"[scraper] Imagen guardada: {filepath}")
        return f"/uploads/{filename}"

    except Exception as exc:
        logger.debug(f"[scraper] Error descargando {img_url}: {exc}")
        return None


# ── API pública ────────────────────────────────────────────────────────────────

class ScrapResult:
    def __init__(self, product_id: str, actualizado: bool, imagen: Optional[str], error: str = ""):
        self.product_id = product_id
        self.actualizado = actualizado
        self.imagen = imagen
        self.error = error

    def to_dict(self):
        return {
            "product_id": self.product_id,
            "actualizado": self.actualizado,
            "imagen": self.imagen,
            "error": self.error,
        }


def actualizar_imagen_producto(
    product_id: str,
    marca: str,
    nombre: str,
    referencia: str,
    uploads_dir: str,
) -> ScrapResult:
    """
    Busca la imagen oficial del producto en la web del fabricante y la descarga.
    Retorna ScrapResult con la ruta de la imagen local o error.
    """
    if not BS4_OK:
        return ScrapResult(product_id, False, None, "beautifulsoup4 no instalado")

    img_url = _scrape_imagen(marca, nombre, referencia or "")
    if not img_url:
        return ScrapResult(product_id, False, None, "No se encontró imagen en la web del fabricante")

    local_path = _descargar_imagen(img_url, product_id, uploads_dir)
    if not local_path:
        return ScrapResult(product_id, False, None, f"Error descargando imagen desde {img_url}")

    return ScrapResult(product_id, True, local_path)


def actualizar_marca_completa(
    marca: str,
    productos: list,
    uploads_dir: str,
    solo_sin_imagen: bool = True,
) -> list:
    """
    Actualiza imágenes para todos los productos de una marca.

    Args:
        marca: 'Valentine' | 'Kerakoll' | 'Higaltor'
        productos: lista de dicts con keys: id, nombre, referencia, imagen
        uploads_dir: directorio donde guardar las imágenes descargadas
        solo_sin_imagen: si True, solo actualiza productos con imagen placeholder/sin imagen

    Returns:
        lista de ScrapResult
    """
    PLACEHOLDER_PATHS = {"/img/placeholder.jpg", "/img/placeholder.svg", "", None}
    resultados = []

    for p in productos:
        if solo_sin_imagen and p.get("imagen") not in PLACEHOLDER_PATHS:
            # Tiene imagen real — saltar
            continue

        result = actualizar_imagen_producto(
            product_id=p["id"],
            marca=marca,
            nombre=p.get("nombre", ""),
            referencia=p.get("referencia", ""),
            uploads_dir=uploads_dir,
        )
        resultados.append(result)

        # Pausa entre peticiones para no sobrecargar el servidor
        time.sleep(1.0)

    return resultados
