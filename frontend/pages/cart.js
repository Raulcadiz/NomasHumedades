import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { API_URL, apiFetch, isLoggedIn, clearSession } from "../lib/api";
import SumUpCheckout from "../components/SumUpCheckout";

export default function Cart() {
  const router = useRouter();
  const [cart, setCart] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);
  const [checkoutData, setCheckoutData] = useState({
    metodo_entrega: "envio",
    direccion: "",
    telefono: "",
    metodo_pago: "transferencia",
  });
  const [showCheckout, setShowCheckout] = useState(false);
  const [orderResult, setOrderResult] = useState(null);
  const [checkoutError, setCheckoutError] = useState("");
  const [envioInfo, setEnvioInfo] = useState(null);
  const [sumupEnabled, setSumupEnabled] = useState(false);
  // Estado del flujo SumUp: null | { checkoutUrl, orderId, amount }
  const [sumupSession, setSumupSession] = useState(null);

  useEffect(() => {
    const logged = isLoggedIn();
    setLoggedIn(logged);
    if (logged) loadCart();
    setLoading(false);
    // Consultar si SumUp está disponible
    fetch(`${API_URL}/api/sumup/config`)
      .then((r) => r.json())
      .then((d) => setSumupEnabled(d.enabled || false))
      .catch(() => setSumupEnabled(false));
  }, []);

  const loadCart = async () => {
    try {
      const res = await apiFetch("/api/carrito");
      if (res.status === 401) {
        clearSession();
        setLoggedIn(false);
        return;
      }
      const data = await res.json();
      setCart(data);
    } catch {}
  };

  const updateQuantity = async (productId, cantidad) => {
    await apiFetch(`/api/carrito/${productId}?cantidad=${cantidad}`, { method: "PUT" });
    loadCart();
  };

  const removeItem = async (productId) => {
    await apiFetch(`/api/carrito/${productId}`, { method: "DELETE" });
    loadCart();
  };

  // Recalcula el coste de envío cuando cambia el método de entrega o el carrito
  const calcularEnvio = useCallback(async (metodo, subtotal, categoriasEnCarrito) => {
    if (metodo === "recogida") {
      setEnvioInfo({ coste: 0, gratis: true, motivo: "Recogida gratuita en tienda" });
      return;
    }
    try {
      const cats = categoriasEnCarrito.join(",");
      const res = await apiFetch(
        `/api/envio/calcular?metodo_entrega=${metodo}&subtotal=${subtotal}&categorias=${encodeURIComponent(cats)}`
      );
      if (res.ok) setEnvioInfo(await res.json());
    } catch {}
  }, []);

  const checkout = async () => {
    setCheckoutError("");

    if (checkoutData.metodo_entrega === "envio" && !checkoutData.direccion.trim()) {
      setCheckoutError("Introduce la dirección de envío.");
      return;
    }
    if (!checkoutData.telefono.trim()) {
      setCheckoutError("Introduce un teléfono de contacto.");
      return;
    }

    try {
      const items = cart.items.map((item) => ({
        producto_id: item.producto.id,
        cantidad: item.cantidad,
      }));

      // 1. Crear el pedido
      const res = await apiFetch("/api/pedidos", {
        method: "POST",
        body: JSON.stringify({
          items,
          metodo_entrega: checkoutData.metodo_entrega,
          direccion_envio: checkoutData.metodo_entrega === "envio" ? checkoutData.direccion : null,
          telefono: checkoutData.telefono,
          metodo_pago: checkoutData.metodo_pago,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        setCheckoutError(err.detail || "Error al crear el pedido");
        return;
      }

      const orderData = await res.json();

      // 2a. Pago con transferencia → mostrar confirmación directamente
      if (checkoutData.metodo_pago === "transferencia") {
        setOrderResult(orderData);
        setShowCheckout(false);
        setCart({ items: [], total: 0 });
        return;
      }

      // 2b. Pago con SumUp → crear sesión de pago y abrir popup
      if (checkoutData.metodo_pago === "sumup") {
        const sesionRes = await apiFetch(
          `/api/pago/crear-sesion-sumup?order_id=${orderData.order_id}`,
          { method: "POST" }
        );
        if (!sesionRes.ok) {
          const err = await sesionRes.json();
          setCheckoutError(err.detail || "Error al iniciar el pago con tarjeta. Prueba transferencia bancaria.");
          return;
        }
        const sesion = await sesionRes.json();
        setShowCheckout(false);
        setCart({ items: [], total: 0 });
        setSumupSession({
          checkoutUrl: sesion.checkout_url,
          orderId: orderData.order_id,
          amount: sesion.amount,
        });
      }
    } catch {
      setCheckoutError("Error de conexión. Inténtalo de nuevo.");
    }
  };

  const handleSumupSuccess = (orderId) => {
    setSumupSession(null);
    router.push(`/pedido/${orderId}`);
  };

  const handleSumupCancel = () => {
    setSumupSession(null);
    // El pedido ya se creó; el usuario puede pagar por transferencia desde /mis-pedidos
    router.push("/mis-pedidos");
  };

  if (loading) {
    return (
      <div className="container" style={{ padding: "60px", textAlign: "center" }}>
        <p>Cargando...</p>
      </div>
    );
  }

  if (!loggedIn) {
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
            </div>
          </div>
        </header>
        <div className="container" style={{ padding: "60px" }}>
          <div className="empty-cart">
            <h2>Debes iniciar sesión</h2>
            <p>Para ver tu carrito, inicia sesión o regístrate.</p>
            <Link href="/auth" className="btn btn-primary">Iniciar Sesión</Link>
          </div>
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
          </div>
        </div>
      </header>

      <main className="container" style={{ padding: "40px 20px" }}>
        <h1 className="page-title">Carrito de Compras</h1>

        {/* ── Pantalla de pago SumUp (popup + polling) ── */}
        {sumupSession && (
          <SumUpCheckout
            checkoutUrl={sumupSession.checkoutUrl}
            orderId={sumupSession.orderId}
            amount={sumupSession.amount}
            onSuccess={handleSumupSuccess}
            onFailure={() => setSumupSession(null)}
            onCancel={handleSumupCancel}
          />
        )}

        {orderResult && (
          <div className="alert alert-success" style={{ marginBottom: "24px" }}>
            <h3>✅ Pedido creado correctamente</h3>
            <p>Número de pedido: <strong style={{ fontFamily: "monospace" }}>#{orderResult.order_id?.substring(0, 8).toUpperCase()}</strong></p>
            <p>Total: <strong>{((orderResult.total || 0) * 1.21).toFixed(2)} € (IVA incl.)</strong></p>
            {orderResult.metodo_entrega === "recogida"
              ? <p>🏪 Recogida en tienda — te avisaremos cuando esté listo.</p>
              : <p>🚚 Recibirás un email con los datos de seguimiento.</p>}
            {checkoutData.metodo_pago === "transferencia" && (
              <p style={{ marginTop: 8 }}>
                🏦 <strong>Datos de transferencia:</strong> los encontrarás en el detalle del pedido y en el email que acabas de recibir.
              </p>
            )}
            <div style={{ marginTop: "12px" }}>
              <Link href={`/pedido/${orderResult.order_id}`} className="btn btn-primary btn-sm">
                Ver detalle del pedido
              </Link>
            </div>
          </div>
        )}

        {cart.items.length === 0 && !orderResult ? (
          <div className="empty-cart">
            <h2>Tu carrito está vacío</h2>
            <p>Explora nuestro catálogo y añade productos.</p>
            <Link href="/catalog" className="btn btn-primary">Ver Catálogo</Link>
          </div>
        ) : cart.items.length > 0 ? (
          <div className="cart-page">
            <div className="cart-items">
              {cart.items.map((item) => (
                <div key={item.producto.id} className="cart-item">
                  <div
                    className="cart-item-image"
                    style={{
                      backgroundImage: `url(${item.producto.imagen})`,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                    }}
                  />
                  <div className="cart-item-info">
                    <Link href={`/product/${item.producto.id}`}>
                      <div className="cart-item-name">{item.producto.nombre}</div>
                    </Link>
                    <div className="cart-item-price">
                      {item.producto.precio.toFixed(2)} € × {item.cantidad} = {item.subtotal.toFixed(2)} €
                    </div>
                    <div className="cart-item-quantity">
                      <button className="btn btn-sm btn-outline" onClick={() => updateQuantity(item.producto.id, item.cantidad - 1)}>−</button>
                      <span>{item.cantidad}</span>
                      <button className="btn btn-sm btn-outline" onClick={() => updateQuantity(item.producto.id, item.cantidad + 1)}>+</button>
                    </div>
                  </div>
                  <div className="cart-item-actions">
                    <button className="btn btn-sm btn-outline" onClick={() => removeItem(item.producto.id)}>Eliminar</button>
                  </div>
                </div>
              ))}
            </div>

            <div className="cart-summary">
              <h3>Resumen del Pedido</h3>
              <div className="summary-row">
                <span>Subtotal</span>
                <span>{cart.total.toFixed(2)} €</span>
              </div>
              {showCheckout && envioInfo && (
                <div className="summary-row">
                  <span>Envío</span>
                  <span style={{ color: envioInfo.gratis ? "#059669" : undefined }}>
                    {envioInfo.gratis ? "Gratis" : `${envioInfo.coste.toFixed(2)} €`}
                  </span>
                </div>
              )}
              <div className="summary-row">
                <span>IVA (21%)</span>
                <span>{((cart.total + (showCheckout && envioInfo ? envioInfo.coste : 0)) * 0.21).toFixed(2)} €</span>
              </div>
              <div className="summary-row total">
                <span>Total</span>
                <span>
                  {((cart.total + (showCheckout && envioInfo ? envioInfo.coste : 0)) * 1.21).toFixed(2)} €
                </span>
              </div>

              {!showCheckout ? (
                <button
                  className="btn btn-primary"
                  style={{ width: "100%", marginTop: "16px" }}
                  onClick={() => {
                    setShowCheckout(true);
                    const cats = cart.items.map(i => i.producto?.categoria).filter(Boolean);
                    calcularEnvio("envio", cart.total, cats);
                  }}
                >
                  Proceder al Pago
                </button>
              ) : (
                <div style={{ marginTop: "16px" }}>
                  {/* Método de entrega */}
                  <div className="form-group">
                    <label>Método de entrega</label>
                    <div style={{ display: "flex", gap: "12px", marginTop: "8px" }}>
                      <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
                        <input
                          type="radio"
                          name="entrega"
                          value="envio"
                          checked={checkoutData.metodo_entrega === "envio"}
                          onChange={() => {
                            setCheckoutData((d) => ({ ...d, metodo_entrega: "envio" }));
                            const cats = cart.items.map(i => i.producto?.categoria).filter(Boolean);
                            calcularEnvio("envio", cart.total, cats);
                          }}
                        />
                        🚚 Envío a domicilio
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
                        <input
                          type="radio"
                          name="entrega"
                          value="recogida"
                          checked={checkoutData.metodo_entrega === "recogida"}
                          onChange={() => {
                            setCheckoutData((d) => ({ ...d, metodo_entrega: "recogida" }));
                            calcularEnvio("recogida", cart.total, []);
                          }}
                        />
                        🏪 Recogida en tienda (gratis)
                      </label>
                    </div>
                    {/* Coste de envío calculado */}
                    {envioInfo && (
                      <div style={{
                        marginTop: "8px",
                        padding: "8px 12px",
                        borderRadius: "6px",
                        background: envioInfo.gratis ? "#d1fae5" : "#f3f4f6",
                        fontSize: "13px",
                        color: envioInfo.gratis ? "#065f46" : "#374151",
                      }}>
                        {envioInfo.gratis
                          ? `✅ ${envioInfo.motivo}`
                          : `🚚 Coste de envío: ${envioInfo.coste.toFixed(2)} € — ${envioInfo.motivo}`}
                      </div>
                    )}
                  </div>

                  {checkoutData.metodo_entrega === "envio" && (
                    <div className="form-group">
                      <label>Dirección de envío</label>
                      <textarea
                        rows="3"
                        value={checkoutData.direccion}
                        onChange={(e) => setCheckoutData((d) => ({ ...d, direccion: e.target.value }))}
                        placeholder="Calle, número, piso, ciudad, código postal..."
                      />
                    </div>
                  )}

                  <div className="form-group">
                    <label>Teléfono de contacto</label>
                    <input
                      type="tel"
                      value={checkoutData.telefono}
                      onChange={(e) => setCheckoutData((d) => ({ ...d, telefono: e.target.value }))}
                      placeholder="Tu número de teléfono"
                    />
                  </div>

                  {/* Método de pago */}
                  <div className="form-group">
                    <label>Método de pago</label>
                    <div style={{ display: "flex", gap: "12px", marginTop: "8px", flexWrap: "wrap" }}>
                      <label style={{
                        display: "flex", alignItems: "center", gap: "6px", cursor: "pointer",
                        padding: "10px 14px", border: `2px solid ${checkoutData.metodo_pago === "transferencia" ? "#1e3a5f" : "#e5e7eb"}`,
                        borderRadius: "8px", background: checkoutData.metodo_pago === "transferencia" ? "#eff6ff" : "#fff",
                      }}>
                        <input
                          type="radio"
                          name="pago"
                          value="transferencia"
                          checked={checkoutData.metodo_pago === "transferencia"}
                          onChange={() => setCheckoutData((d) => ({ ...d, metodo_pago: "transferencia" }))}
                        />
                        🏦 Transferencia bancaria
                      </label>
                      {sumupEnabled && (
                        <label style={{
                          display: "flex", alignItems: "center", gap: "6px", cursor: "pointer",
                          padding: "10px 14px", border: `2px solid ${checkoutData.metodo_pago === "sumup" ? "#1e3a5f" : "#e5e7eb"}`,
                          borderRadius: "8px", background: checkoutData.metodo_pago === "sumup" ? "#eff6ff" : "#fff",
                        }}>
                          <input
                            type="radio"
                            name="pago"
                            value="sumup"
                            checked={checkoutData.metodo_pago === "sumup"}
                            onChange={() => setCheckoutData((d) => ({ ...d, metodo_pago: "sumup" }))}
                          />
                          💳 Tarjeta (Visa/Mastercard)
                        </label>
                      )}
                    </div>
                    {checkoutData.metodo_pago === "transferencia" && (
                      <p style={{ fontSize: "12px", color: "#6b7280", marginTop: "6px" }}>
                        Recibirás los datos bancarios por email y en el detalle del pedido.
                      </p>
                    )}
                    {checkoutData.metodo_pago === "sumup" && (
                      <p style={{ fontSize: "12px", color: "#6b7280", marginTop: "6px" }}>
                        🔒 Pago seguro con tarjeta. Se abrirá una ventana de SumUp.
                      </p>
                    )}
                  </div>

                  {checkoutError && (
                    <div className="alert alert-error" style={{ marginBottom: "12px" }}>
                      {checkoutError}
                    </div>
                  )}

                  <button className="btn btn-primary" style={{ width: "100%" }} onClick={checkout}>
                    Confirmar Pedido
                  </button>
                  <button
                    className="btn btn-outline"
                    style={{ width: "100%", marginTop: "8px" }}
                    onClick={() => { setShowCheckout(false); setCheckoutError(""); }}
                  >
                    Cancelar
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : null}
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
