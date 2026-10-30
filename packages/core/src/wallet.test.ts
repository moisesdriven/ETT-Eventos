import { describe, expect, it } from "vitest";
import { parseSettlementTime, parseWalletTransaction, toChargeAmount } from "./wallet";

describe("parseSettlementTime", () => {
  it("interpreta en UTC el formato sin zona", () => {
    expect(parseSettlementTime("2026-10-09 02:13:44.120").toISOString()).toBe("2026-10-09T02:13:44.120Z");
  });
  it("respeta el formato ISO con Z", () => {
    expect(parseSettlementTime("2026-10-30T03:32:52.353Z").toISOString()).toBe("2026-10-30T03:32:52.353Z");
  });
  it("rechaza fechas inválidas", () => {
    expect(() => parseSettlementTime("ayer")).toThrow();
  });
});

describe("toChargeAmount", () => {
  it("convierte cargos negativos a positivo con 6 decimales", () => {
    expect(toChargeAmount(-0.0703)).toBe("0.070300");
    expect(toChargeAmount(-0.0113)).toBe("0.011300");
    expect(toChargeAmount(0)).toBe("0.000000");
    expect(toChargeAmount("-0.03")).toBe("0.030000");
  });
});

describe("parseWalletTransaction", () => {
  const base = { id: "6ae40fe3c36d70d47382f13f", amount: -0.0703, settlementTime: "2026-10-09 02:13:44.120" };

  it("extrae categoría, monto y wamid", () => {
    expect(parseWalletTransaction({ ...base, description: "whatsapp_marketing_message ref: wamid.HBgLNTE5=" })).toEqual({
      externalId: base.id,
      chargeType: "whatsapp_marketing_message",
      category: "marketing",
      amountUsd: "0.070300",
      settledAt: new Date("2026-10-09T02:13:44.120Z"),
      messageRef: "wamid.HBgLNTE5=",
    });
  });

  it.each([
    ["whatsapp_utility_message ref: wamid.A", "utility"],
    ["whatsapp_service_message ref: wamid.A", "service"],
    ["whatsapp_inbound_message ref: wamid.A", "inbound"],
    ["whatsapp_free_entry_point_message ref: wamid.A", "free_entry_point"],
    ["whatsapp_algo_nuevo ref: wamid.A", "other"],
  ])("%s → %s", (description, category) => {
    expect(parseWalletTransaction({ ...base, description })?.category).toBe(category);
  });

  it("ignora transacciones que no son de WhatsApp", () => {
    expect(parseWalletTransaction({ ...base, description: "Email ref: abc" })).toBeNull();
    expect(parseWalletTransaction({ ...base, description: "Wallet recharge" })).toBeNull();
    expect(parseWalletTransaction({ ...base, description: null })).toBeNull();
  });

  it("acepta cobros sin referencia", () => {
    expect(parseWalletTransaction({ ...base, description: "whatsapp_service_message" })?.messageRef).toBeNull();
  });
});
