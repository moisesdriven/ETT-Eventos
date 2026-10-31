import { describe, expect, it } from "vitest";
import { defaultEventWindow, parseEventTag, suggestActiveRange } from "./tags";
import { addDays } from "./time";

describe("parseEventTag", () => {
  it.each([
    ["AEC03-EV01-WSI-07.01.26", "2026-01-07", ["aec03", "ev01", "wsi"]],
    ["men03-lci-08.10.26", "2026-10-08", ["men03", "lci"]],
    ["iatt-ev03-wci-21.02.26", "2026-02-21", ["iatt", "ev03", "wci"]],
    ["min04-ev01-wp-07.02.26", "2026-02-07", ["min04", "ev01", "wp"]],
    ["pci01-wci-31.08.26", "2026-08-31", ["pci01", "wci"]],
  ])("lee %s", (tag, startDay, codeParts) => {
    expect(parseEventTag(tag)).toEqual({ startDay, codeParts });
  });

  it.each(["ett", "quiero", "wa: +51918891333", "evento-31.02.26", "x-1.2.26"])("ignora %s", (tag) => {
    expect(parseEventTag(tag)).toBeNull();
  });
});

describe("defaultEventWindow", () => {
  it("dura 14 días desde la fecha de la etiqueta", () => {
    expect(defaultEventWindow("2026-10-08")).toEqual({ startDay: "2026-10-08", endDayExclusive: "2026-10-22" });
  });
});

describe("suggestActiveRange", () => {
  /** Serie diaria completa a partir de días con peso. */
  const serie = (from: string, to: string, pesos: Record<string, number>) => {
    const out: { day: string; weight: number }[] = [];
    for (let d = from; d <= to; d = addDays(d, 1)) out.push({ day: d, weight: pesos[d] ?? 0 });
    return out;
  };

  it("aísla el bloque del evento e ignora un evento anterior de los mismos contactos", () => {
    const days = serie("2026-07-25", "2026-10-10", {
      "2026-08-01": 300, "2026-08-02": 200, "2026-08-05": 50, // evento de agosto (rej05)
      "2026-09-08": 10, "2026-09-10": 120, "2026-09-12": 400, "2026-09-13": 150, "2026-09-18": 30, "2026-09-24": 2,
    });
    // 09-08 (10 envíos) y 09-18/09-24 quedan fuera del 90 %; el evento de agosto no entra.
    expect(suggestActiveRange(days, { anchor: "2026-09-12" })).toEqual({ from: "2026-09-10", to: "2026-09-13" });
  });

  it("recorta mensajes sueltos de los extremos dentro del bloque", () => {
    const days = serie("2026-10-01", "2026-10-20", { "2026-10-01": 1, "2026-10-04": 100, "2026-10-06": 500, "2026-10-08": 100, "2026-10-12": 1 });
    expect(suggestActiveRange(days, { anchor: "2026-10-06" })).toEqual({ from: "2026-10-04", to: "2026-10-08" });
  });

  it("sin fecha de referencia usa el día de más actividad", () => {
    const days = serie("2026-01-01", "2026-03-01", { "2026-01-05": 10, "2026-02-10": 90, "2026-02-11": 90 });
    expect(suggestActiveRange(days)).toEqual({ from: "2026-02-10", to: "2026-02-11" });
  });

  it("sin actividad no sugiere nada", () => {
    expect(suggestActiveRange([])).toBeNull();
    expect(suggestActiveRange(serie("2026-10-01", "2026-10-03", {}))).toBeNull();
  });

  it("recorta al máximo de días permitido", () => {
    const pesos: Record<string, number> = {};
    for (let d = "2026-01-01"; d <= "2026-06-30"; d = addDays(d, 1)) pesos[d] = 5;
    expect(suggestActiveRange(serie("2026-01-01", "2026-06-30", pesos), { coverage: 1, maxDays: 30 })).toEqual({ from: "2026-01-01", to: "2026-01-30" });
  });
});
