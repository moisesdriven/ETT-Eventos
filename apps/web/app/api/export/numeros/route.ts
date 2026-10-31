import { getByPhone } from "@/lib/analytics";
import { csvResponse, requireExport, toCsv, usd } from "@/lib/csv";
import { parseFilters } from "@/lib/filters";
import { getLocation } from "@/lib/location";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  const params = Object.fromEntries(sp);
  const user = await requireExport("numeros", params);
  if (user instanceof Response) return user;
  const location = await getLocation();
  if (!location) return new Response("Sin datos", { status: 404 });
  const f = { ...parseFilters({ ...params, cat: sp.getAll("cat") }), phoneId: null };
  const phones = await getByPhone(location.id, f);
  return csvResponse(
    "numeros-whatsapp",
    toCsv(
      ["numero", "nombre", "desde", "hasta", "marketing_cant", "marketing_usd", "utilidad_cant", "utilidad_usd", "servicio_cant", "servicio_usd", "total_usd", "contactos", "conversaciones", "eventos", "costo_por_contacto_usd"],
      phones.map((p) => [
        p.phone,
        p.label,
        f.from,
        f.to,
        p.marketing.n,
        usd(p.marketing.usd),
        p.utility.n,
        usd(p.utility.usd),
        p.service.n,
        usd(p.service.usd),
        usd(p.totalUsd),
        p.contactos,
        p.conversaciones,
        p.eventos,
        p.contactos ? (p.totalUsd / p.contactos).toFixed(4) : "",
      ]),
    ),
  );
}
