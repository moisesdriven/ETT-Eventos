import { csvResponse, requireExport, toCsv, usd } from "@/lib/csv";
import { windowDays } from "@/lib/dates";
import { listEventSummaries } from "@/lib/events";
import { getLocation } from "@/lib/location";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireExport("eventos");
  if (user instanceof Response) return user;
  const location = await getLocation();
  if (!location) return new Response("Sin datos", { status: 404 });
  const events = await listEventSummaries(location.id);
  return csvResponse(
    "eventos",
    toCsv(
      ["evento", "etiquetas", "inicio", "fin", "numeros", "contactos_con_etiqueta", "contactos_con_gasto", "conversaciones", "marketing_cant", "marketing_usd", "utilidad_cant", "utilidad_usd", "servicio_cant", "servicio_usd", "total_usd", "costo_por_contacto_usd", "presupuesto_usd"],
      events.map((e) => {
        const w = windowDays(e.startsAt, e.endsAt);
        return [
          e.name,
          e.tags.join(" | "),
          w.from,
          w.to,
          e.numeros.join(" | "),
          e.contactosEtiqueta,
          e.contactosConGasto,
          e.conversaciones,
          e.marketingN,
          usd(e.marketingUsd),
          e.utilityN,
          usd(e.utilityUsd),
          e.serviceN,
          usd(e.serviceUsd),
          usd(e.totalUsd),
          e.contactosConGasto ? (Number(e.totalUsd) / e.contactosConGasto).toFixed(4) : "",
          e.budgetUsd ?? "",
        ];
      }),
    ),
  );
}
