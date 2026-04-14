import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { API_URL, apiFetch, isLoggedIn, fetchCartCount } from "../lib/api";

// ── Constantes de presentación ────────────────────────────────────────────────
const TIPO_LABELS = {
  condensacion: "Condensación",
  capilaridad: "Capilaridad",
  filtracion: "Filtración",
};

const TIPO_COLORES = {
  condensacion: { color: "#2563eb", bg: "#dbeafe" },
  capilaridad:  { color: "#d97706", bg: "#fef3c7" },
  filtracion:   { color: "#7c3aed", bg: "#ede9fe" },
};

const NIVEL_COLORES = {
  bajo:  { color: "#059669", bg: "#d1fae5" },
  medio: { color: "#d97706", bg: "#fef3c7" },
  alto:  { color: "#dc2626", bg: "#fee2e2" },
};

// ── Preguntas del cuestionario ────────────────────────────────────────────────
const ZONAS = [
  { id: "interior_pared", label: "Pared interior",        icono: "🏠" },
  { id: "exterior_pared", label: "Fachada / pared ext.",  icono: "🧱" },
  { id: "suelo",          label: "Suelo o solera",        icono: "⬇️" },
  { id: "techo",          label: "Techo",                 icono: "⬆️" },
  { id: "terraza",        label: "Terraza o cubierta",    icono: "🌧️" },
  { id: "sotano",         label: "Sótano o garaje",       icono: "🚗" },
];

const SINTOMAS = [
  { id: "manchas_oscuras",       label: "Manchas oscuras o húmedas",           icono: "🌑" },
  { id: "salitre",               label: "Salitre blanco (eflorescencias)",      icono: "🧂" },
  { id: "pintura_levantada",     label: "Pintura hinchada o desprendida",       icono: "🎨" },
  { id: "olor_humedad",          label: "Olor a humedad o moho",               icono: "👃" },
  { id: "condensacion_ventanas", label: "Condensación en ventanas o sup. frías",icono: "🪟" },
  { id: "grietas",               label: "Grietas o fisuras",                    icono: "⚡" },
];

const POSICIONES = [
  { id: "base_muro",   label: "Base o parte baja",   icono: "⬇️" },
  { id: "zona_media",  label: "Zona media del muro",  icono: "↔️" },
  { id: "parte_alta",  label: "Parte alta o techo",   icono: "⬆️" },
  { id: "multiple",    label: "En varias zonas",       icono: "🔄" },
];

const LLUVIA_OPS = [
  { id: "si",     label: "Sí, claramente empeora", icono: "🌧️" },
  { id: "aveces", label: "A veces / no estoy seguro", icono: "🤔" },
  { id: "no",     label: "No, independiente de la lluvia", icono: "☀️" },
];

// ── Subcomponentes ────────────────────────────────────────────────────────────

function NivelBadge({ nivel, info }) {
  const col = NIVEL_COLORES[nivel] || { color: "#6b7280", bg: "#f3f4f6" };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: "6px",
      padding: "4px 14px", borderRadius: "99px",
      fontWeight: 700, fontSize: "14px",
      color: col.color, background: col.bg,
    }}>
      {info?.icono} {info?.label || nivel}
    </span>
  );
}

function TipoBadge({ tipo }) {
  const col = TIPO_COLORES[tipo] || { color: "#6b7280", bg: "#f3f4f6" };
  const info = { condensacion: "💧", capilaridad: "📈", filtracion: "🔍" };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: "6px",
      padding: "4px 14px", borderRadius: "99px",
      fontWeight: 700, fontSize: "14px",
      color: col.color, background: col.bg,
    }}>
      {info[tipo]} {TIPO_LABELS[tipo] || tipo}
    </span>
  );
}

