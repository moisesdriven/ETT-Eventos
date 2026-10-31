import { describe, expect, it } from "vitest";
import { attributeCharge, type EventWindow, type TagEvidence } from "./attribution";

const d = (iso: string) => new Date(iso);
const ev = (id: string, start: string, end: string, tags: string[]): EventWindow => ({ id, startsAt: d(start), endsAt: d(end), tags });

const MEN03 = ev("men03", "2026-10-08T05:00:00Z", "2026-10-22T05:00:00Z", ["men03-lci-08.10.26"]);
const DEE15 = ev("dee15", "2026-10-15T05:00:00Z", "2026-10-29T05:00:00Z", ["dee15-ev01-lci-23.07.26", "dee15-extra"]);
const charge = (settledAt: string, amountUsd = "0.070300") => ({ id: 1, settledAt: d(settledAt), amountUsd });
const tags = (...t: string[]) => new Set(t);

describe("attributeCharge", () => {
  it("sin etiqueta de evento → orgánico", () => {
    expect(attributeCharge(charge("2026-10-09T12:00:00Z"), [MEN03], tags("ett"), [])).toEqual([]);
  });

  it("con etiqueta pero fuera de la ventana → orgánico", () => {
    expect(attributeCharge(charge("2026-10-22T05:00:00Z"), [MEN03], tags("men03-lci-08.10.26"), [])).toEqual([]);
    expect(attributeCharge(charge("2026-10-08T04:59:59.999Z"), [MEN03], tags("men03-lci-08.10.26"), [])).toEqual([]);
  });

  it("con etiqueta y dentro de la ventana → 100 % al evento (base ventana)", () => {
    expect(attributeCharge(charge("2026-10-08T05:00:00Z"), [MEN03], tags("men03-lci-08.10.26"), [])).toEqual([
      { chargeId: 1, eventId: "men03", share: "1.000000", amountUsd: "0.070300", basis: "ventana" },
    ]);
  });

  it("dos eventos elegibles → reparto exacto al micro-dólar", () => {
    const rows = attributeCharge(charge("2026-10-16T00:00:00Z", "0.070301"), [DEE15, MEN03], tags("men03-lci-08.10.26", "dee15-extra"), []);
    expect(rows.map((r) => [r.eventId, r.amountUsd, r.share])).toEqual([
      ["men03", "0.035151", "0.500000"],
      ["dee15", "0.035150", "0.500000"],
    ]);
    const sum = rows.reduce((acc, r) => acc + Math.round(Number(r.amountUsd) * 1e6), 0);
    expect(sum).toBe(70301);
  });

  it("tres eventos: la suma cuadra con el cobro", () => {
    const a = ev("a", "2026-10-01T05:00:00Z", "2026-10-15T05:00:00Z", ["x"]);
    const b = ev("b", "2026-10-02T05:00:00Z", "2026-10-16T05:00:00Z", ["y"]);
    const c = ev("c", "2026-10-03T05:00:00Z", "2026-10-17T05:00:00Z", ["z"]);
    const rows = attributeCharge(charge("2026-10-05T00:00:00Z", "0.010000"), [c, b, a], tags("x", "y", "z"), []);
    expect(rows.map((r) => r.eventId)).toEqual(["a", "b", "c"]);
    expect(rows.reduce((acc, r) => acc + Math.round(Number(r.amountUsd) * 1e6), 0)).toBe(10000);
  });

  describe("con historial de etiquetas", () => {
    const tag = "men03-lci-08.10.26";
    const evidence = (e: Partial<TagEvidence>): TagEvidence => ({ tag, addedAt: null, addedAfter: null, removedAt: null, removedAfter: null, ...e });

    it("si se sabe que la etiqueta llegó después del cobro → no elegible", () => {
      const h = [evidence({ addedAfter: d("2026-10-12T00:00:00Z"), addedAt: d("2026-10-12T00:15:00Z") })];
      expect(attributeCharge(charge("2026-10-10T00:00:00Z"), [MEN03], tags(tag), h)).toEqual([]);
    });

    it("cobro posterior al alta confirmada → base historial", () => {
      const h = [evidence({ addedAfter: d("2026-10-09T00:00:00Z"), addedAt: d("2026-10-09T00:00:05Z") })];
      expect(attributeCharge(charge("2026-10-10T00:00:00Z"), [MEN03], tags(tag), h)[0]?.basis).toBe("historial_etiqueta");
    });

    it("cobro en el tramo incierto entre dos fotos → elegible con base ventana", () => {
      const h = [evidence({ addedAfter: d("2026-10-09T00:00:00Z"), addedAt: d("2026-10-11T00:00:00Z") })];
      expect(attributeCharge(charge("2026-10-10T00:00:00Z"), [MEN03], tags(tag), h)[0]?.basis).toBe("ventana");
    });

    it("cobro después de quitar la etiqueta → no elegible, aunque hoy no la tenga", () => {
      const h = [evidence({ addedAt: d("2026-10-08T06:00:00Z"), removedAfter: d("2026-10-10T00:00:00Z"), removedAt: d("2026-10-10T01:00:00Z") })];
      expect(attributeCharge(charge("2026-10-11T00:00:00Z"), [MEN03], tags(), h)).toEqual([]);
      // Antes de quitarla sí correspondía al evento.
      expect(attributeCharge(charge("2026-10-09T00:00:00Z"), [MEN03], tags(), h)[0]?.basis).toBe("historial_etiqueta");
    });
  });
});
