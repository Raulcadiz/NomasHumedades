import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { API_URL, apiFetch, isLoggedIn, fetchCartCount } from "../lib/api";

const BRAND_CLASS = {
  Valentine: "brand-valentine",
  Kerakoll:  "brand-kerakoll",
  Higaltor:  "brand-higaltor",
};

export default function Catalog() {
  const router = useRouter();
  const { categoria, marca, search } = router.query;
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [filters, setFilters] = useState({ categoria: "", marca: "", search: "" });
  const [cartCount, setCartCount] = useState(0);

  useEffect(() => {
    fetchCategories();
    loadCartCount();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (filters.categoria) params.set("categoria", filters.categoria);
    if (filters.marca) params.set("marca", filters.marca);
    if (filters.search) params.set("search", filters.search);
    
    fetch(`${API_URL}/api/productos?${params}`)
      .then((res) => res.json())
      .then((data) => setProducts(data));
  }, [filters]);

  useEffect(() => {
    if (categoria) setFilters((f) => ({ ...f, categoria }));
    if (marca) setFilters((f) => ({ ...f, marca }));
    if (search) setFilters((f) => ({ ...f, search }));
  }, [categoria, marca, search]);

  const fetchCategories = async () => {
    try {
      const res = await fetch(`${API_URL}/api/categorias`);
      const data = await res.json();
      setCategories(data);
    } catch (err) {
      console.error("Error:", err);
    }
  };

  const loadCartCount = async () => {
    setCartCount(await fetchCartCount());
  };

  const addToCart = async (productId) => {
    if (!isLoggedIn()) {
      router.push("/auth");
      return;
    }

    try {
      const res = await apiFetch("/api/carrito", {
        method: "POST",
        body: JSON.stringify({ producto_id: productId, cantidad: 1 }),
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
            <Link href="/cart" className="cart-icon">
              🛒{cartCount > 0 && <span className="cart-count">{cartCount}</span>}
            </Link>
          </div>
        </div>
      </header>

      <main className="container" style={{ padding: "40px 20px" }}>
        <h1 className="page-title">Catálogo de Productos</h1>
        
        <div style={{ display: "flex", gap: "24px", marginBottom: "32px" }}>
          <div style={{ flex: 1 }}>
            <input
              type="text"
              placeholder="Buscar productos..."
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            />
          </div>
          <select
            value={filters.categoria}
            onChange={(e) => setFilters((f) => ({ ...f, categoria: e.target.value }))}
            style={{ width: "200px" }}
          >
            <option value="">Todas las categorías</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>{cat.nombre}</option>
            ))}
          </select>
          <select
            value={filters.marca}
            onChange={(e) => setFilters((f) => ({ ...f, marca: e.target.value }))}
            style={{ width: "150px" }}
          >
            <option value="">Todas las marcas</option>
            <option value="valentine">Valentine</option>
            <option value="kerakoll">Kerakoll</option>
            <option value="higaltor">Higaltor</option>
          </select>
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
                    : <span style={{ fontSize: "14px", fontWeight: 400, color: "var(--gray-500)" }}>Consultar precio</span>
                  }
                </div>
                <div className="product-actions">
                  {product.precio > 0 && (
                    <button className="btn btn-primary btn-sm" onClick={() => addToCart(product.id)}>
                      + Carrito
                    </button>
                  )}
                  <Link href={`/product/${product.id}`} className="btn btn-outline btn-sm">
                    Ver ficha
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>

        {products.length === 0 && (
          <div style={{ textAlign: "center", padding: "60px", color: "var(--gray-500)" }}>
            No se encontraron productos con los filtros seleccionados.
          </div>
        )}
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