/** Tarjeta de producto recomendado (SIN precio) */
function ProductoCard({ product, onAddToCart }) {
  return (
    <div style={{
      display: "flex", gap: "12px", alignItems: "center",
      padding: "12px", background: "#f9fafb", borderRadius: "8px",
      border: "1px solid #e5e7eb",
    }}>
      <div style={{
        width: "56px", height: "56px", flexShrink: 0, borderRadius: "6px", overflow: "hidden",
        background: "#e5e7eb",
      }}>
        <img
          src={product.imagen}
          alt={product.nombre}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
          onError={(e) => (e.target.style.display = "none")}
        />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: "13px", lineHeight: 1.3 }}>{product.nombre}</div>
        <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "2px" }}>
          {product.marca} · {product.categoria}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "4px", flexShrink: 0 }}>
        <Link href={`/product/${product.id}`} className="btn btn-outline btn-sm" style={{ fontSize: "11px" }}>
          Ver ficha
        </Link>
        <button className="btn btn-primary btn-sm" style={{ fontSize: "11px" }} onClick={() => onAddToCart(product.id)}>
          Añadir
        </button>
      </div>
    </div>
  );
}

/** Panel de resultado (compartido por foto e IA) */
function ResultadoPanel({ result, cartCount, onAddToCart, onReset, origen }) {
  const nivel = result.nivel_gravedad;
  const nivelInfo = result.nivel_info;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

      {/* Cabecera del diagnóstico */}
      <div className="card" style={{ padding: "24px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "center", marginBottom: "16px" }}>
          <TipoBadge tipo={result.tipo} />
          <NivelBadge nivel={nivel} info={nivelInfo} />
          {origen === "foto_ia" && (
            <span style={{ fontSize: "12px", color: "#6b7280" }}>
              Confianza IA: {Math.round(result.confianza * 100)}%
            </span>
          )}
        </div>

        {/* Barra de nivel */}
        <div style={{
          height: "8px", background: "#e5e7eb", borderRadius: "4px",
          overflow: "hidden", marginBottom: "12px",
        }}>
          <div style={{
            height: "100%", borderRadius: "4px",
            width: nivel === "bajo" ? "30%" : nivel === "medio" ? "60%" : "95%",
            background: NIVEL_COLORES[nivel]?.color || "#6b7280",
            transition: "width 0.8s ease",
          }} />
        </div>

        <p style={{ color: "#6b7280", fontSize: "13px", marginBottom: "12px" }}>
          {nivelInfo?.descripcion}
        </p>
        <p style={{ fontSize: "14px", lineHeight: 1.6 }}>{result.descripcion}</p>
      </div>

      {/* Causas */}
      {result.causas?.length > 0 && (
        <div className="card" style={{ padding: "20px" }}>
          <h3 style={{ margin: "0 0 12px", fontSize: "16px" }}>🔎 Posibles causas</h3>
          <ul style={{ margin: 0, paddingLeft: "20px", display: "flex", flexDirection: "column", gap: "6px" }}>
            {result.causas.map((c, i) => (
              <li key={i} style={{ fontSize: "14px", color: "#374151" }}>{c}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Pasos de solución */}
      {result.pasos_solucion?.length > 0 && (
        <div className="card" style={{ padding: "20px" }}>
          <h3 style={{ margin: "0 0 12px", fontSize: "16px" }}>🛠️ Pasos recomendados</h3>
          <ol style={{ margin: 0, paddingLeft: "20px", display: "flex", flexDirection: "column", gap: "8px" }}>
            {result.pasos_solucion.map((p, i) => (
              <li key={i} style={{ fontSize: "14px", color: "#374151" }}>{p}</li>
            ))}
          </ol>
        </div>
      )}

      {/* Productos recomendados — SIN precio */}
      {result.productos_recomendados?.length > 0 && (
        <div className="card" style={{ padding: "20px" }}>
          <h3 style={{ margin: "0 0 4px", fontSize: "16px" }}>📦 Productos recomendados</h3>
          <p style={{ fontSize: "13px", color: "#6b7280", margin: "0 0 14px" }}>
            Seleccionados para este tipo de humedad. Consulta las fichas técnicas para elegir el más adecuado.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {result.productos_recomendados.map((p) => (
              <ProductoCard key={p.id} product={p} onAddToCart={onAddToCart} />
            ))}
          </div>
        </div>
      )}

      {/* CTA profesional */}
      <div style={{
        background: "linear-gradient(135deg, #1e3a5f, #2563eb)",
        borderRadius: "12px", padding: "24px", color: "#fff", textAlign: "center",
      }}>
        <h3 style={{ margin: "0 0 8px", color: "#fff" }}>¿Quieres una valoración exacta?</h3>
        <p style={{ margin: "0 0 16px", opacity: 0.85, fontSize: "14px" }}>
          Nuestros expertos visitan tu propiedad, confirman el diagnóstico y te dan un presupuesto personalizado sin compromiso.
        </p>
        <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
          <a
            href="tel:+34956000000"
            className="btn"
            style={{ background: "#fff", color: "#1e3a5f", fontWeight: 700 }}
          >
            📞 Llamar ahora
          </a>
          <Link href="/catalog" className="btn" style={{ background: "rgba(255,255,255,0.15)", color: "#fff", border: "1px solid rgba(255,255,255,0.4)" }}>
            Ver catálogo completo
          </Link>
        </div>
      </div>

      <button className="btn btn-outline" onClick={onReset}>
        ← Hacer otro diagnóstico
      </button>
    </div>
  );
}

// ── Modo foto ─────────────────────────────────────────────────────────────────
function ModoFoto({ onResult }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);

  const handleFile = (f) => {
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) { setError("Imagen demasiado grande (máx 10 MB)."); return; }
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setError("");
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f && f.type.startsWith("image/")) handleFile(f);
  };

  const analyze = async () => {
    if (!file) return;
    setAnalyzing(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${API_URL}/api/analyze`, { method: "POST", body: form });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail || `Error ${res.status}`);
      }
      onResult(await res.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setAnalyzing(false);
    }
  };

  const reset = () => { setFile(null); setPreview(null); setError(""); };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
      <div className="card" style={{ padding: "24px" }}>
        <h3 style={{ margin: "0 0 16px" }}>📸 Sube una foto de la zona afectada</h3>

        {!preview ? (
          <div
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onClick={() => document.getElementById("foto-input").click()}
            style={{
              border: `2px dashed ${dragOver ? "#2563eb" : "#d1d5db"}`,
              borderRadius: "12px", padding: "40px 20px", textAlign: "center",
              cursor: "pointer", background: dragOver ? "#eff6ff" : "#f9fafb",
              transition: "all 0.2s",
            }}
          >
            <div style={{ fontSize: "40px", marginBottom: "12px" }}>📁</div>
            <p style={{ margin: 0, fontWeight: 500 }}>Arrastra aquí o haz clic para seleccionar</p>
            <p style={{ margin: "6px 0 0", fontSize: "12px", color: "#9ca3af" }}>JPEG, PNG, WebP — máx 10 MB</p>
            <input
              id="foto-input" type="file" accept="image/*" style={{ display: "none" }}
              onChange={(e) => handleFile(e.target.files[0])}
            />
          </div>
        ) : (
          <div style={{ textAlign: "center" }}>
            <img src={preview} alt="preview" style={{ maxWidth: "100%", maxHeight: "280px", borderRadius: "8px", objectFit: "contain" }} />
            <button onClick={reset} className="btn btn-outline btn-sm" style={{ marginTop: "10px" }}>
              Eliminar y elegir otra
            </button>
          </div>
        )}

        {error && <div className="alert alert-error" style={{ marginTop: "12px" }}>{error}</div>}

        {preview && (
          <button className="btn btn-primary" style={{ width: "100%", marginTop: "16px" }} onClick={analyze} disabled={analyzing}>
            {analyzing ? "🔄 Analizando con IA..." : "🔬 Analizar Imagen"}
          </button>
        )}
      </div>

      <div className="card" style={{ padding: "24px" }}>
        <h3 style={{ margin: "0 0 16px" }}>💡 Consejos para una buena foto</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          {[
            ["📷", "Encuadra bien la zona afectada", "Que la humedad ocupe al menos el 50% de la imagen."],
            ["💡", "Buena iluminación", "Evita sombras. Si puedes, usa flash o luz natural lateral."],
            ["📏", "Incluye referencia de escala", "Si puedes, pon una mano o un objeto conocido en la foto."],
            ["🔍", "Foto nítida y enfocada", "Sin movimiento. Desde 30-50 cm de distancia."],
          ].map(([ic, tit, desc]) => (
            <div key={tit} style={{ display: "flex", gap: "10px" }}>
              <span style={{ fontSize: "22px", flexShrink: 0 }}>{ic}</span>
              <div>
                <strong style={{ fontSize: "13px" }}>{tit}</strong>
                <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#6b7280" }}>{desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: "20px", padding: "12px", background: "#fef3c7", borderRadius: "8px" }}>
          <p style={{ margin: 0, fontSize: "12px", color: "#92400e" }}>
            <strong>⚠️ Nota:</strong> El análisis por IA es orientativo. Para un diagnóstico definitivo consulta con un profesional.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Modo cuestionario ─────────────────────────────────────────────────────────
function ModoCuestionario({ onResult }) {
  const [paso, setPaso] = useState(1);
  const [respuestas, setRespuestas] = useState({ zona: "", sintomas: [], posicion_muro: "", empeora_lluvia: "" });
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  const TOTAL_PASOS = 4;

  const seleccionarSintoma = (id) => {
    setRespuestas((r) => ({
      ...r,
      sintomas: r.sintomas.includes(id) ? r.sintomas.filter((s) => s !== id) : [...r.sintomas, id],
    }));
  };

  const puedeAvanzar = () => {
    if (paso === 1) return !!respuestas.zona;
    if (paso === 2) return respuestas.sintomas.length > 0;
    if (paso === 3) return !!respuestas.posicion_muro;
    if (paso === 4) return !!respuestas.empeora_lluvia;
    return false;
  };

  const enviar = async () => {
    setEnviando(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/api/diagnostico`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(respuestas),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail || "Error en el diagnóstico");
      }
      onResult(await res.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  };

  // Barra de progreso
  const ProgressBar = () => (
    <div style={{ marginBottom: "24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "#6b7280", marginBottom: "6px" }}>
        <span>Pregunta {paso} de {TOTAL_PASOS}</span>
        <span>{Math.round((paso / TOTAL_PASOS) * 100)}% completado</span>
      </div>
      <div style={{ height: "6px", background: "#e5e7eb", borderRadius: "3px", overflow: "hidden" }}>
        <div style={{
          height: "100%", background: "#1e3a5f", borderRadius: "3px",
          width: `${(paso / TOTAL_PASOS) * 100}%`, transition: "width 0.4s ease",
        }} />
      </div>
    </div>
  );

  const OpcionBtn = ({ id, label, icono, selected, onClick }) => (
    <button
      onClick={() => onClick(id)}
      style={{
        display: "flex", alignItems: "center", gap: "10px",
        padding: "12px 16px", borderRadius: "8px", cursor: "pointer",
        border: `2px solid ${selected ? "#1e3a5f" : "#e5e7eb"}`,
        background: selected ? "#eff6ff" : "#fff",
        color: selected ? "#1e3a5f" : "#374151",
        fontWeight: selected ? 600 : 400,
        fontSize: "14px", textAlign: "left", width: "100%",
        transition: "all 0.15s",
      }}
    >
      <span style={{ fontSize: "20px" }}>{icono}</span>
      {label}
      {selected && <span style={{ marginLeft: "auto", color: "#1e3a5f" }}>✓</span>}
    </button>
  );

  return (
    <div className="card" style={{ padding: "28px", maxWidth: "600px", margin: "0 auto" }}>
      <ProgressBar />

      {/* PASO 1 — Zona */}
      {paso === 1 && (
        <div>
          <h3 style={{ margin: "0 0 6px" }}>¿Dónde aparece la humedad?</h3>
          <p style={{ margin: "0 0 16px", fontSize: "14px", color: "#6b7280" }}>Selecciona la zona más afectada.</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {ZONAS.map((z) => (
              <OpcionBtn key={z.id} {...z} selected={respuestas.zona === z.id}
                onClick={(id) => setRespuestas((r) => ({ ...r, zona: id }))} />
            ))}
          </div>
        </div>
      )}

      {/* PASO 2 — Síntomas */}
      {paso === 2 && (
        <div>
          <h3 style={{ margin: "0 0 6px" }}>¿Qué síntomas observas?</h3>
          <p style={{ margin: "0 0 16px", fontSize: "14px", color: "#6b7280" }}>Puedes seleccionar varios.</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {SINTOMAS.map((s) => (
              <OpcionBtn key={s.id} {...s} selected={respuestas.sintomas.includes(s.id)}
                onClick={seleccionarSintoma} />
            ))}
          </div>
          {respuestas.sintomas.length > 0 && (
            <p style={{ fontSize: "12px", color: "#059669", marginTop: "8px" }}>
              ✓ {respuestas.sintomas.length} síntoma{respuestas.sintomas.length > 1 ? "s" : ""} seleccionado{respuestas.sintomas.length > 1 ? "s" : ""}
            </p>
          )}
        </div>
      )}

      {/* PASO 3 — Posición */}
      {paso === 3 && (
        <div>
          <h3 style={{ margin: "0 0 6px" }}>¿En qué parte del muro o superficie?</h3>
          <p style={{ margin: "0 0 16px", fontSize: "14px", color: "#6b7280" }}>¿Dónde exactamente está el problema?</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {POSICIONES.map((p) => (
              <OpcionBtn key={p.id} {...p} selected={respuestas.posicion_muro === p.id}
                onClick={(id) => setRespuestas((r) => ({ ...r, posicion_muro: id }))} />
            ))}
          </div>
        </div>
      )}

      {/* PASO 4 — Lluvia */}
      {paso === 4 && (
        <div>
          <h3 style={{ margin: "0 0 6px" }}>¿Empeora o aparece cuando llueve?</h3>
          <p style={{ margin: "0 0 16px", fontSize: "14px", color: "#6b7280" }}>
            Esto ayuda a distinguir entre filtración y condensación o capilaridad.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {LLUVIA_OPS.map((o) => (
              <OpcionBtn key={o.id} {...o} selected={respuestas.empeora_lluvia === o.id}
                onClick={(id) => setRespuestas((r) => ({ ...r, empeora_lluvia: id }))} />
            ))}
          </div>
        </div>
      )}

      {error && <div className="alert alert-error" style={{ marginTop: "16px" }}>{error}</div>}

      {/* Navegación */}
      <div style={{ display: "flex", gap: "12px", marginTop: "24px" }}>
        {paso > 1 && (
          <button className="btn btn-outline" onClick={() => setPaso((p) => p - 1)} style={{ flex: 1 }}>
            ← Anterior
          </button>
        )}
        {paso < TOTAL_PASOS ? (
          <button
            className="btn btn-primary"
            style={{ flex: 1 }}
            onClick={() => setPaso((p) => p + 1)}
            disabled={!puedeAvanzar()}
          >
            Siguiente →
          </button>
        ) : (
          <button
            className="btn btn-primary"
            style={{ flex: 1 }}
            onClick={enviar}
            disabled={!puedeAvanzar() || enviando}
          >
            {enviando ? "🔄 Analizando..." : "🔬 Ver mi diagnóstico"}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Página principal ───────────────────────────────────────────────────────────
export default function Analysis() {
  const router = useRouter();
  const [modo, setModo] = useState("cuestionario"); // "foto" | "cuestionario"
  const [result, setResult] = useState(null);
  const [cartCount, setCartCount] = useState(0);

  useEffect(() => {
    fetchCartCount().then(setCartCount);
  }, []);

  const addToCart = async (productId) => {
    if (!isLoggedIn()) { router.push("/auth"); return; }
    const res = await apiFetch("/api/carrito", {
      method: "POST",
      body: JSON.stringify({ producto_id: productId, cantidad: 1 }),
    });
    if (res.ok) {
      fetchCartCount().then(setCartCount);
      alert("Producto añadido al carrito");
    }
  };

  const reset = () => setResult(null);

  return (
    <>
      <header className="header">
        <div className="container header-inner">
          <Link href="/" className="logo">No<span>+</span>Humedades</Link>
          <nav className="nav">
            <Link href="/">Inicio</Link>
            <Link href="/catalog">Catálogo</Link>
            <Link href="/analysis" style={{ color: "var(--primary)", fontWeight: 600 }}>Diagnóstico</Link>
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

        {/* Hero */}
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <h1 style={{ fontSize: "clamp(24px, 4vw, 36px)", margin: "0 0 12px" }}>
            🔬 Diagnóstico de Humedades
          </h1>
          <p style={{ color: "#6b7280", fontSize: "16px", maxWidth: "540px", margin: "0 auto" }}>
            Descubre qué tipo de humedad tienes y qué productos necesitas para solucionarlo.
            Sin registro. Completamente gratuito.
          </p>
        </div>

        {!result ? (
          <>
            {/* Selector de modo */}
            <div style={{
              display: "flex", justifyContent: "center", gap: "0",
              marginBottom: "28px", border: "2px solid #e5e7eb",
              borderRadius: "10px", overflow: "hidden", maxWidth: "480px", margin: "0 auto 28px",
            }}>
              {[
                { id: "cuestionario", label: "❓ Por preguntas", desc: "Sin foto · 1 min" },
                { id: "foto",         label: "📸 Por foto con IA", desc: "Sube una imagen" },
              ].map((m) => (
                <button
                  key={m.id}
                  onClick={() => setModo(m.id)}
                  style={{
                    flex: 1, padding: "14px 12px", border: "none", cursor: "pointer",
                    background: modo === m.id ? "#1e3a5f" : "#fff",
                    color: modo === m.id ? "#fff" : "#374151",
                    display: "flex", flexDirection: "column", alignItems: "center", gap: "2px",
                    transition: "all 0.2s",
                  }}
                >
                  <span style={{ fontWeight: 600, fontSize: "14px" }}>{m.label}</span>
                  <span style={{ fontSize: "11px", opacity: 0.7 }}>{m.desc}</span>
                </button>
              ))}
            </div>

            {modo === "foto"
              ? <ModoFoto onResult={setResult} />
              : <ModoCuestionario onResult={setResult} />}

            {/* Tipos de humedad — referencia informativa */}
            <div style={{ marginTop: "48px" }}>
              <h2 style={{ textAlign: "center", fontSize: "20px", marginBottom: "20px" }}>
                ¿No sabes qué tipo de humedad tienes?
              </h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "16px" }}>
                {[
                  {
                    tipo: "condensacion",
                    titulo: "💧 Condensación",
                    cuando: "Aparece en invierno, en ventanas y paredes frías",
                    donde: "Paredes interiores, baños, cocinas, dormitorios",
                    clave: "No empeora con la lluvia. Aparece con el frío.",
                  },
                  {
                    tipo: "capilaridad",
                    titulo: "📈 Capilaridad",
                    cuando: "Presente todo el año, más en épocas lluviosas",
                    donde: "Base de paredes, sótanos, muros en contacto con el suelo",
                    clave: "Salitre blanco en la base. Independiente de la lluvia.",
                  },
                  {
                    tipo: "filtracion",
                    titulo: "🔍 Filtración",
                    cuando: "Aparece o empeora claramente cuando llueve",
                    donde: "Fachadas, terrazas, cubiertas, zonas con grietas",
                    clave: "Relación directa con la lluvia o el agua exterior.",
                  },
                ].map((t) => {
                  const col = TIPO_COLORES[t.tipo];
                  return (
                    <div
                      key={t.tipo}
                      className="card"
                      style={{ padding: "20px", borderTop: `4px solid ${col.color}` }}
                    >
                      <h3 style={{ margin: "0 0 10px", color: col.color }}>{t.titulo}</h3>
                      <div style={{ fontSize: "13px", display: "flex", flexDirection: "column", gap: "6px" }}>
                        <p style={{ margin: 0 }}><strong>Cuándo:</strong> {t.cuando}</p>
                        <p style={{ margin: 0 }}><strong>Dónde:</strong> {t.donde}</p>
                        <p style={{ margin: "6px 0 0", padding: "8px 10px", background: col.bg, borderRadius: "6px", color: col.color, fontWeight: 500 }}>
                          🔑 {t.clave}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        ) : (
          <ResultadoPanel
            result={result}
            cartCount={cartCount}
            onAddToCart={addToCart}
            onReset={reset}
            origen={result.origen}
          />
        )}
      </main>

      <footer className="footer">
        <div className="container">
          <div className="footer-bottom">
            © 2025 NomasHumedades · Cádiz. Todos los derechos reservados.
          </div>
        </div>
      </footer>
    </>
  );
}
