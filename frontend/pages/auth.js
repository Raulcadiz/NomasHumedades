import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { API_URL, saveSession } from "../lib/api";

export default function Auth() {
  const router = useRouter();
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ email: "", password: "", nombre: "", telefono: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const endpoint = mode === "register" ? "/api/auth/register" : "/api/auth/login";
      const res = await fetch(`${API_URL}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || "Error en la operación");
      }

      saveSession(data);
      router.push("/");
    } catch (err) {
      setError(err.message);
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
        <div className="auth-page">
          <div className="card">
            <div className="auth-tabs">
              <button className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>
                Iniciar Sesión
              </button>
              <button className={mode === "register" ? "active" : ""} onClick={() => setMode("register")}>
                Registrarse
              </button>
            </div>

            {error && <div className="alert alert-error">{error}</div>}

            <form onSubmit={handleSubmit}>
              {mode === "register" && (
                <>
                  <div className="form-group">
                    <label>Nombre</label>
                    <input
                      type="text"
                      value={form.nombre}
                      onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Teléfono (opcional)</label>
                    <input
                      type="tel"
                      value={form.telefono}
                      onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))}
                    />
                  </div>
                </>
              )}
              <div className="form-group">
                <label>Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  required
                />
              </div>
              <div className="form-group">
                <label>Contraseña</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  required
                  minLength={6}
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                style={{ width: "100%" }}
                disabled={loading}
              >
                {loading ? "Cargando..." : mode === "login" ? "Iniciar Sesión" : "Registrarse"}
              </button>
            </form>
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
