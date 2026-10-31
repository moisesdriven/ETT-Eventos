/**
 * Atribución de cobros a eventos (etiquetas marcadas como evento).
 *
 * Un cobro es elegible para un evento si:
 *  1. ocurrió dentro de la ventana [startsAt, endsAt) del evento, y
 *  2. el contacto tenía alguna de sus etiquetas en ese momento.
 *
 * GHL no informa cuándo se aplicó una etiqueta, así que (2) se decide con la
 * evidencia disponible:
 *  - historial (webhook o comparación de fotos): si se sabe que la etiqueta NO
 *    estaba antes del cobro, o que ya se había quitado, el cobro no es elegible;
 *  - sin historial: basta con que el contacto tenga hoy la etiqueta (base "ventana").
 *
 * Si hay varios eventos elegibles, el monto se reparte en partes iguales y el
 * residuo de micro-dólares se asigna de forma determinista, para que la suma
 * cuadre exactamente con el cobro. Sin eventos elegibles → Orgánico / Sin campaña.
 */

export type AttributionBasis = "historial_etiqueta" | "ventana";

export interface EventWindow {
  id: string;
  startsAt: Date;
  endsAt: Date;
  /** Etiquetas normalizadas (minúsculas). */
  tags: string[];
}

export interface TagEvidence {
  tag: string;
  /** Momento en que se vio la etiqueta presente por primera vez (o exacto si viene de webhook). */
  addedAt: Date | null;
  /** Último momento en que se sabe que NO estaba (cota inferior del alta). */
  addedAfter: Date | null;
  /** Momento en que se vio ausente por primera vez tras haberla tenido. */
  removedAt: Date | null;
  /** Último momento en que se sabe que SÍ estaba (cota inferior de la baja). */
  removedAfter: Date | null;
}

export interface ChargeForAttribution {
  id: number;
  settledAt: Date;
  amountUsd: string;
}

export interface AttributionRow {
  chargeId: number;
  eventId: string;
  share: string;
  amountUsd: string;
  basis: AttributionBasis;
}

type TagStatus = { eligible: false } | { eligible: true; basis: AttributionBasis };

/** ¿El contacto tenía `tag` en el instante `at`? */
export function tagStatusAt(tag: string, at: Date, currentTags: ReadonlySet<string>, history: readonly TagEvidence[]): TagStatus {
  const t = at.getTime();
  const rows = history.filter((h) => h.tag === tag);
  if (rows.length === 0) return currentTags.has(tag) ? { eligible: true, basis: "ventana" } : { eligible: false };

  for (const h of rows) {
    // Se sabe que todavía no la tenía en el momento del cobro.
    const absentUntil = h.addedAfter?.getTime();
    if (absentUntil !== undefined && t < absentUntil) continue;
    // Se sabe que ya se la habían quitado.
    if (h.removedAt && t >= h.removedAt.getTime()) continue;
    // En los tramos sin certeza (entre dos fotos) se incluye, pero con base "ventana".
    const afterAdd = h.addedAt !== null && t >= h.addedAt.getTime();
    const beforeRemoval = !h.removedAt || (h.removedAfter !== null && t < h.removedAfter.getTime());
    return { eligible: true, basis: afterAdd && beforeRemoval ? "historial_etiqueta" : "ventana" };
  }
  return { eligible: false };
}

const toMicros = (usd: string) => Math.round(Number(usd) * 1e6);
const fromMicros = (micros: number) => (micros / 1e6).toFixed(6);

export function attributeCharge(
  charge: ChargeForAttribution,
  events: readonly EventWindow[],
  currentTags: ReadonlySet<string>,
  history: readonly TagEvidence[],
): AttributionRow[] {
  const t = charge.settledAt.getTime();
  const eligible: { event: EventWindow; basis: AttributionBasis }[] = [];

  for (const event of events) {
    if (t < event.startsAt.getTime() || t >= event.endsAt.getTime()) continue;
    let best: TagStatus = { eligible: false };
    for (const tag of event.tags) {
      const status = tagStatusAt(tag, charge.settledAt, currentTags, history);
      if (status.eligible && (!best.eligible || status.basis === "historial_etiqueta")) best = status;
    }
    if (best.eligible) eligible.push({ event, basis: best.basis });
  }
  if (eligible.length === 0) return [];

  // Orden determinista: inicio más antiguo primero, luego id.
  eligible.sort((a, b) => a.event.startsAt.getTime() - b.event.startsAt.getTime() || a.event.id.localeCompare(b.event.id));

  const n = eligible.length;
  const total = toMicros(charge.amountUsd);
  const base = Math.floor(total / n);
  let remainder = total - base * n;
  const share = (1 / n).toFixed(6);

  return eligible.map(({ event, basis }) => {
    const extra = remainder > 0 ? 1 : 0;
    remainder -= extra;
    return { chargeId: charge.id, eventId: event.id, share, amountUsd: fromMicros(base + extra), basis };
  });
}
