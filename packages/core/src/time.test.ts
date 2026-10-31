import { describe, expect, it } from "vitest";
import { addDays, limaDayRange, limaRange, monthBounds, resolveDatePreset, toLimaDay } from "./time";

describe("hora de Lima", () => {
  it("un día de Lima va de 05:00Z a 05:00Z del día siguiente", () => {
    const { start, end } = limaDayRange("2026-10-08");
    expect(start.toISOString()).toBe("2026-10-08T05:00:00.000Z");
    expect(end.toISOString()).toBe("2026-10-09T05:00:00.000Z");
  });

  it("asigna al día correcto los instantes cerca de medianoche", () => {
    expect(toLimaDay(new Date("2026-10-09T04:59:59.999Z"))).toBe("2026-10-08");
    expect(toLimaDay(new Date("2026-10-09T05:00:00.000Z"))).toBe("2026-10-09");
  });

  it("rango inclusivo de días → rango UTC semiabierto", () => {
    const { start, end } = limaRange("2026-01-01", "2026-01-31");
    expect(start.toISOString()).toBe("2026-01-01T05:00:00.000Z");
    expect(end.toISOString()).toBe("2026-02-01T05:00:00.000Z");
    expect(() => limaRange("2026-02-01", "2026-01-01")).toThrow();
  });

  it("límites de mes, incluido febrero bisiesto", () => {
    expect(monthBounds(2028, 2)).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(monthBounds(2026, 12)).toEqual({ from: "2026-12-01", to: "2026-12-31" });
  });

  it("suma días cruzando fin de año", () => {
    expect(addDays("2026-12-25", 14)).toBe("2027-01-08");
  });

  it("presets relativos a la hora de Lima, no a UTC", () => {
    // 2026-03-01 02:00Z todavía es 28 de febrero en Lima
    const now = new Date("2026-03-01T02:00:00Z");
    expect(resolveDatePreset("hoy", now)).toEqual({ from: "2026-02-28", to: "2026-02-28" });
    expect(resolveDatePreset("ayer", now)).toEqual({ from: "2026-02-27", to: "2026-02-27" });
    expect(resolveDatePreset("ultimos-7-dias", now)).toEqual({ from: "2026-02-22", to: "2026-02-28" });
    expect(resolveDatePreset("este-mes", now)).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(resolveDatePreset("mes-pasado", now)).toEqual({ from: "2026-01-01", to: "2026-01-31" });
    expect(resolveDatePreset("mes-pasado", new Date("2026-01-15T12:00:00Z"))).toEqual({ from: "2025-12-01", to: "2025-12-31" });
    expect(resolveDatePreset("este-anio", now)).toEqual({ from: "2026-01-01", to: "2026-02-28" });
  });
});
