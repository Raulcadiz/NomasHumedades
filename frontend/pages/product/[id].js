import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { API_URL, apiFetch, isLoggedIn, fetchCartCount } from "../../lib/api";

const BRAND_CLASS = {
  Valentine: "brand-valentine",
  Kerakoll:  "brand-kerakoll",
  Higaltor:  "brand-higaltor",
};

export default function Product() {
  const router = useRouter();
  const { id } = router.query;
  const [product, setProduct] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [cartCount, setCartCount] = useState(0);

  useEffect(() => {
    if (id) {
      fetchProduct();
      loadCartCount();
    }
  }, [id]);

  const fetchProduct = async () => {
    try {
      const res = await fetch(`${API_URL}/api/productos/${id}`);
      if (res.ok) {
        const data = await res.json();
        setProduct(data);
      }
    } catch (err) {
      console.error("Error:", err);
    }
  };

  const loadCartCount = async () => {
    setCartCount(await fetchCartCount());
  };

  const addToCart = async () => {
    if (!isLoggedIn()) {
      router.push("/auth");
      return;
    }

    try {
      const res = await apiFetch("/api/carrito", {
        method: "POST",
        body: JSON.stringify({ producto_id: id, cantidad: quantity }),
      });
      if (res.ok) {
        loadCartCount();
        alert("Producto añadido al carrito");
      } else {
        alert("Error al añadir al carrito");
      }
    } catch {
      alert("Error de conexión");
    }
  };

  if (!product) {
    return (
      <>
        <header className="header">
          <div className="container header-inner">
            <Link href="/" className="logo">No<span>+</span>Humedades</Link>
            <nav className="nav">
              <Link href="/">Inicio</Link>
              <Link href="/catalog">Catálogo</Link>
              <Link href="/analysis">Diagnóstico</Link>
            </nav>
            <div className="header-actions">
              <Link href="/auth" className="btn btn-outline btn-sm">Mi cuenta</Link>
              <Link href="/cart" className="cart-icon">🛒</Link>
            </div>
          </div>
        </header>
        <div className="container" style={{ padding: "60px", textAlign: "center" }}>
          <p>Cargando producto...</p>
        </div>
      </>
    );
  }

  return (
    <>
      <header className="header">
        <div className="container header-inner">
          <Link href="/" className="logo">No+Humedades</Link>
          <nav className="nav">
            <Link href="/">Inicio</Link>
            <Link href="/catalog">Catálogo</Link>
            <Link href="/analysis">Análisis IA</Link>
          </nav>
          <div className="header-actions">
            <Link href="/auth" className="btn btn-outline btn-sm">Mi cuenta</Link>
            <Link href="/cart" className="cart-icon">
              🛒
              {cartCount > 0 && <span className="cart-count">{cartCount}</span>}
            </Link>
          </div>
        </div>
      </header>

      <main className="container" style={{ padding: "40px 20px" }}>
        <div className="breadcrumb">
          <Link href="/">Inicio</Link>
          <span>/</span>
          <Link href="/catalog">Catálogo</Link>
          <span>/</span>
          <span>{product.nombre}</span>
        </div>

        <div className="product-detail">
          <div
            className="product-detail-image"
            style={{ backgroundImage: `url(${product.imagen || "/img/placeholder.svg"})` }}
          />
          <div className="product-detail-info">
            <span className={`brand-strip ${BRAND_CLASS[product.marca] || "brand-varios"}`}>
              {product.marca}
            </span>
            <h1>{product.nombre}</h1>
            <div className="product-detail-price">
              {product.precio > 0
                ? <>{product.precio.toFixed(2)} <span>€</span></>
                : <span style={{ fontSize: "18px", color: "var(--gray-500)" }}>Consultar precio</span>
              }
            </div>
            <p className="product-detail-desc">{product.descripcion}</p>

            <div style={{ marginBottom: "16px" }}>
              <strong>Categoría:</strong> {product.categoria}
            </div>
            <div style={{ marginBottom: "16px" }}>
              <strong>Etiquetas:</strong> {product.tags?.join(", ")}
            </div>
            <div style={{ marginBottom: "24px" }}>
              <strong>Stock:</strong> {product.stock > 0 ? `Disponible (${product.stock} unidades)` : "Sin stock"}
            </div>

            <div className="quantity-selector">
              <label>Cantidad:</label>
              <button onClick={() => setQuantity((q) => Math.max(1, q - 1))}>-</button>
              <input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                min="1"
                max={product.stock}
              />
              <button onClick={() => setQuantity((q) => Math.min(product.stock, q + 1))}>+</button>
            </div>

            {product.precio > 0 ? (
              <button
                className="btn btn-primary"
                style={{ width: "100%" }}
                onClick={addToCart}
                disabled={product.stock <= 0}
              >
                Añadir al Carrito
              </button>
            ) : (
              <a
                href={`tel:${process.env.NEXT_PUBLIC_TELEFONO || ""}`}
                className="btn btn-outline"
                style={{ width: "100%", textAlign: "center" }}
              >
                📞 Consultar precio por teléfono
              </a>
            )}
          </div>
        </div>
      </main>

      <footer className="footer">
        <div className="container">
          <div className="footer-bottom">
            © 2024 No+Humedades. Todos los derechos reservados.
          </div>
        </div>
      </footer>
    </>
  );
}