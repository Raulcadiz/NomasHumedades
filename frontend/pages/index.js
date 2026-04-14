import { useState, useEffect } from "react";
import Link from "next/link";
import { API_URL, apiFetch, isLoggedIn, isAdmin, getUserName, fetchCartCount } from "../lib/api";

const BRAND_CLASS = {
  Valentine: "brand-valentine",
  Kerakoll:  "brand-kerakoll",
  Higaltor:  "brand-higaltor",
};

export default function Home() {
  const [categories, setCategories] = useState([]);
  const [products,   setProducts]   = useState([]);
  const [cartCount,  setCartCount]  = useState(0);
  const [loggedIn,   setLoggedIn]   = useState(false);
  const [userName,   setUserName]   = useState("");

  useEffect(() => {
    fetchCategories();
    fetchFeaturedProducts();
    loadCartCount();
    setLoggedIn(isLoggedIn());
    setUserName(getUserName() || "");
  }, []);

  const fetchCategories = async () => {
    try { const r = await fetch(`${API_URL}/api/categorias`); setCategories(await r.json()); } catch {}
  };
  const fetchFeaturedProducts = async () => {
    try { const r = await fetch(`${API_URL}/api/productos-destacados`); setProducts(await r.json()); } catch {}
  };
  const loadCartCount = async () => { setCartCount(await fetchCartCount()); };

  const addToCart = async (productId) => {
    if (!isLoggedIn()) { window.location.href = "/auth"; return; }
    const res = await apiFetch("/api/carrito", {
      method: "POST", body: JSON.stringify({ producto_id: productId, cantidad: 1 }),
    });
    if (res.ok) { loadCartCount(); alert("✓ Producto añadido al carrito"); }
    else alert("Error al añadir al carrito");
  };

  return (
    <>
      {/* ── HEADER ── */}
      <header className="header">
        <div className="container header-inner">
          <Link href="/" className="logo">No<span>+</span>Humedades</Link>
          <nav className="nav">
            <Link href="/">Inicio</Link>
            <Link href="/catalog">Catálogo</Link>
            <Link href="/analysis">Diagnóstico</Link>
          </nav>
          <div className="header-actions">
            {loggedIn ? (
              <>
                <Link href="/mis-pedidos" className="btn btn-outline btn-sm">
                  {userName ? `Hola, ${userName.split(" ")[0]}` : "Mis pedidos"}
                </Link>
                {isAdmin() && (
                  <Link href="/admin" className="btn btn-outline btn-sm">Admin</Link>
                )}
              </>
            ) : (
              <Link href="/auth" className="btn btn-outline btn-sm">Entrar</Link>
            )}
            <Link href="/cart" className="cart-icon">
              🛒{cartCount > 0 && <span className="cart-count">{cartCount}</span>}
            </Link>
          </div>
        </div>
      </header>

      {/* ── HERO ── */}
      <section className="hero">
        <div className="container">
          <div className="hero-badge">⭐ Distribuidor oficial en Cádiz</div>
          <h1>Soluciones Profesionales<br/>contra las Humedades</h1>
          <p>Valentine · Kerakoll · Higaltor — Diagnóstico gratuito y envío en 24 h</p>
          <div className="hero-buttons">
            <Link href="/catalog" className="btn btn-primary btn-lg">Ver Catálogo</Link>
            <Link href="/analysis" className="btn btn-ghost btn-lg">Diagnosticar Humedad</Link>
          </div>
          <div className="hero-brands">
            <span className="hero-brand-badge">🎨 Valentine</span>
            <span className="hero-brand-badge">🧱 Kerakoll</span>
            <span className="hero-brand-badge">🌊 Higaltor</span>
          </div>
        </div>
      </section>

      {/* ── CATEGORÍAS ── */}
      <section className="section">
        <div className="container">
          <div className="section-header">
            <div className="section-label">Navega por</div>
            <h2 className="section-title">Categorías de Producto</h2>
          </div>
          <div className="categories-grid">
            {categories.map((cat) => (
              <Link
                key={cat.id}
                href={`/catalog?categoria=${cat.id}`}
                className="category-card"
                data-cat={cat.id}
              >
                <div className="category-icon">{cat.icono}</div>
                <div className="category-name">{cat.nombre}</div>
                {cat.descripcion && (
                  <div className="category-desc">{cat.descripcion}</div>
                )}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── DESTACADOS ── */}
      <section className="section section-alt">
        <div className="container">
          <div className="section-header">
            <div className="section-label">Más vendidos</div>
            <h2 className="section-title">Productos Destacados</h2>
            <p className="section-subtitle">La selección de nuestros clientes profesionales</p>
          </div>
          <div className="products-grid">
            {products.map((product) => (
              <div key={product.id} className="product-card">
                <Link href={`/product/${product.id}`}>
                  <div
                    className="product-image"
                    style={{ backgroundImage: `url(${product.imagen || "/img/placeholder.svg"})` }}
                  />
                </Link>
                <div className="product-info">
                  <span className={`brand-strip ${BRAND_CLASS[product.marca] || "brand-varios"}`}>
                    {product.marca}
                  </span>
                  <Link href={`/product/${product.id}`}>
                    <div className="product-name">{product.nombre}</div>
                  </Link>
                  <div className="product-desc">{product.descripcion}</div>
                  <div className="product-price">
                    {product.precio > 0
                      ? <>{product.precio.toFixed(2)} <span>€ + IVA</span></>
                      : <span style={{ fontSize: "15px", color: "var(--gray-500)", fontWeight: 400 }}>Consultar precio</span>
                    }
                  </div>
                  <div className="product-actions">
                    {product.precio > 0 && (
                      <button className="btn btn-primary btn-sm" onClick={() => addToCart(product.id)}>
                        + Carrito
                      </button>
                    )}
                    <Link href={`/product/${product.id}`} className="btn btn-outline btn-sm">Ver ficha</Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ textAlign: "center", marginTop: "36px" }}>
            <Link href="/catalog" className="btn btn-secondary">Ver todo el catálogo →</Link>
          </div>
        </div>
      </section>

      {/* ── TIPOS DE HUMEDAD ── */}
      <section className="section">
        <div className="container">
          <div className="section-header">
            <div className="section-label">¿Tienes problemas?</div>
            <h2 className="section-title">Identifica tu tipo de humedad</h2>
            <p className="section-subtitle">Nuestro sistema de diagnóstico te guía en minutos</p>
          </div>
          <div className="humidity-cards">
            <div className="humidity-card condensacion">
              <div className="hc-icon">💧</div>
              <h3>Condensación</h3>
              <p>Vapor de agua que se condensa en superficies frías. Aparece en ventanas y esquinas. Solución: ventilación y pinturas antimoho.</p>
            </div>
            <div className="humidity-card capilaridad">
              <div className="hc-icon">📈</div>
              <h3>Capilaridad</h3>
              <p>Ascenso de agua desde el suelo por los muros. Manchas de salitre en la base. Solución: barreras horizontales e inyección.</p>
            </div>
            <div className="humidity-card filtracion">
              <div className="hc-icon">🌧️</div>
              <h3>Filtración</h3>
              <p>Entrada de agua desde el exterior por grietas o cubiertas. Empeora con la lluvia. Solución: impermeabilización y sellado.</p>
            </div>
          </div>
          <div style={{ textAlign: "center", marginTop: "32px" }}>
            <Link href="/analysis" className="btn btn-primary btn-lg">
              🩺 Diagnóstico gratuito
            </Link>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="footer">
        <div className="container">
          <div className="footer-grid">
            <div>
              <div className="logo" style={{ marginBottom: "14px", display: "block" }}>No<span>+</span>Humedades</div>
              <p>Distribuidor oficial de materiales de construcción en Cádiz. Valentine, Kerakoll e Higaltor al mejor precio.</p>
            </div>
            <div>
              <h4>Marcas</h4>
              <Link href="/catalog?marca=Valentine">Valentine</Link>
              <Link href="/catalog?marca=Kerakoll">Kerakoll</Link>
              <Link href="/catalog?marca=Higaltor">Higaltor</Link>
            </div>
            <div>
              <h4>Categorías</h4>
              <Link href="/catalog?categoria=pinturas">Pinturas</Link>
              <Link href="/catalog?categoria=impermeabilizantes">Impermeabilizantes</Link>
              <Link href="/catalog?categoria=adhesivos">Adhesivos y Morteros</Link>
            </div>
            <div>
              <h4>Mi cuenta</h4>
              <Link href="/analysis">Diagnóstico de humedad</Link>
              {loggedIn ? (
                <>
                  <Link href="/mis-pedidos">Mis pedidos</Link>
                  <Link href="/cart">Carrito</Link>
                </>
              ) : (
                <Link href="/auth">Entrar / Registrarse</Link>
              )}
            </div>
          </div>
          <hr className="footer-divider" />
          <div className="footer-bottom">
            <span>© 2025 No+Humedades · Cádiz. Todos los derechos reservados.</span>
            <div className="footer-brands">
              <span style={{ color: "rgba(255,255,255,.4)", fontSize: "12px" }}>Valentine · Kerakoll · Higaltor</span>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}
