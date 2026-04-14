/**
 * SumUpCheckout — Componente de pago con tarjeta vía SumUp Hosted Checkout.
 *
 * Flujo:
 *  1. Abre la URL de SumUp en un popup del navegador
 *  2. Muestra un spinner mientras el usuario paga
 *  3. Escucha postMessage del popup (cuando SumUp redirige al return URL)
 *  4. Sondea /api/pago/sumup-status/{orderId} cada 3 s como respaldo
 *  5. Llama a onSuccess(orderId) o onFailure() según el resultado
 *
 * Props:
 *  checkoutUrl  — URL del Hosted Checkout de SumUp
 *  orderId      — UUID del pedido en nuestra DB
 *  amount       — importe total con IVA (solo para mostrar)
 *  onSuccess    — callback(orderId) cuando el pago se confirma
 *  onFailure    — callback() cuando el pago falla o el usuario cancela
 *  onCancel     — callback() cuando el usuario hace clic en "Cancelar"
 */

import { useEffect, useRef, useState } from "react";
import { API_URL } from "../lib/api";

const POLL_INTERVAL_MS = 3000;
const MAX_POLL_ATTEMPTS = 60; // 3 min máximo de espera

export default function SumUpCheckout({ checkoutUrl, orderId, amount, onSuccess, onFailure, onCancel }) {
  const [phase, setPhase] = useState("ready"); // ready | waiting | paid | failed
  const [dots, setDots] = useState(".");
  const [popupClosed, setPopupClosed] = useState(false);
  const popupRef = useRef(null);
  const pollRef = useRef(null);
  const attemptsRef = useRef(0);

  // ── Animación de puntos suspensivos ──────────────────────────────────────
  useEffect(() => {
    if (phase !== "waiting") return;
    const id = setInterval(() => setDots((d) => (d.length >= 3 ? "." : d + ".")), 600);
    return () => clearInterval(id);
  }, [phase]);

  // ── Escuchar postMessage del popup ────────────────────────────────────────
  useEffect(() => {
    const handler = (event) => {
      if (event.data?.type === "SUMUP_RETURN") {
        const { status } = event.data;
        if (status === "paid") {
          handlePaid();
        } else {
          // El popup cerró pero el estado no es paid → seguir sondeando
        }
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  // ── Sondeo periódico ──────────────────────────────────────────────────────
  const startPolling = () => {
    attemptsRef.current = 0;
    pollRef.current = setInterval(async () => {
      attemptsRef.current += 1;
      if (attemptsRef.current > MAX_POLL_ATTEMPTS) {
        clearInterval(pollRef.current);
        return;
      }
      try {
        const res = await fetch(`${API_URL}/api/pago/sumup-status/${orderId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.status === "paid") {
          handlePaid();
        } else if (data.status === "failed") {
          handleFailed();
        }
      } catch {}
    }, POLL_INTERVAL_MS);
  };

  const stopPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current);
  };

  // ── Detectar cierre del popup ────────────────────────────────────────────
  const startPopupWatcher = () => {
    const id = setInterval(() => {
      if (popupRef.current?.closed) {
        clearInterval(id);
        setPopupClosed(true);
        // No paramos el sondeo — puede que haya pagado pero el popup se cerró antes del postMessage
      }
    }, 800);
  };

  // ── Abrir popup ───────────────────────────────────────────────────────────
  const openPopup = () => {
    const w = 500, h = 700;
    const left = Math.max(0, (window.screen.width - w) / 2);
    const top = Math.max(0, (window.screen.height - h) / 2);
    const popup = window.open(
      checkoutUrl,
      "sumup_checkout",
      `width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=yes`
    );

    if (!popup || popup.closed) {
      // Popups bloqueados por el navegador
      setPhase("popup_blocked");
      return;
    }

    popupRef.current = popup;
    setPhase("waiting");
    setPopupClosed(false);
    startPolling();
    startPopupWatcher();
  };

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handlePaid = () => {
    stopPolling();
    setPhase("paid");
    setTimeout(() => onSuccess?.(orderId), 1200);
  };

  const handleFailed = () => {
    stopPolling();
    setPhase("failed");
  };

  const handleRetry = () => {
    stopPolling();
    setPhase("ready");
    setPopupClosed(false);
    attemptsRef.current = 0;
  };

  // Limpiar al desmontar
  useEffect(() => {
    return () => {
      stopPolling();
      if (popupRef.current && !popupRef.current.closed) {
        try { popupRef.current.close(); } catch {}
      }
    };
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{
      border: "2px solid #3b82f6",
      borderRadius: "12px",
      padding: "24px",
      textAlign: "center",
      background: "#eff6ff",
      marginTop: "16px",
    }}>
      {/* LISTO PARA PAGAR */}
      {phase === "ready" && (
        <>
          <div style={{ fontSize: "40px", marginBottom: "12px" }}>💳</div>
          <h3 style={{ color: "#1e40af", margin: "0 0 8px" }}>Pago con tarjeta</h3>
          <p style={{ color: "#374151", margin: "0 0 16px", fontSize: "14px" }}>
            Total a pagar: <strong style={{ fontSize: "18px" }}>{amount?.toFixed(2)} €</strong>
            <span style={{ fontSize: "12px", color: "#6b7280" }}> (IVA incluido)</span>
          </p>
          <p style={{ color: "#6b7280", fontSize: "13px", margin: "0 0 16px" }}>
            Se abrirá una ventana emergente con la pasarela de pago segura de SumUp.
            Acepta los popups si el navegador te lo pide.
          </p>
          <button
            className="btn btn-primary"
            style={{ minWidth: "200px" }}
            onClick={openPopup}
          >
            Pagar con tarjeta →
          </button>
          <div style={{ marginTop: "12px" }}>
            <button
              onClick={onCancel}
              style={{ background: "none", border: "none", color: "#6b7280", fontSize: "13px", cursor: "pointer", textDecoration: "underline" }}
            >
              Volver y cambiar método de pago
            </button>
          </div>
        </>
      )}

      {/* ESPERANDO PAGO */}
      {phase === "waiting" && (
        <>
          <div style={{ fontSize: "36px", marginBottom: "12px" }}>
            <span style={{ display: "inline-block", animation: "spin 1s linear infinite" }}>⏳</span>
          </div>
          <h3 style={{ color: "#1e40af", margin: "0 0 8px" }}>Esperando confirmación de pago{dots}</h3>
          <p style={{ color: "#374151", fontSize: "14px", margin: "0 0 16px" }}>
            Completa el pago en la ventana de SumUp. No cierres esta página.
          </p>
          {popupClosed && (
            <div style={{ background: "#fef3c7", borderRadius: "8px", padding: "12px", marginBottom: "12px" }}>
              <p style={{ margin: 0, fontSize: "13px", color: "#92400e" }}>
                ¿Cerraste la ventana de pago? Si ya completaste el pago, espera unos segundos.
                Si no, puedes reabrirla.
              </p>
              <button className="btn btn-outline btn-sm" style={{ marginTop: "8px" }} onClick={openPopup}>
                Reabrir ventana de pago
              </button>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "center", gap: "8px" }}>
            <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#3b82f6", animation: "pulse 1.4s infinite" }} />
            <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#3b82f6", animation: "pulse 1.4s 0.2s infinite" }} />
            <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#3b82f6", animation: "pulse 1.4s 0.4s infinite" }} />
          </div>
          <button
            onClick={onCancel}
            style={{ marginTop: "16px", background: "none", border: "none", color: "#9ca3af", fontSize: "12px", cursor: "pointer" }}
          >
            Cancelar y volver al carrito
          </button>
        </>
      )}

      {/* POPUP BLOQUEADO */}
      {phase === "popup_blocked" && (
        <>
          <div style={{ fontSize: "36px", marginBottom: "12px" }}>🚫</div>
          <h3 style={{ color: "#dc2626", margin: "0 0 8px" }}>Ventana emergente bloqueada</h3>
          <p style={{ color: "#374151", fontSize: "14px", margin: "0 0 16px" }}>
            Tu navegador bloqueó la ventana de pago. Permite los popups para este sitio
            y vuelve a intentarlo.
          </p>
          <button className="btn btn-primary" onClick={openPopup}>Intentar de nuevo</button>
          <div style={{ marginTop: "8px" }}>
            <a
              href={checkoutUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: "13px", color: "#3b82f6" }}
            >
              O abre el pago en una pestaña nueva →
            </a>
          </div>
        </>
      )}

      {/* PAGADO */}
      {phase === "paid" && (
        <>
          <div style={{ fontSize: "48px", marginBottom: "12px" }}>✅</div>
          <h3 style={{ color: "#065f46", margin: "0 0 8px" }}>¡Pago confirmado!</h3>
          <p style={{ color: "#374151", fontSize: "14px" }}>Redirigiendo al detalle de tu pedido...</p>
        </>
      )}

      {/* FALLIDO */}
      {phase === "failed" && (
        <>
          <div style={{ fontSize: "40px", marginBottom: "12px" }}>❌</div>
          <h3 style={{ color: "#dc2626", margin: "0 0 8px" }}>Pago no completado</h3>
          <p style={{ color: "#374151", fontSize: "14px", margin: "0 0 16px" }}>
            El pago no se completó. Puedes intentarlo de nuevo o cambiar a transferencia bancaria.
          </p>
          <div style={{ display: "flex", gap: "8px", justifyContent: "center", flexWrap: "wrap" }}>
            <button className="btn btn-primary" onClick={handleRetry}>Intentar de nuevo</button>
            <button className="btn btn-outline" onClick={onCancel}>Cambiar método de pago</button>
          </div>
        </>
      )}

      {/* Indicadores de seguridad */}
      {(phase === "ready" || phase === "waiting") && (
        <div style={{ marginTop: "16px", display: "flex", justifyContent: "center", gap: "16px", fontSize: "11px", color: "#9ca3af" }}>
          <span>🔒 Pago seguro SSL</span>
          <span>💳 Visa / Mastercard / Amex</span>
          <span>🛡️ Powered by SumUp</span>
        </div>
      )}

      <style jsx>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 80%, 100% { opacity: 0.2; transform: scale(0.8); } 40% { opacity: 1; transform: scale(1); } }
      `}</style>
    </div>
  );
}
