import { getTimeSeries } from "@/lib/analytics";
import { csvResponse, requireExport, toCsv, usd } from "@/lib/csv";
import { parseFilters } from "@/lib/filters";
import { getLocation } from "@/lib/location";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const user = await requireExport("dashboard", params);
  if (user instanceof Response) return user;
  const location = await getLocation();
  if (!location) return new Response("Sin datos", { status: 404 });
  const sp = new URL(request.url).searchParams;
  const f = parseFilters({ ...params, cat: sp.getAll("cat") });
  const series = await getTimeSeries(location.id, f);
  const rows = series.map((p) => [
    p.bucket,
    p.marketing.n,
    usd(p.marketing.usd),
    p.utility.n,
    usd(p.utility.usd),
    p.service.n,
    usd(p.service.usd),
    p.marketing.n + p.utility.n + p.service.n,
    usd(p.marketing.usd + p.utility.usd + p.service.usd),
  ]);
  return csvResponse(
    "gasto-whatsapp",
    toCsv(
      [f.granularity === "mes" ? "mes" : "dia_lima", "marketing_cant", "marketing_usd", "utilidad_cant", "utilidad_usd", "servicio_cant", "servicio_usd", "total_cant", "total_usd"],
      rows,
    ),
  );
}
