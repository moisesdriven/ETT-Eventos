import "server-only";
import { isIP } from "node:net";
import { headers } from "next/headers";

/** IP del cliente. Detrás de Traefik, el primer valor de X-Forwarded-For es el cliente. */
export async function getClientIp(): Promise<string | null> {
  const h = await headers();
  const candidate = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim();
  return candidate && isIP(candidate) ? candidate : null;
}

export async function getUserAgent(): Promise<string | null> {
  return (await headers()).get("user-agent")?.slice(0, 500) ?? null;
}
