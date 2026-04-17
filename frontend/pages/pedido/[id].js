import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { apiFetch, isLoggedIn, clearSession } from "../../lib/api";

const ESTADO_CONFIG = {
  pendiente:  { color: "#f59e0b", bg: "#fef3c7", label: "Pendiente de pago", icon: "⏳" },
  pagado:     { color: "#10b981", bg: "#d1fae5", label: "Pago confirmado", icon: "✅" },
  preparando: { color: "#3b82f6", bg: "#dbeafe", label: "Preparando", icon: "📦" },
  enviado:    { color: "#8b5cf6", bg: "#ede9fe", label: "Enviado", icon: "🚚" },
  entregado:  { color: "#059669", bg: "#d1fae5", label: "Entregado", icon: "🎉" },
  cancelado:  { color: "#ef4444", bg: "#fee2e2", label: "Cancelado", icon: "❌" },
};

const PASOS = ["pendiente", "pagado", "preparando", "enviado", "entregado"];

export default function OrderDetail() {
  const router = useRouter();
  const { id } = router.query;
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [ibanVisible, setIbanVisible] = useState(false);
  const [tiendaInfo, setTiendaInfo] = useState({ iban: "", telefono: "", nombre: "NomasHumedades" });

  useEffect(() => {
    // Carga los datos de la tienda (IBAN, teléfono) desde la API
    fetch(`${process.env.NEXT_PUBLIC_API_URL || ""}/api/tienda/info`)
      .then(r => r.ok ? r.json() : {})
      .then(d => setTiendaInfo(prev => ({ ...prev, ...d })))
      .catch(() => {});
  }, []);

  // Fallbacks desde env vars (por compatibilidad)
  const IBAN = tiendaInfo.iban || process.env.NEXT_PUBLIC_IBAN || "ES00 0000 0000 0000 0000 0000";
  const TELEFONO = tiendaInfo.telefono || process.env.NEXT_PUBLIC_TELEFONO || "+34 956 XXX XXX";

  useEffect(() => {
    if (!isLoggedIn()) {
      router.push("/auth");
      return;
    }
    if (id) loadOrder();
  }, [id]);

  const loadOrder = async () => {
    try {
      const res = await apiFetch(`/api/pedidos/${id}`);
      if (res.status === 401) {
        clearSession();
        router.push("/auth");
        return;
      }
      if (res.ok) {
        setOrder(await res.json());
      } else {
        router.push("/mis-pedidos");
      }
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="container" style={{ padding: "60px", textAlign: "center" }}>
        <p>Cargando pedido...</p>
      </div>
    );
  }

  if (!order) return null;

  const cfg = ESTADO_CONFIG[order.estado] || { color: "#6b7280", bg: "#f3f4f6", label: order.estado, icon: "•" };
  const pasoActual = PASOS.indexOf(order.estado);
  const esPendienteTransferencia = order.estado === "pendiente" && order.metodo_pago === "transferencia";

  return (
    <>
      <header className="header">
        <div className="container header-inner">
          <Link href="/" className="logo">No<span>+</span>Humedades</Link>
          <nav className="nav">
            <Link href="/">Inicio</Link>
            <Link href="/catalog">Catálogo</Link>
            <Link href="/mis-pedidos">Mis Pedidos</Link>
          </nav>
          <div className="header-actions">
            <Link href="/cart" className="cart-icon">🛒</Link>
          </div>
        </div>
      </header>

      <main className="container" style={{ padding: "40px 20px" }}>
        <div className="breadcrumb">
          <Link href="/">Inicio</Link>
          <span>/</span>
          <Link href="/mis-pedidos">Mis Pedidos</Link>
          <span>/</span>
          <span>#{order.id.substring(0, 8).toUpperCase()}</span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: "24px", marginTop: "24px" }}>

          {/* ── Columna izquierda ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

            {/* Estado */}
            <div className="card" style={{ padding: "24px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <h2 style={{ margin: "0 0 4px", fontSize: "20px" }}>
                    {cfg.icon} Pedido #{order.id.substring(0, 8).toUpperCase()}
                  </h2>
                  <p style={{ margin: 0, color: "#6b7280", fontSize: "14px" }}>
                    {new Date(order.fecha).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                  </p>
                </div>
                <span style={{
                  padding: "6px 16px",
                  borderRadius: "99px",
                  fontWeight: 700,
                  fontSize: "14px",
                  color: cfg.color,
                  background: cfg.bg,
                }}>
                  {cfg.label}
                </span>
              </div>

              {/* Barra de progreso */}
              {order.estado !== "cancelado" && (
                <div style={{ marginTop: "24px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", position: "relative" }}>
                    <div style={{
                      position: "absolute",
                      top: "14px",
                      left: "14px",
                      right: "14px",
                      height: "2px",
                      background: "#e5e7eb",
                      zIndex: 0,
                    }} />
                    <div style={{
                      position: "absolute",
                      top: "14px",
                      left: "14px",
                      width: pasoActual >= 0 ? `${Math.min(pasoActual / (PASOS.length - 1), 1) * 100}%` : "0%",
                      height: "2px",
                      background: "#1e3a5f",
                      zIndex: 1,
                      transition: "width 0.5s",
                    }} />
                    {PASOS.map((paso, i) => {
                      const hecho = i <= pasoActual;
                      const actual = i === pasoActual;
                      return (
                        <div key={paso} style={{ display: "flex", flexDirection: "column", alignItems: "center", zIndex: 2 }}>
                          <div style={{
                            width: "28px", height: "28px", borderRadius: "50%",
                            background: hecho ? "#1e3a5f" : "#e5e7eb",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: "12px", color: hecho ? "#fff" : "#9ca3af",
                            fontWeight: 700,
                            boxShadow: actual ? "0 0 0 4px #dbeafe" : "none",
                          }}>
                            {hecho ? "✓" : i + 1}
                          </div>
                          <span style={{ fontSize: "10px", marginTop: "4px", color: hecho ? "#1e3a5f" : "#9ca3af", fontWeight: hecho ? 600 : 400 }}>
                            {ESTADO_CONFIG[paso]?.label.split(" ")[0]}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Datos de pago bancario (solo si pendiente + transferencia) */}
            {esPendienteTransferencia && (
              <div style={{ background: "#fef3c7", border: "2px solid #f59e0b", borderRadius: "12px", padding: "20px" }}>
                <h3 style={{ color: "#92400e", margin: "0 0 12px" }}>🏦 Completa tu pago por transferencia</h3>
                <p style={{ color: "#78350f", margin: "0 0 12px", fontSize: "14px" }}>
                  Realiza una transferencia a los siguientes datos indicando el número de pedido como concepto:
                </p>
                <div style={{ background: "#fff", borderRadius: "8px", padding: "16px" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: "8px", fontSize: "14px" }}>
                    <span style={{ color: "#6b7280" }}>Beneficiario:</span>
                    <strong>NomasHumedades</strong>
                    <span style={{ color: "#6b7280" }}>IBAN:</span>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <strong style={{ fontFamily: "monospace" }}>
                        {ibanVisible ? IBAN : "ES•• •••• •••• •••• •••• ••••"}
                      </strong>
                      <button
                        onClick={() => setIbanVisible(!ibanVisible)}
                        style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "4px", border: "1px solid #d1d5db", cursor: "pointer", background: "#f9fafb" }}
                      >
                        {ibanVisible ? "Ocultar" : "Ver"}
                      </button>
                    </div>
                    <span style={{ color: "#6b7280" }}>Concepto:</span>
                    <strong style={{ fontFamily: "monospace", color: "#1e3a5f" }}>
                      {order.id.substring(0, 8).toUpperCase()}
                    </strong>
                    <span style={{ color: "#6b7280" }}>Importe:</span>
                    <strong style={{ color: "#059669" }}>{(order.total * 1.21).toFixed(2)} € (IVA incl.)</strong>
                  </div>
                </div>
                <p style={{ color: "#78350f", margin: "12px 0 0", fontSize: "13px" }}>
                  Una vez recibida la transferencia, confirmaremos tu pedido y recibirás un email de confirmación.
                  Cualquier duda llámanos al <strong>{TELEFONO}</strong>.
                </p>
              </div>
            )}

            {/* Productos */}
            <div className="card" style={{ padding: "24px" }}>
              <h3 style={{ margin: "0 0 16px" }}>Productos del pedido</h3>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #e5e7eb" }}>
                    <th style={{ textAlign: "left", padding: "8px", fontSize: "13px", color: "#6b7280" }}>Producto</th>
                    <th style={{ textAlign: "center", padding: "8px", fontSize: "13px", color: "#6b7280" }}>Cant.</th>
                    <th style={{ textAlign: "right", padding: "8px", fontSize: "13px", color: "#6b7280" }}>Precio</th>
                    <th style={{ textAlign: "right", padding: "8px", fontSize: "13px", color: "#6b7280" }}>Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items?.map((item, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={{ padding: "10px 8px", fontSize: "14px" }}>{item.nombre}</td>
                      <td style={{ padding: "10px 8px", textAlign: "center", fontSize: "14px" }}>{item.cantidad}</td>
                      <td style={{ padding: "10px 8px", textAlign: "right", fontSize: "14px" }}>{item.precio.toFixed(2)} €</td>
                      <td style={{ padding: "10px 8px", textAlign: "right", fontWeight: 600, fontSize: "14px" }}>{item.subtotal.toFixed(2)} €</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Columna derecha: resumen ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div className="card" style={{ padding: "20px" }}>
              <h3 style={{ margin: "0 0 16px" }}>Resumen</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#6b7280" }}>Subtotal</span>
                  <span>{(order.subtotal || order.total).toFixed(2)} €</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#6b7280" }}>Envío</span>
                  <span style={{ color: order.coste_envio === 0 ? "#059669" : undefined }}>
                    {order.coste_envio === 0 ? "Gratis" : `${order.coste_envio?.toFixed(2)} €`}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#6b7280" }}>IVA (21%)</span>
                  <span>{(order.total * 0.21).toFixed(2)} €</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: "16px", marginTop: "8px", paddingTop: "8px", borderTop: "2px solid #e5e7eb" }}>
                  <span>Total</span>
                  <span style={{ color: "#1e3a5f" }}>{(order.total * 1.21).toFixed(2)} €</span>
                </div>
              </div>
            </div>

            <div className="card" style={{ padding: "20px" }}>
              <h3 style={{ margin: "0 0 12px" }}>Entrega</h3>
              <p style={{ margin: "0 0 4px", fontSize: "14px", fontWeight: 600 }}>
                {order.metodo_entrega === "recogida" ? "🏪 Recogida en tienda" : "🚚 Envío a domicilio"}
              </p>
              {order.metodo_entrega === "envio" && (
                <p style={{ margin: 0, fontSize: "13px", color: "#6b7280" }}>{order.direccion_envio}</p>
              )}
              <p style={{ margin: "8px 0 0", fontSize: "13px", color: "#6b7280" }}>
                Teléfono: {order.telefono}
              </p>
            </div>

            <div className="card" style={{ padding: "20px" }}>
              <h3 style={{ margin: "0 0 8px" }}>Pago</h3>
              <p style={{ margin: 0, fontSize: "14px" }}>
                {order.metodo_pago === "transferencia" ? "🏦 Transferencia bancaria" : "💳 Tarjeta (SumUp)"}
              </p>
            </div>

            <Link href="/mis-pedidos" className="btn btn-outline" style={{ textAlign: "center" }}>
              ← Volver a mis pedidos
            </Link>
          </div>
        </div>
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
