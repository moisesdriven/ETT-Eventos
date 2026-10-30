/** En producción (HTTPS) el prefijo __Host- impide que un subdominio fije la cookie. */
export const SESSION_COOKIE = process.env.NODE_ENV === "production" ? "__Host-ett_session" : "ett_session";
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
export const SESSION_REFRESH_AFTER_MS = 60 * 60 * 1000;
