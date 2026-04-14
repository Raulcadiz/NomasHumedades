import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { apiFetch, isLoggedIn, clearSession } from "../lib/api";

const ESTADO_CONFIG = {
  pendiente:  { color: "#f59e0b", bg: "#fef3c7", label: "Pendiente de pago" },
  pagado:     { color: "#10b981", bg: "#d1fae5", label: "Pago confirmado" },
  preparando: { color: "#3b82f6", bg: "#dbeafe", label: "Preparando" },
  enviado:    { color: "#8b5cf6", bg: "#ede9fe", label: "Enviado" },
  entregado:  { color: "#059669", bg: "#d1fae5", label: "Entregado" },
  cancelado:  { color: "#ef4444", bg: "#fee2e2", label: "Cancelado" },
};

function EstadoBadge({ estado }) {
  const cfg = ESTADO_CONFIG[estado] || { color: "#6b7280", bg: "#f3f4f6", label: estado };
  return (
    <span style={{
      display: "inline-block",
      padding: "3px 10px",
      borderRadius: "99px",
      fontSize: "12px",
      fontWeight: 600,
      color: cfg.color,
      background: cfg.bg,
    }}>
      {cfg.label}
    </span>
  );
}

export default function MisPedidos() {
  const router = useRouter();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isLoggedIn()) {
      router.push("/auth");
      return;
    }
    loadOrders();
  }, []);

  const loadOrders = async () => {
    try {
      const res = await apiFetch("/api/pedidos");
      if (res.status === 401) {
        clearSession();
        router.push("/auth");
        return;
      }
      if (res.ok) {
        setOrders(await res.json());
      }
    } finally {
      setLoading(false);
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
            <Link href="/analysis">Análisis IA</Link>
          </nav>
          <div className="header-actions">
            <Link href="/cart" className="cart-icon">🛒</Link>
          </div>
        </div>
      </header>

      <main className="container" style={{ padding: "40px 20px" }}>
        <h1 className="page-title">Mis Pedidos</h1>

        {loading ? (
          <p>Cargando pedidos...</p>
        ) : orders.length === 0 ? (
          <div className="empty-cart">
            <h2>No tienes pedidos todavía</h2>
            <p>Cuando realices un pedido aparecerá aquí.</p>
            <Link href="/catalog" className="btn btn-primary">Ver Catálogo</Link>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {orders.map((order) => (
              <div key={order.id} className="card" style={{ padding: "20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "4px" }}>
                      <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: "16px", color: "#1e3a5f" }}>
                        #{order.id.substring(0, 8).toUpperCase()}
                      </span>
                      <EstadoBadge estado={order.estado} />
                    </div>
                    <div style={{ fontSize: "13px", color: "#6b7280" }}>
                      {new Date(order.fecha).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })}
                      {" · "}
                      {order.metodo_entrega === "recogida" ? "🏪 Recogida en tienda" : `🚚 Envío a domicilio`}
                      {" · "}
                      {order.metodo_pago === "transferencia" ? "🏦 Transferencia" : "💳 Tarjeta"}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 700, fontSize: "18px", color: "#1e3a5f" }}>
                      {(order.total * 1.21).toFixed(2)} €
                      <span style={{ fontSize: "12px", color: "#6b7280", fontWeight: 400 }}> (IVA incl.)</span>
                    </div>
                    <div style={{ fontSize: "12px", color: "#6b7280" }}>
                      {order.items?.length} {order.items?.length === 1 ? "producto" : "productos"}
                    </div>
                  </div>
                </div>

                {/* Items resumidos */}
                <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px solid #e5e7eb" }}>
                  {order.items?.slice(0, 3).map((item, i) => (
                    <div key={i} style={{ fontSize: "13px", color: "#374151", marginBottom: "2px" }}>
                      {item.cantidad}× {item.nombre}
                    </div>
                  ))}
                  {order.items?.length > 3 && (
                    <div style={{ fontSize: "13px", color: "#6b7280" }}>
                      +{order.items.length - 3} productos más
                    </div>
                  )}
                </div>

                <div style={{ marginTop: "12px", display: "flex", gap: "8px" }}>
                  <Link href={`/pedido/${order.id}`} className="btn btn-outline btn-sm">
                    Ver detalle
                  </Link>
                  {order.estado === "pendiente" && order.metodo_pago === "transferencia" && (
                    <Link href={`/pedido/${order.id}`} className="btn btn-primary btn-sm">
                      Ver datos de pago
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <footer className="footer">
        <div className="container">
          <div className="footer-bottom">
            © 2025 NomasHumedades. Todos los derechos reservados.
          </div>
        </div>
      </footer>
    </>
  );
}
