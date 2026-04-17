/**
 * Utilidades de autenticación y llamadas a la API.
 * Centraliza la gestión del token JWT para todos los componentes.
 */

export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ── Token ─────────────────────────────────────────────────────────────────────

export function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
}

export function getAuthHeaders() {
  const token = getToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

export function isLoggedIn() {
  return !!getToken();
}

export function isAdmin() {
  if (typeof window === "undefined") return false;
  return localStorage.getItem("user_rol") === "admin";
}

export function getUserName() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("user_nombre") || "";
}

// ── Sesión ────────────────────────────────────────────────────────────────────

export function saveSession(data) {
  localStorage.setItem("token", data.access_token);
  localStorage.setItem("user_email", data.email || "");
  localStorage.setItem("user_rol", data.rol || "user");
  localStorage.setItem("user_nombre", data.nombre || "");
}

export function clearSession() {
  localStorage.removeItem("token");
  localStorage.removeItem("user_email");
  localStorage.removeItem("user_rol");
  localStorage.removeItem("user_nombre");
}

// ── Helpers de fetch ──────────────────────────────────────────────────────────

export async function apiFetch(path, options = {}) {
  // Si el body es FormData, NO poner Content-Type (el navegador lo pone con el boundary correcto)
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
  const headers = {
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...getAuthHeaders(),
    ...(options.headers || {}),
  };
  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  return res;
}

/** Carga el número de artículos del carrito (requiere token). */
export async function fetchCartCount() {
  if (!isLoggedIn()) return 0;
  try {
    const res = await apiFetch("/api/carrito");
    if (!res.ok) return 0;
    const data = await res.json();
    return data.items?.reduce((sum, item) => sum + item.cantidad, 0) || 0;
  } catch {
    return 0;
  }
}
