import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "./lib/auth/constants";

/**
 * Filtro rápido: sin cookie de sesión no se entra a rutas privadas.
 * La validación real (sesión vigente, usuario activo, rol) se hace en el servidor
 * en cada layout/página/acción.
 */
export function proxy(request: NextRequest) {
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();
  const url = request.nextUrl.clone();
  const next = request.nextUrl.pathname + request.nextUrl.search;
  url.pathname = "/login";
  url.search = next && next !== "/" ? `?next=${encodeURIComponent(next)}` : "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!login|_next/static|_next/image|favicon.ico|api/health).*)"],
};
