import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { API_URL, apiFetch, isAdmin, isLoggedIn } from "../lib/api";

const BRAND_COLOR = {
  Valentine: "#e11d48",
  Kerakoll: "#2563eb",
  Higaltor: "#059669",
  Varios: "#6b7280",
};

const BRAND_BG = {
  Valentine: { bg: "#fee2e2", color: "#b91c1c" },
  Kerakoll:  { bg: "#dbeafe", color: "#1d4ed8" },
  Higaltor:  { bg: "#d1fae5", color: "#065f46" },
  Varios:    { bg: "#f3f4f6", color: "#374151" },
};

const ORDER_STATES = ["pendiente", "pagado", "preparando", "enviado", "entregado", "cancelado"];
const STATE_COLOR = {
  pendiente: "#f59e0b", pagado: "#10b981", preparando: "#3b82f6",
  enviado: "#8b5cf6", entregado: "#059669", cancelado: "#ef4444",
};

// ── Componente modal de edición de producto ───────────────────────────────────

function ProductEditModal({ product, onSave, onClose, uploading, onUpload }) {
  const [form, setForm] = useState({ ...product });
  const [imgPreview, setImgPreview] = useState(product.imagen || "");

  const set = (key, value) => setForm(f => ({ ...f, [key]: value }));

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const url = await onUpload(file);
    if (url) { set("imagen", url); setImgPreview(url); }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 1000, padding: "20px",
    }}>
      <div style={{
        background: "white", borderRadius: "12px", padding: "28px",
        width: "100%", maxWidth: "560px", maxHeight: "90vh",
        overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 700 }}>Editar Producto</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: "22px", cursor: "pointer", color: "#6b7280" }}>×</button>
        </div>

        {/* Imagen */}
        <div style={{ marginBottom: "20px" }}>
          <label style={{ display: "block", fontWeight: 600, marginBottom: "8px", fontSize: "13px" }}>Imagen del producto</label>
          <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
            <div style={{
              width: "90px", height: "90px", borderRadius: "8px", overflow: "hidden",
              border: "2px dashed #e5e7eb", flexShrink: 0, background: "#f9fafb",
            }}>
              {imgPreview ? (
                <img
                  src={imgPreview} alt="Preview"
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  onError={(e) => { e.target.style.display = "none"; }}
                />
              ) : (
                <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af", fontSize: "11px" }}>Sin imagen</div>
              )}
            </div>
            <div style={{ flex: 1 }}>
              <label style={{
                display: "block", padding: "8px 14px", background: "#f3f4f6",
                border: "1px solid #e5e7eb", borderRadius: "6px", cursor: uploading ? "not-allowed" : "pointer",
                fontSize: "13px", textAlign: "center", marginBottom: "8px",
              }}>
                {uploading ? "Subiendo..." : "📁 Subir archivo"}
                <input type="file" accept="image/*" onChange={handleFile} disabled={uploading} style={{ display: "none" }} />
              </label>
              <input
                type="text"
                value={form.imagen || ""}
                onChange={(e) => { set("imagen", e.target.value); setImgPreview(e.target.value); }}
                placeholder="https://... o /uploads/..."
                style={{ width: "100%", padding: "8px 10px", border: "1px solid #e5e7eb", borderRadius: "6px", fontSize: "13px", boxSizing: "border-box" }}
              />
            </div>
          </div>
        </div>

        {/* Nombre */}
        <div style={{ marginBottom: "14px" }}>
          <label style={{ display: "block", fontWeight: 600, marginBottom: "4px", fontSize: "13px" }}>Nombre</label>
          <input
            type="text" value={form.nombre}
            onChange={(e) => set("nombre", e.target.value)}
            style={{ width: "100%", padding: "8px 10px", border: "1px solid #e5e7eb", borderRadius: "6px", fontSize: "14px", boxSizing: "border-box" }}
          />
        </div>

        {/* Descripción */}
        <div style={{ marginBottom: "14px" }}>
          <label style={{ display: "block", fontWeight: 600, marginBottom: "4px", fontSize: "13px" }}>Descripción</label>
          <textarea
            rows={3} value={form.descripcion}
            onChange={(e) => set("descripcion", e.target.value)}
            style={{ width: "100%", padding: "8px 10px", border: "1px solid #e5e7eb", borderRadius: "6px", fontSize: "13px", resize: "vertical", boxSizing: "border-box" }}
          />
        </div>

        {/* Precio / Stock / Destacado */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", marginBottom: "14px" }}>
          <div>
            <label style={{ display: "block", fontWeight: 600, marginBottom: "4px", fontSize: "13px" }}>Precio € (tarifa)</label>
            <input
              type="number" step="0.01" value={form.precio}
              onChange={(e) => set("precio", parseFloat(e.target.value) || 0)}
              style={{ width: "100%", padding: "8px 10px", border: "1px solid #e5e7eb", borderRadius: "6px", fontSize: "14px", boxSizing: "border-box" }}
            />
          </div>
          <div>
            <label style={{ display: "block", fontWeight: 600, marginBottom: "4px", fontSize: "13px" }}>Stock</label>
            <input
              type="number" value={form.stock}
              onChange={(e) => set("stock", parseInt(e.target.value) || 0)}
              style={{ width: "100%", padding: "8px 10px", border: "1px solid #e5e7eb", borderRadius: "6px", fontSize: "14px", boxSizing: "border-box" }}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", padding: "8px 0" }}>
              <input
                type="checkbox" checked={form.destacado}
                onChange={(e) => set("destacado", e.target.checked)}
                style={{ width: "16px", height: "16px" }}
              />
              <span style={{ fontWeight: 600, fontSize: "13px" }}>Destacado</span>
            </label>
          </div>
        </div>

        {/* Botones */}
        <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", paddingTop: "16px", borderTop: "1px solid #f3f4f6" }}>
          <button onClick={onClose} style={{
            padding: "9px 20px", border: "1px solid #e5e7eb", borderRadius: "6px",
            background: "white", cursor: "pointer", fontSize: "14px",
          }}>
            Cancelar
          </button>
          <button onClick={() => onSave(product.id, form)} style={{
            padding: "9px 20px", border: "none", borderRadius: "6px",
            background: "#1e3a5f", color: "white", cursor: "pointer",
            fontSize: "14px", fontWeight: 600,
          }}>
            Guardar cambios
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Tarjeta de estadística ────────────────────────────────────────────────────

function StatCard({ label, value, sub, color = "#1e3a5f", icon }) {
  return (
    <div style={{
      background: "white", borderRadius: "12px", padding: "20px 24px",
      border: "1px solid #e5e7eb", boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
      flex: "1 1 160px",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: "13px", color: "#6b7280", marginBottom: "6px" }}>{label}</div>
          <div style={{ fontSize: "28px", fontWeight: 800, color }}>{value}</div>
          {sub && <div style={{ fontSize: "12px", color: "#9ca3af", marginTop: "4px" }}>{sub}</div>}
        </div>
        <div style={{ fontSize: "28px", opacity: 0.8 }}>{icon}</div>
      </div>
    </div>
  );
}

// ── Panel de administración ───────────────────────────────────────────────────

export default function Admin() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [uploading, setUploading] = useState(false);
  const [editProduct, setEditProduct] = useState(null);
  const [searchFilter, setSearchFilter] = useState("");

  // ── Márgenes ────────────────────────────────────────────────────────────────
  const [margenes, setMargenes] = useState({ Valentine: 0, Kerakoll: 0, Higaltor: 0 });
  const [margenesOk, setMargenesOk] = useState(false);

  // ── Dashboard stats ─────────────────────────────────────────────────────────
  const [stats, setStats] = useState(null);

  // ── Configuración tienda ─────────────────────────────────────────────────────
  const [config, setConfig] = useState({
    tienda_nombre: "", tienda_telefono: "", tienda_ciudad: "",
    tienda_direccion: "", tienda_horario: "", iban: "",
    email_admin: "", smtp_host: "", smtp_port: "", smtp_user: "",
    smtp_password: "", email_from: "",
    envio_gratis_desde: "", precio_envio_estandar: "", precio_envio_pesado: "",
  });
  const [configOk, setConfigOk] = useState(false);
  const [ibanVisible, setIbanVisible] = useState(false);
  const [smtpPassVisible, setSmtpPassVisible] = useState(false);

  // ── PDF import ──────────────────────────────────────────────────────────────
  const [importMarca, setImportMarca] = useState("todos");
  const [importLoading, setImportLoading] = useState(false);
  const [importPreview, setImportPreview] = useState(null);
  const [importSel, setImportSel] = useState({});
  const [importResult, setImportResult] = useState(null);
  const [pdfList, setPdfList] = useState([]);
  const [uploadingPdf, setUploadingPdf] = useState(false);

  // ── Scraper web ─────────────────────────────────────────────────────────────
  const [scraperMarca, setScraperMarca] = useState("todas");
  const [scraperSoloSin, setScraperSoloSin] = useState(true);
  const [scraperLoading, setScraperLoading] = useState(false);
  const [scraperResult, setScraperResult] = useState(null);
  const [imgEstado, setImgEstado] = useState(null);

  // ── Nuevo producto ───────────────────────────────────────────────────────────
  const [newProduct, setNewProduct] = useState({
    id: "", nombre: "", marca: "Valentine", categoria: "pinturas",
    precio: 0, descripcion: "", imagen: "", stock: 0, tags: [], destacado: false,
  });

  // ── Carga de datos ───────────────────────────────────────────────────────────
  const loadProducts = useCallback(async () => {
    const res = await apiFetch("/api/admin/productos");
    if (res.ok) setProducts(await res.json());
  }, []);

  const loadOrders = useCallback(async () => {
    const res = await apiFetch("/api/admin/pedidos");
    if (res.ok) setOrders(await res.json());
  }, []);

  const loadMargenes = useCallback(async () => {
    const res = await apiFetch("/api/admin/margenes");
    if (res.ok) setMargenes(await res.json());
  }, []);

  const loadImgEstado = useCallback(async () => {
    const res = await apiFetch("/api/admin/actualizar-imagenes/estado");
    if (res.ok) setImgEstado(await res.json());
  }, []);

  const loadStats = useCallback(async () => {
    const res = await apiFetch("/api/admin/stats");
    if (res.ok) setStats(await res.json());
  }, []);

  const loadConfig = useCallback(async () => {
    const res = await apiFetch("/api/admin/configuracion");
    if (res.ok) setConfig(c => ({ ...c, ...await res.json() }));
  }, []);

  const loadPdfList = useCallback(async () => {
    const res = await apiFetch("/api/admin/pdfs");
    if (res.ok) setPdfList(await res.json());
  }, []);

  // ── Auth check ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isLoggedIn() || !isAdmin()) {
      router.push("/auth");
      return;
    }
    setReady(true);
    loadProducts();
    loadOrders();
    loadMargenes();
    loadImgEstado();
    loadStats();
    loadConfig();
    loadPdfList();
  }, []);

  // ── Imagen upload ────────────────────────────────────────────────────────────
  const handleImageUpload = async (file) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await apiFetch("/api/admin/upload-image", {
        method: "POST",
        headers: {},
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        return data.url;
      }
      alert("Error al subir imagen");
    } catch {
      alert("Error al subir imagen");
    } finally {
      setUploading(false);
    }
    return null;
  };

  // ── CRUD productos ───────────────────────────────────────────────────────────
  const updateProduct = async (productId, productData) => {
    const res = await apiFetch(`/api/admin/productos/${productId}`, {
      method: "PUT",
      body: JSON.stringify({
        nombre: productData.nombre,
        precio: productData.precio,
        descripcion: productData.descripcion,
        imagen: productData.imagen,
        stock: productData.stock,
        destacado: productData.destacado,
        tags: productData.tags,
      }),
    });
    if (res.ok) {
      setEditProduct(null);
      await loadProducts();
    } else {
      alert("Error al actualizar producto");
    }
  };

  const deleteProduct = async (productId) => {
    if (!confirm("¿Eliminar este producto? Esta acción no se puede deshacer.")) return;
    const res = await apiFetch(`/api/admin/productos/${productId}`, { method: "DELETE" });
    if (res.ok || res.status === 204) {
      await loadProducts();
      await loadStats();
    } else {
      alert("Error al eliminar");
    }
  };

  const addProduct = async () => {
    const res = await apiFetch("/api/admin/productos", {
      method: "POST",
      body: JSON.stringify(newProduct),
    });
    if (res.ok) {
      await loadProducts();
      await loadStats();
      setActiveTab("products");
      setNewProduct({
        id: "", nombre: "", marca: "Valentine", categoria: "pinturas",
        precio: 0, descripcion: "", imagen: "", stock: 0, tags: [], destacado: false,
      });
    } else {
      const err = await res.json().catch(() => ({}));
      alert(err.detail || "Error al crear producto");
    }
  };

  // ── Pedidos ──────────────────────────────────────────────────────────────────
  const updateOrderStatus = async (orderId, estado) => {
    await apiFetch(`/api/admin/pedidos/${orderId}/estado?estado=${estado}`, { method: "PUT" });
    await loadOrders();
    await loadStats();
  };

  // ── Márgenes ─────────────────────────────────────────────────────────────────
  const saveMargenes = async () => {
    const res = await apiFetch("/api/admin/margenes", {
      method: "PUT",
      body: JSON.stringify(margenes),
    });
    if (res.ok) {
      setMargenesOk(true);
      setTimeout(() => setMargenesOk(false), 3000);
    } else {
      alert("Error al guardar márgenes");
    }
  };

  // ── Configuración ────────────────────────────────────────────────────────────
  const saveConfig = async () => {
    const res = await apiFetch("/api/admin/configuracion", {
      method: "PUT",
      body: JSON.stringify(config),
    });
    if (res.ok) {
      setConfigOk(true);
      setTimeout(() => setConfigOk(false), 3000);
    } else {
      alert("Error al guardar configuración");
    }
  };

  // ── Subir PDF ────────────────────────────────────────────────────────────────
  const handlePdfUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingPdf(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await apiFetch("/api/admin/upload-pdf", {
        method: "POST",
        headers: {},
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        alert(`✅ PDF subido: ${data.filename} (${data.size_mb} MB)`);
        await loadPdfList();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.detail || "Error al subir el PDF");
      }
    } catch {
      alert("Error al subir el PDF");
    } finally {
      setUploadingPdf(false);
      e.target.value = "";
    }
  };

  // ── Importar PDF ─────────────────────────────────────────────────────────────
  const previewImport = async () => {
    setImportLoading(true);
    setImportPreview(null);
    setImportResult(null);
    const res = await apiFetch(`/api/admin/importar-productos/preview?marca=${importMarca}`);
    if (res.ok) {
      const data = await res.json();
      setImportPreview(data);
      const sel = {};
      data.productos.forEach((p) => { sel[p.referencia || p.id] = p.es_nuevo; });
      setImportSel(sel);
    } else {
      const err = await res.json().catch(() => ({}));
      alert(err.detail || "Error al obtener preview");
    }
    setImportLoading(false);
  };

  const confirmarImport = async () => {
    if (!importPreview) return;
    const seleccionados = importPreview.productos.filter(p => importSel[p.referencia || p.id]);
    if (seleccionados.length === 0) { alert("No hay productos seleccionados"); return; }
    if (!confirm(`¿Importar ${seleccionados.length} productos?`)) return;
    setImportLoading(true);
    const res = await apiFetch("/api/admin/importar-productos/confirmar", {
      method: "POST",
      body: JSON.stringify({ marca: importMarca, productos: seleccionados }),
    });
    if (res.ok) {
      const data = await res.json();
      setImportResult(data);
      setImportPreview(null);
      await loadProducts();
      await loadStats();
    } else {
      const err = await res.json().catch(() => ({}));
      alert(err.detail || "Error al importar");
    }
    setImportLoading(false);
  };

  // ── Scraper web ──────────────────────────────────────────────────────────────
  const lanzarScraper = async () => {
    if (!confirm(`¿Iniciar actualización de imágenes desde webs de fabricantes para "${scraperMarca}"? El proceso se ejecuta en segundo plano y puede tardar varios minutos.`)) return;
    setScraperLoading(true);
    setScraperResult(null);
    const res = await apiFetch("/api/admin/actualizar-imagenes", {
      method: "POST",
      body: JSON.stringify({ marca: scraperMarca, solo_sin_imagen: scraperSoloSin }),
    });
    if (res.ok) {
      const data = await res.json();
      setScraperResult(data);
    } else {
      const err = await res.json().catch(() => ({}));
      alert(err.detail || "Error al lanzar actualizador");
    }
    setScraperLoading(false);
  };

  const refrescarEstadoImagenes = async () => {
    await loadImgEstado();
    await loadProducts();
  };

  // ── Pantalla de carga ────────────────────────────────────────────────────────
  if (!ready) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fafc" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: "40px", height: "40px", border: "3px solid #e5e7eb", borderTopColor: "#1e3a5f", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 16px" }} />
          <p style={{ color: "#6b7280" }}>Verificando acceso…</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const filteredProducts = searchFilter
    ? products.filter(p =>
        p.nombre.toLowerCase().includes(searchFilter.toLowerCase()) ||
        (p.referencia || "").toLowerCase().includes(searchFilter.toLowerCase()) ||
        p.marca.toLowerCase().includes(searchFilter.toLowerCase())
      )
    : products;

  return (
    <>
      {editProduct && (
        <ProductEditModal
          product={editProduct}
          onSave={updateProduct}
          onClose={() => setEditProduct(null)}
          uploading={uploading}
          onUpload={handleImageUpload}
        />
      )}

      <header className="header">
        <div className="container header-inner">
          <Link href="/" className="logo">No<span>+</span>Humedades</Link>
          <nav className="nav">
            <Link href="/">Inicio</Link>
            <Link href="/catalog">Catálogo</Link>
            <span style={{ color: "var(--primary)", fontWeight: 700, cursor: "default" }}>Admin</span>
          </nav>
          <div className="header-actions">
            <Link href="/cart" className="cart-icon">🛒</Link>
          </div>
        </div>
      </header>

      <main className="container" style={{ padding: "32px 20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
          <h1 className="page-title" style={{ margin: 0 }}>Panel de Administración</h1>
          <div style={{ display: "flex", gap: "12px" }}>
            <span style={{ background: "#f0fdf4", color: "#15803d", padding: "6px 14px", borderRadius: "20px", fontSize: "13px", fontWeight: 600 }}>
              {products.length} productos
            </span>
            <span style={{ background: "#eff6ff", color: "#1d4ed8", padding: "6px 14px", borderRadius: "20px", fontSize: "13px", fontWeight: 600 }}>
              {orders.length} pedidos
            </span>
          </div>
        </div>

        {/* Tabs */}
        <div className="tabs" style={{ marginBottom: "24px", flexWrap: "wrap" }}>
          {[
            ["dashboard",  "📊 Dashboard"],
            ["products",   "📦 Productos"],
            ["orders",     "🛒 Pedidos"],
            ["margenes",   "💰 Márgenes"],
            ["importar",   "📄 Importar PDFs"],
            ["scraper",    "🌐 Actualizar Web"],
            ["config",     "⚙️ Configuración"],
            ["add",        "➕ Añadir Producto"],
          ].map(([key, label]) => (
            <button
              key={key}
              className={activeTab === key ? "active" : ""}
              onClick={() => setActiveTab(key)}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── DASHBOARD ── */}
        {activeTab === "dashboard" && (
          <div>
            {stats ? (
              <>
                {/* Tarjetas de resumen */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: "16px", marginBottom: "28px" }}>
                  <StatCard label="Productos en catálogo" value={stats.total_products} icon="📦" color="#1e3a5f" />
                  <StatCard label="Pedidos totales" value={stats.total_orders} icon="🛒" color="#2563eb" />
                  <StatCard label="Pedidos hoy" value={stats.orders_today} icon="📅" color="#7c3aed" />
                  <StatCard label="Ingresos este mes" value={`${stats.revenue_month.toFixed(2)} €`} icon="💰" color="#059669"
                    sub="pedidos pagados/enviados/entregados" />
                  <StatCard label="Pendientes de pago" value={stats.pending_orders} icon="⏳"
                    color={stats.pending_orders > 0 ? "#d97706" : "#6b7280"} />
                  <StatCard label="Sin imagen" value={stats.products_sin_imagen} icon="🖼️"
                    color={stats.products_sin_imagen > 0 ? "#ef4444" : "#059669"} sub="productos" />
                </div>

                {/* Pedidos por estado */}
                <div className="card" style={{ padding: "24px" }}>
                  <h3 style={{ margin: "0 0 20px", fontSize: "16px", fontWeight: 700 }}>Estado de los pedidos</h3>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
                    {Object.entries(stats.orders_by_estado).map(([estado, count]) => (
                      <div key={estado} style={{
                        padding: "12px 20px", borderRadius: "10px", minWidth: "110px", textAlign: "center",
                        background: `${STATE_COLOR[estado]}15`, border: `1px solid ${STATE_COLOR[estado]}40`,
                      }}>
                        <div style={{ fontSize: "24px", fontWeight: 800, color: STATE_COLOR[estado] }}>{count}</div>
                        <div style={{ fontSize: "12px", color: "#6b7280", textTransform: "capitalize", marginTop: "4px" }}>{estado}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Imágenes por marca */}
                {imgEstado && (
                  <div className="card" style={{ padding: "24px", marginTop: "16px" }}>
                    <h3 style={{ margin: "0 0 20px", fontSize: "16px", fontWeight: 700 }}>Imágenes de productos por marca</h3>
                    <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
                      {Object.entries(imgEstado).map(([marca, s]) => {
                        const pct = s.total > 0 ? Math.round((s.con_imagen / s.total) * 100) : 0;
                        const bc = BRAND_BG[marca] || BRAND_BG.Varios;
                        return (
                          <div key={marca} style={{ flex: "1 1 180px", background: "#f8fafc", borderRadius: "10px", padding: "16px", border: "1px solid #e5e7eb" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px" }}>
                              <span style={{ background: bc.bg, color: bc.color, padding: "2px 10px", borderRadius: "12px", fontSize: "12px", fontWeight: 700 }}>{marca}</span>
                              <span style={{ fontSize: "13px", fontWeight: 700, color: pct === 100 ? "#059669" : "#374151" }}>{pct}%</span>
                            </div>
                            <div style={{ height: "8px", background: "#e5e7eb", borderRadius: "4px", overflow: "hidden", marginBottom: "8px" }}>
                              <div style={{ height: "100%", width: `${pct}%`, background: BRAND_COLOR[marca], borderRadius: "4px", transition: "width 0.5s" }} />
                            </div>
                            <div style={{ fontSize: "13px", color: "#374151" }}>
                              <strong>{s.con_imagen}</strong>/{s.total} con imagen
                              {s.sin_imagen > 0 && <span style={{ color: "#f59e0b", marginLeft: "6px" }}>({s.sin_imagen} faltan)</span>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <button onClick={refrescarEstadoImagenes} style={{ marginTop: "16px", padding: "8px 16px", border: "1px solid #e5e7eb", borderRadius: "6px", background: "white", cursor: "pointer", fontSize: "13px" }}>
                      Refrescar
                    </button>
                  </div>
                )}

                <div style={{ marginTop: "16px", textAlign: "right" }}>
                  <button onClick={() => { loadStats(); loadImgEstado(); }}
                    style={{ padding: "8px 18px", border: "1px solid #e5e7eb", borderRadius: "8px", background: "white", cursor: "pointer", fontSize: "13px" }}>
                    🔄 Actualizar dashboard
                  </button>
                </div>
              </>
            ) : (
              <div style={{ textAlign: "center", padding: "40px", color: "#9ca3af" }}>Cargando estadísticas…</div>
            )}
          </div>
        )}

        {/* ── PRODUCTOS ── */}
        {activeTab === "products" && (
          <div className="card" style={{ padding: 0 }}>
            <div style={{ padding: "16px 16px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <input
                type="text"
                placeholder="Buscar por nombre, referencia o marca…"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                style={{ width: "320px", padding: "8px 14px", border: "1px solid #e5e7eb", borderRadius: "8px", fontSize: "14px" }}
              />
              <span style={{ color: "#6b7280", fontSize: "13px" }}>
                {filteredProducts.length} de {products.length} productos
              </span>
            </div>
            <div style={{ overflowX: "auto", marginTop: "12px" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "700px" }}>
                <thead>
                  <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e5e7eb" }}>
                    <th style={{ padding: "12px 16px", textAlign: "left", width: "72px" }}>Img</th>
                    <th style={{ padding: "12px 16px", textAlign: "left" }}>Producto</th>
                    <th style={{ padding: "12px 16px", textAlign: "left", width: "100px" }}>Marca</th>
                    <th style={{ padding: "12px 16px", textAlign: "right", width: "90px" }}>Precio €</th>
                    <th style={{ padding: "12px 16px", textAlign: "right", width: "70px" }}>Stock</th>
                    <th style={{ padding: "12px 16px", textAlign: "center", width: "130px" }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map((product) => {
                    const bc = BRAND_BG[product.marca] || BRAND_BG.Varios;
                    const hasRealImage = product.imagen && !product.imagen.includes("placeholder");
                    return (
                      <tr key={product.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                        <td style={{ padding: "10px 16px" }}>
                          <div style={{
                            width: "52px", height: "52px", borderRadius: "6px",
                            overflow: "hidden", background: "#f3f4f6",
                            border: hasRealImage ? "none" : "2px dashed #e5e7eb",
                          }}>
                            <img
                              src={product.imagen || "/img/placeholder.svg"}
                              alt={product.nombre}
                              style={{ width: "100%", height: "100%", objectFit: "cover" }}
                              onError={(e) => { e.target.src = "/img/placeholder.svg"; }}
                            />
                          </div>
                        </td>
                        <td style={{ padding: "10px 16px" }}>
                          <div style={{ fontWeight: 600, fontSize: "14px", color: "#111827" }}>{product.nombre}</div>
                          <div style={{ fontSize: "11px", color: "#9ca3af", marginTop: "2px" }}>
                            {product.id}{product.referencia ? ` · ${product.referencia}` : ""}
                          </div>
                        </td>
                        <td style={{ padding: "10px 16px" }}>
                          <span style={{ background: bc.bg, color: bc.color, padding: "3px 10px", borderRadius: "20px", fontSize: "11px", fontWeight: 700 }}>
                            {product.marca}
                          </span>
                          {product.destacado && (
                            <span style={{ display: "block", fontSize: "10px", color: "#f59e0b", marginTop: "3px", fontWeight: 600 }}>★ Destacado</span>
                          )}
                        </td>
                        <td style={{ padding: "10px 16px", textAlign: "right", fontWeight: 600, fontSize: "14px" }}>
                          {product.precio > 0 ? `${product.precio.toFixed(2)} €` : <span style={{ color: "#9ca3af", fontWeight: 400 }}>—</span>}
                        </td>
                        <td style={{ padding: "10px 16px", textAlign: "right", fontSize: "14px" }}>
                          {product.stock}
                        </td>
                        <td style={{ padding: "10px 16px", textAlign: "center" }}>
                          <button
                            onClick={() => setEditProduct(product)}
                            style={{ padding: "5px 12px", background: "#1e3a5f", color: "white", border: "none", borderRadius: "5px", cursor: "pointer", fontSize: "12px", fontWeight: 600, marginRight: "6px" }}
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => deleteProduct(product.id)}
                            style={{ padding: "5px 10px", background: "white", color: "#ef4444", border: "1px solid #ef4444", borderRadius: "5px", cursor: "pointer", fontSize: "12px" }}
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filteredProducts.length === 0 && (
                <div style={{ textAlign: "center", padding: "40px", color: "#9ca3af" }}>
                  {searchFilter ? `Sin resultados para "${searchFilter}"` : "No hay productos"}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── PEDIDOS ── */}
        {activeTab === "orders" && (
          <div className="card" style={{ padding: 0, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "800px" }}>
              <thead>
                <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e5e7eb" }}>
                  <th style={{ padding: "12px 16px", textAlign: "left" }}>ID</th>
                  <th style={{ padding: "12px 16px", textAlign: "left" }}>Cliente</th>
                  <th style={{ padding: "12px 16px", textAlign: "left" }}>Fecha</th>
                  <th style={{ padding: "12px 16px", textAlign: "right" }}>Total</th>
                  <th style={{ padding: "12px 16px", textAlign: "left" }}>Entrega</th>
                  <th style={{ padding: "12px 16px", textAlign: "left" }}>Pago</th>
                  <th style={{ padding: "12px 16px", textAlign: "center" }}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td style={{ padding: "10px 16px", fontSize: "12px", color: "#6b7280" }}>{order.id.substring(0, 8)}…</td>
                    <td style={{ padding: "10px 16px", fontSize: "13px" }}>{order.user_email}</td>
                    <td style={{ padding: "10px 16px", fontSize: "12px" }}>{new Date(order.fecha).toLocaleDateString("es-ES")}</td>
                    <td style={{ padding: "10px 16px", textAlign: "right", fontWeight: 700 }}>{order.total.toFixed(2)} €</td>
                    <td style={{ padding: "10px 16px", fontSize: "12px" }}>
                      {order.direccion_envio === "RECOGIDA EN TIENDA" ? "🏪 Recogida" : "🚚 Envío"}
                    </td>
                    <td style={{ padding: "10px 16px", fontSize: "12px" }}>
                      {order.metodo_pago === "transferencia" ? "🏦 Transf." : "💳 SumUp"}
                    </td>
                    <td style={{ padding: "10px 16px", textAlign: "center" }}>
                      <select
                        value={order.estado}
                        onChange={(e) => updateOrderStatus(order.id, e.target.value)}
                        style={{
                          fontSize: "12px", padding: "4px 8px", borderRadius: "6px",
                          border: `2px solid ${STATE_COLOR[order.estado] || "#ccc"}`,
                          color: STATE_COLOR[order.estado] || "#333",
                          fontWeight: 700, cursor: "pointer", background: "white",
                        }}
                      >
                        {ORDER_STATES.map(s => (
                          <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {orders.length === 0 && (
              <div style={{ textAlign: "center", padding: "40px", color: "#9ca3af" }}>No hay pedidos</div>
            )}
          </div>
        )}

        {/* ── MÁRGENES ── */}
        {activeTab === "margenes" && (
          <div style={{ maxWidth: "520px" }}>
            <div className="card" style={{ padding: "28px" }}>
              <h3 style={{ marginTop: 0, marginBottom: "8px", fontSize: "17px" }}>Márgenes Comerciales por Marca</h3>
              <p style={{ color: "#6b7280", fontSize: "13px", marginBottom: "28px", lineHeight: 1.6 }}>
                El precio al cliente será: <strong>precio tarifa × (1 + margen%)</strong>.
                El precio base en la base de datos no cambia — solo el precio mostrado.
              </p>

              {["Valentine", "Kerakoll", "Higaltor"].map((marca) => {
                const bc = BRAND_BG[marca];
                const ejemplo = margenes[marca] > 0 ? (100 * (1 + margenes[marca] / 100)).toFixed(2) : null;
                return (
                  <div key={marca} style={{ marginBottom: "20px", padding: "16px", background: "#f8fafc", borderRadius: "10px", border: "1px solid #e5e7eb" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
                      <span style={{ background: bc.bg, color: bc.color, padding: "3px 12px", borderRadius: "20px", fontSize: "12px", fontWeight: 700 }}>{marca}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <input
                        type="number" min="0" max="500" step="0.5"
                        value={margenes[marca] ?? 0}
                        onChange={(e) => setMargenes(m => ({ ...m, [marca]: parseFloat(e.target.value) || 0 }))}
                        style={{ width: "90px", padding: "10px 12px", border: "2px solid #e5e7eb", borderRadius: "8px", fontSize: "18px", fontWeight: 700, textAlign: "right" }}
                      />
                      <span style={{ fontSize: "18px", fontWeight: 700, color: "#374151" }}>%</span>
                      {ejemplo && (
                        <span style={{ fontSize: "13px", color: "#6b7280" }}>
                          Ej: tarifa 100 € → <strong style={{ color: BRAND_COLOR[marca] }}>{ejemplo} €</strong>
                        </span>
                      )}
                      {!margenes[marca] && (
                        <span style={{ fontSize: "13px", color: "#9ca3af" }}>Sin margen — precio de tarifa</span>
                      )}
                    </div>
                  </div>
                );
              })}

              <div style={{ display: "flex", gap: "12px", alignItems: "center", marginTop: "8px" }}>
                <button onClick={saveMargenes} style={{ padding: "10px 24px", background: "#1e3a5f", color: "white", border: "none", borderRadius: "8px", cursor: "pointer", fontSize: "14px", fontWeight: 700 }}>
                  Guardar Márgenes
                </button>
                {margenesOk && <span style={{ color: "#059669", fontWeight: 700, fontSize: "14px" }}>✓ Guardado correctamente</span>}
              </div>
            </div>
          </div>
        )}

        {/* ── IMPORTAR PDFs ── */}
        {activeTab === "importar" && (
          <div className="card" style={{ padding: "28px" }}>
            <h3 style={{ marginTop: 0, marginBottom: "8px" }}>Importar Productos desde PDFs</h3>
            <p style={{ color: "#6b7280", marginBottom: "20px", fontSize: "14px" }}>
              Sube aquí los PDFs de tarifas de Valentine, Kerakoll o Higaltor y luego impórtalos a la base de datos.
            </p>

            {/* Subir PDF */}
            <div style={{ background: "#f8fafc", border: "1px solid #e5e7eb", borderRadius: "10px", padding: "20px", marginBottom: "24px" }}>
              <h4 style={{ margin: "0 0 12px", fontSize: "14px", fontWeight: 700 }}>📤 Subir nuevo PDF de tarifa</h4>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                <label style={{
                  padding: "10px 20px", background: uploadingPdf ? "#9ca3af" : "#1e3a5f",
                  color: "white", borderRadius: "8px", cursor: uploadingPdf ? "not-allowed" : "pointer",
                  fontSize: "14px", fontWeight: 600,
                }}>
                  {uploadingPdf ? "Subiendo…" : "Seleccionar PDF"}
                  <input type="file" accept=".pdf" onChange={handlePdfUpload} disabled={uploadingPdf} style={{ display: "none" }} />
                </label>
                <span style={{ fontSize: "13px", color: "#6b7280" }}>Máx. 50 MB</span>
              </div>

              {/* PDFs disponibles */}
              {pdfList.length > 0 && (
                <div style={{ marginTop: "14px" }}>
                  <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "6px", color: "#374151" }}>PDFs disponibles en el servidor:</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    {pdfList.map(pdf => (
                      <span key={pdf.filename} style={{ background: "#e0e7ff", color: "#3730a3", padding: "4px 12px", borderRadius: "20px", fontSize: "12px" }}>
                        📄 {pdf.filename} ({pdf.size_mb} MB)
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Seleccionar marca e importar */}
            <div style={{ display: "flex", gap: "12px", alignItems: "center", marginBottom: "24px", flexWrap: "wrap" }}>
              <select
                value={importMarca}
                onChange={(e) => { setImportMarca(e.target.value); setImportPreview(null); setImportResult(null); }}
                style={{ padding: "9px 14px", border: "1px solid #e5e7eb", borderRadius: "8px", fontSize: "14px" }}
              >
                <option value="todos">Todas las marcas</option>
                <option value="valentine">Valentine</option>
                <option value="kerakoll">Kerakoll</option>
                <option value="higaltor">Higaltor</option>
              </select>
              <button className="btn btn-primary" onClick={previewImport} disabled={importLoading}>
                {importLoading ? "Analizando PDFs…" : "Previsualizar"}
              </button>
            </div>

            {importResult && (
              <div style={{ background: "#d1fae5", border: "1px solid #6ee7b7", borderRadius: "8px", padding: "14px 18px", marginBottom: "20px" }}>
                <strong>✅ Importación completada:</strong> {importResult.importados} productos importados, {importResult.omitidos} ya existían.
              </div>
            )}

            {importPreview && (
              <>
                <div style={{ display: "flex", gap: "12px", marginBottom: "14px", flexWrap: "wrap" }}>
                  {[
                    ["Total", importPreview.total, "#f3f4f6"],
                    ["Nuevos", importPreview.nuevos, "#d1fae5"],
                    ["Existentes", importPreview.existentes, "#fef3c7"],
                    ["Seleccionados", Object.values(importSel).filter(Boolean).length, "#ede9fe"],
                  ].map(([label, val, bg]) => (
                    <span key={label} style={{ background: bg, padding: "6px 14px", borderRadius: "20px", fontSize: "13px" }}>
                      {label}: <strong>{val}</strong>
                    </span>
                  ))}
                </div>

                <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
                  {[
                    ["Todos", () => { const s = {}; importPreview.productos.forEach(p => { s[p.referencia || p.id] = true; }); setImportSel(s); }],
                    ["Solo nuevos", () => { const s = {}; importPreview.productos.forEach(p => { s[p.referencia || p.id] = p.es_nuevo; }); setImportSel(s); }],
                    ["Ninguno", () => { const s = {}; importPreview.productos.forEach(p => { s[p.referencia || p.id] = false; }); setImportSel(s); }],
                  ].map(([label, action]) => (
                    <button key={label} onClick={action} style={{ padding: "4px 12px", fontSize: "12px", border: "1px solid #e5e7eb", borderRadius: "6px", background: "white", cursor: "pointer" }}>
                      {label}
                    </button>
                  ))}
                </div>

                <div style={{ overflowX: "auto", marginBottom: "16px", border: "1px solid #e5e7eb", borderRadius: "8px" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                    <thead>
                      <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e5e7eb" }}>
                        <th style={{ padding: "9px 12px", width: "36px" }}>✓</th>
                        <th style={{ padding: "9px 12px", textAlign: "left" }}>Nombre</th>
                        <th style={{ padding: "9px 12px", textAlign: "left", width: "90px" }}>Marca</th>
                        <th style={{ padding: "9px 12px", textAlign: "right", width: "80px" }}>Precio €</th>
                        <th style={{ padding: "9px 12px", textAlign: "center", width: "80px" }}>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importPreview.productos.map((p) => {
                        const key = p.referencia || p.id;
                        const sel = !!importSel[key];
                        const bc = BRAND_BG[p.marca] || BRAND_BG.Varios;
                        return (
                          <tr key={key} style={{ borderBottom: "1px solid #f3f4f6", opacity: sel ? 1 : 0.45 }}>
                            <td style={{ padding: "7px 12px", textAlign: "center" }}>
                              <input type="checkbox" checked={sel} onChange={(e) => setImportSel(s => ({ ...s, [key]: e.target.checked }))} />
                            </td>
                            <td style={{ padding: "7px 12px" }}>
                              <div style={{ fontWeight: 500 }}>{p.nombre}</div>
                              <div style={{ color: "#9ca3af", fontSize: "11px" }}>{p.referencia}</div>
                            </td>
                            <td style={{ padding: "7px 12px" }}>
                              <span style={{ background: bc.bg, color: bc.color, padding: "2px 8px", borderRadius: "12px", fontSize: "11px", fontWeight: 700 }}>{p.marca}</span>
                            </td>
                            <td style={{ padding: "7px 12px", textAlign: "right", fontWeight: 600 }}>
                              {p.precio > 0 ? `${p.precio.toFixed(2)} €` : <span style={{ color: "#9ca3af" }}>—</span>}
                            </td>
                            <td style={{ padding: "7px 12px", textAlign: "center" }}>
                              {p.es_nuevo
                                ? <span style={{ background: "#d1fae5", color: "#065f46", padding: "2px 8px", borderRadius: "12px", fontSize: "11px" }}>Nuevo</span>
                                : <span style={{ background: "#fef3c7", color: "#92400e", padding: "2px 8px", borderRadius: "12px", fontSize: "11px" }}>Existe</span>
                              }
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <button className="btn btn-primary" onClick={confirmarImport} disabled={importLoading}>
                  {importLoading ? "Importando…" : `Importar ${Object.values(importSel).filter(Boolean).length} seleccionados`}
                </button>
              </>
            )}
          </div>
        )}

        {/* ── ACTUALIZAR WEB (SCRAPER) ── */}
        {activeTab === "scraper" && (
          <div style={{ maxWidth: "680px" }}>
            <div className="card" style={{ padding: "28px", marginBottom: "20px" }}>
              <h3 style={{ marginTop: 0, marginBottom: "8px" }}>Actualizar imágenes desde webs de fabricantes</h3>
              <p style={{ color: "#6b7280", fontSize: "14px", marginBottom: "24px", lineHeight: 1.6 }}>
                Busca automáticamente la imagen oficial de cada producto en las webs de Valentine, Kerakoll e Higaltor
                y la descarga al servidor. El proceso se ejecuta en segundo plano y puede tardar varios minutos.
              </p>

              {imgEstado && (
                <div style={{ display: "flex", gap: "12px", marginBottom: "24px", flexWrap: "wrap" }}>
                  {Object.entries(imgEstado).map(([marca, stats]) => {
                    const bc = BRAND_BG[marca] || BRAND_BG.Varios;
                    const pct = stats.total > 0 ? Math.round((stats.con_imagen / stats.total) * 100) : 0;
                    return (
                      <div key={marca} style={{ background: "#f8fafc", border: "1px solid #e5e7eb", borderRadius: "10px", padding: "14px 18px", minWidth: "160px" }}>
                        <span style={{ background: bc.bg, color: bc.color, padding: "2px 10px", borderRadius: "12px", fontSize: "11px", fontWeight: 700 }}>{marca}</span>
                        <div style={{ marginTop: "10px" }}>
                          <div style={{ height: "6px", background: "#e5e7eb", borderRadius: "3px", overflow: "hidden", marginBottom: "6px" }}>
                            <div style={{ height: "100%", width: `${pct}%`, background: BRAND_COLOR[marca], borderRadius: "3px" }} />
                          </div>
                          <div style={{ fontSize: "13px", color: "#374151" }}>
                            <strong>{stats.con_imagen}</strong>/{stats.total} con imagen ({pct}%)
                          </div>
                          {stats.sin_imagen > 0 && (
                            <div style={{ fontSize: "12px", color: "#f59e0b", fontWeight: 600 }}>{stats.sin_imagen} sin imagen</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div style={{ display: "flex", gap: "14px", alignItems: "flex-end", flexWrap: "wrap" }}>
                <div>
                  <label style={{ display: "block", fontWeight: 600, marginBottom: "6px", fontSize: "13px" }}>Marca</label>
                  <select value={scraperMarca} onChange={(e) => setScraperMarca(e.target.value)}
                    style={{ padding: "9px 14px", border: "1px solid #e5e7eb", borderRadius: "8px", fontSize: "14px" }}>
                    <option value="todas">Todas las marcas</option>
                    <option value="Valentine">Valentine</option>
                    <option value="Kerakoll">Kerakoll</option>
                    <option value="Higaltor">Higaltor</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", padding: "9px 0" }}>
                    <input type="checkbox" checked={scraperSoloSin} onChange={(e) => setScraperSoloSin(e.target.checked)} style={{ width: "16px", height: "16px" }} />
                    <span style={{ fontWeight: 600, fontSize: "13px" }}>Solo productos sin imagen</span>
                  </label>
                </div>
                <button onClick={lanzarScraper} disabled={scraperLoading} style={{
                  padding: "10px 22px", background: scraperLoading ? "#9ca3af" : "#059669",
                  color: "white", border: "none", borderRadius: "8px",
                  cursor: scraperLoading ? "not-allowed" : "pointer", fontSize: "14px", fontWeight: 700,
                }}>
                  {scraperLoading ? "Iniciando…" : "Actualizar imágenes"}
                </button>
                <button onClick={refrescarEstadoImagenes} style={{
                  padding: "10px 16px", background: "white", color: "#374151",
                  border: "1px solid #e5e7eb", borderRadius: "8px", cursor: "pointer", fontSize: "13px",
                }}>
                  Refrescar estado
                </button>
              </div>

              {scraperResult && (
                <div style={{ marginTop: "20px", padding: "14px 18px", background: "#d1fae5", border: "1px solid #6ee7b7", borderRadius: "8px" }}>
                  <strong>✅ {scraperResult.mensaje}</strong>
                  <p style={{ margin: "6px 0 0", fontSize: "13px", color: "#065f46" }}>
                    El proceso continúa en segundo plano. Pulsa "Refrescar estado" en unos minutos para ver los resultados.
                  </p>
                </div>
              )}
            </div>

            <div className="card" style={{ padding: "20px", background: "#fffbeb", border: "1px solid #fde68a" }}>
              <strong style={{ color: "#92400e", fontSize: "14px" }}>Nota sobre el scraper web</strong>
              <p style={{ color: "#92400e", fontSize: "13px", margin: "8px 0 0", lineHeight: 1.6 }}>
                El buscador intenta encontrar automáticamente las imágenes en las webs oficiales de los fabricantes.
                El resultado depende de la estructura de sus webs en ese momento. Para mejores resultados,
                también puedes editar cada producto manualmente (pestaña Productos → Editar) y pegar la URL
                de la imagen desde la web del fabricante.
              </p>
            </div>
          </div>
        )}

        {/* ── CONFIGURACIÓN ── */}
        {activeTab === "config" && (
          <div style={{ maxWidth: "680px" }}>

            {/* Datos de la tienda */}
            <div className="card" style={{ padding: "28px", marginBottom: "20px" }}>
              <h3 style={{ marginTop: 0, marginBottom: "20px", fontSize: "17px" }}>🏪 Datos de la tienda</h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                {[
                  ["tienda_nombre",    "Nombre de la tienda",     "text"],
                  ["tienda_telefono",  "Teléfono",                "text"],
                  ["tienda_ciudad",    "Ciudad",                  "text"],
                  ["tienda_direccion", "Dirección",               "text"],
                  ["tienda_horario",   "Horario de atención",     "text"],
                ].map(([key, label, type]) => (
                  <div key={key} style={key === "tienda_horario" || key === "tienda_direccion" ? { gridColumn: "1 / -1" } : {}}>
                    <label style={{ display: "block", fontWeight: 600, marginBottom: "5px", fontSize: "13px" }}>{label}</label>
                    <input
                      type={type} value={config[key] || ""}
                      onChange={(e) => setConfig(c => ({ ...c, [key]: e.target.value }))}
                      style={{ width: "100%", padding: "9px 12px", border: "1px solid #e5e7eb", borderRadius: "7px", fontSize: "14px", boxSizing: "border-box" }}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Datos bancarios */}
            <div className="card" style={{ padding: "28px", marginBottom: "20px", border: "2px solid #fde68a", background: "#fffbeb" }}>
              <h3 style={{ marginTop: 0, marginBottom: "8px", fontSize: "17px" }}>🏦 Datos bancarios</h3>
              <p style={{ color: "#92400e", fontSize: "13px", marginBottom: "16px" }}>
                El IBAN se almacena <strong>cifrado</strong> en la base de datos. Solo se muestra al cliente en la página del pedido.
              </p>
              <label style={{ display: "block", fontWeight: 600, marginBottom: "5px", fontSize: "13px" }}>IBAN</label>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <input
                  type={ibanVisible ? "text" : "password"}
                  value={config.iban || ""}
                  onChange={(e) => setConfig(c => ({ ...c, iban: e.target.value }))}
                  placeholder="ES00 0000 0000 0000 0000 0000"
                  style={{ flex: 1, padding: "9px 12px", border: "1px solid #fbbf24", borderRadius: "7px", fontSize: "14px", background: "white" }}
                />
                <button onClick={() => setIbanVisible(v => !v)} style={{
                  padding: "9px 14px", border: "1px solid #e5e7eb", borderRadius: "7px",
                  background: "white", cursor: "pointer", fontSize: "13px", whiteSpace: "nowrap",
                }}>
                  {ibanVisible ? "🙈 Ocultar" : "👁 Ver"}
                </button>
              </div>
            </div>

            {/* Email y SMTP */}
            <div className="card" style={{ padding: "28px", marginBottom: "20px" }}>
              <h3 style={{ marginTop: 0, marginBottom: "20px", fontSize: "17px" }}>📧 Email y notificaciones</h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                {[
                  ["email_admin", "Email de notificaciones (admin)", "text"],
                  ["email_from",  "Remitente (From)",                "text"],
                  ["smtp_host",   "Servidor SMTP",                   "text"],
                  ["smtp_port",   "Puerto SMTP",                     "text"],
                  ["smtp_user",   "Usuario SMTP",                    "text"],
                ].map(([key, label, type]) => (
                  <div key={key} style={key === "email_admin" || key === "email_from" ? { gridColumn: "1 / -1" } : {}}>
                    <label style={{ display: "block", fontWeight: 600, marginBottom: "5px", fontSize: "13px" }}>{label}</label>
                    <input
                      type={type} value={config[key] || ""}
                      onChange={(e) => setConfig(c => ({ ...c, [key]: e.target.value }))}
                      style={{ width: "100%", padding: "9px 12px", border: "1px solid #e5e7eb", borderRadius: "7px", fontSize: "14px", boxSizing: "border-box" }}
                    />
                  </div>
                ))}
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={{ display: "block", fontWeight: 600, marginBottom: "5px", fontSize: "13px" }}>
                    Contraseña SMTP <span style={{ fontWeight: 400, color: "#9ca3af", fontSize: "12px" }}>(cifrada)</span>
                  </label>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <input
                      type={smtpPassVisible ? "text" : "password"}
                      value={config.smtp_password || ""}
                      onChange={(e) => setConfig(c => ({ ...c, smtp_password: e.target.value }))}
                      placeholder="Contraseña de aplicación Gmail..."
                      style={{ flex: 1, padding: "9px 12px", border: "1px solid #e5e7eb", borderRadius: "7px", fontSize: "14px" }}
                    />
                    <button onClick={() => setSmtpPassVisible(v => !v)} style={{
                      padding: "9px 14px", border: "1px solid #e5e7eb", borderRadius: "7px",
                      background: "white", cursor: "pointer", fontSize: "13px",
                    }}>
                      {smtpPassVisible ? "🙈" : "👁"}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Tarifas de envío */}
            <div className="card" style={{ padding: "28px", marginBottom: "20px" }}>
              <h3 style={{ marginTop: 0, marginBottom: "8px", fontSize: "17px" }}>🚚 Tarifas de envío</h3>
              <p style={{ color: "#6b7280", fontSize: "13px", marginBottom: "20px" }}>Valores en euros. Los cambios se aplican a nuevos pedidos.</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px" }}>
                {[
                  ["envio_gratis_desde",    "Gratis desde (€)"],
                  ["precio_envio_estandar", "Envío estándar (€)"],
                  ["precio_envio_pesado",   "Envío pesado (€)"],
                ].map(([key, label]) => (
                  <div key={key}>
                    <label style={{ display: "block", fontWeight: 600, marginBottom: "5px", fontSize: "13px" }}>{label}</label>
                    <input
                      type="number" step="0.01" value={config[key] || ""}
                      onChange={(e) => setConfig(c => ({ ...c, [key]: e.target.value }))}
                      style={{ width: "100%", padding: "9px 12px", border: "1px solid #e5e7eb", borderRadius: "7px", fontSize: "16px", fontWeight: 700, boxSizing: "border-box" }}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Guardar */}
            <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
              <button onClick={saveConfig} style={{
                padding: "12px 28px", background: "#1e3a5f", color: "white",
                border: "none", borderRadius: "8px", cursor: "pointer",
                fontSize: "15px", fontWeight: 700,
              }}>
                Guardar toda la configuración
              </button>
              {configOk && <span style={{ color: "#059669", fontWeight: 700, fontSize: "14px" }}>✓ Configuración guardada</span>}
            </div>
          </div>
        )}

        {/* ── AÑADIR PRODUCTO ── */}
        {activeTab === "add" && (
          <div className="card" style={{ padding: "28px", maxWidth: "640px" }}>
            <h3 style={{ marginTop: 0, marginBottom: "20px" }}>Añadir Nuevo Producto</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              <div className="form-group">
                <label>ID (único, sin espacios)</label>
                <input
                  type="text" value={newProduct.id}
                  onChange={(e) => setNewProduct(p => ({ ...p, id: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") }))}
                  placeholder="val-007"
                />
              </div>
              <div className="form-group">
                <label>Nombre del producto</label>
                <input type="text" value={newProduct.nombre} onChange={(e) => setNewProduct(p => ({ ...p, nombre: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Marca</label>
                <select value={newProduct.marca} onChange={(e) => setNewProduct(p => ({ ...p, marca: e.target.value }))}>
                  <option>Valentine</option><option>Kerakoll</option><option>Higaltor</option><option>Varios</option>
                </select>
              </div>
              <div className="form-group">
                <label>Categoría</label>
                <select value={newProduct.categoria} onChange={(e) => setNewProduct(p => ({ ...p, categoria: e.target.value }))}>
                  <option value="pinturas">Pinturas</option>
                  <option value="morteros">Morteros</option>
                  <option value="impermeabilizantes">Impermeabilizantes</option>
                  <option value="adhesivos">Adhesivos</option>
                  <option value="antihumedad">Antihumedad</option>
                  <option value="imprimaciones">Imprimaciones</option>
                  <option value="barnices">Barnices</option>
                  <option value="esmaltes">Esmaltes</option>
                  <option value="auxiliares">Auxiliares</option>
                </select>
              </div>
              <div className="form-group">
                <label>Precio € (tarifa sin IVA)</label>
                <input type="number" step="0.01" value={newProduct.precio} onChange={(e) => setNewProduct(p => ({ ...p, precio: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div className="form-group">
                <label>Stock</label>
                <input type="number" value={newProduct.stock} onChange={(e) => setNewProduct(p => ({ ...p, stock: parseInt(e.target.value) || 0 }))} />
              </div>
              <div className="form-group" style={{ gridColumn: "1 / -1" }}>
                <label>Imagen del producto</label>
                <div style={{ display: "flex", gap: "10px", alignItems: "center", marginBottom: "8px" }}>
                  <label style={{ padding: "8px 14px", background: "#f3f4f6", border: "1px solid #e5e7eb", borderRadius: "6px", cursor: "pointer", fontSize: "13px" }}>
                    {uploading ? "Subiendo..." : "📁 Subir archivo"}
                    <input type="file" accept="image/*" onChange={async (e) => {
                      const url = await handleImageUpload(e.target.files[0]);
                      if (url) setNewProduct(p => ({ ...p, imagen: url }));
                    }} disabled={uploading} style={{ display: "none" }} />
                  </label>
                  <input
                    type="text" value={newProduct.imagen}
                    onChange={(e) => setNewProduct(p => ({ ...p, imagen: e.target.value }))}
                    placeholder="https://... o /uploads/..."
                    style={{ flex: 1 }}
                  />
                </div>
                {newProduct.imagen && (
                  <img src={newProduct.imagen} alt="Preview" style={{ width: "80px", height: "80px", objectFit: "cover", borderRadius: "6px", border: "1px solid #e5e7eb" }}
                    onError={(e) => (e.target.style.display = "none")} />
                )}
              </div>
              <div className="form-group" style={{ gridColumn: "1 / -1" }}>
                <label>Descripción</label>
                <textarea rows="3" value={newProduct.descripcion} onChange={(e) => setNewProduct(p => ({ ...p, descripcion: e.target.value }))} />
              </div>
              <div className="form-group">
                <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                  <input type="checkbox" checked={newProduct.destacado} onChange={(e) => setNewProduct(p => ({ ...p, destacado: e.target.checked }))} />
                  Producto destacado (aparece en portada)
                </label>
              </div>
            </div>
            <button className="btn btn-primary" style={{ marginTop: "20px" }} onClick={addProduct}>
              Crear Producto
            </button>
          </div>
        )}
      </main>

      <footer className="footer">
        <div className="container">
          <div className="footer-bottom">© 2025 NomasHumedades. Todos los derechos reservados.</div>
        </div>
      </footer>
    </>
  );
}
