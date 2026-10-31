/**
 * Parseo de transacciones del monedero de agencia de GHL
 * (`POST /saas/companies/{companyId}/wallet-transactions`).
 *
 * Formato verificado con datos reales de ETT (oct-2026):
 *   description: "whatsapp_service_message ref: wamid.HBgL…"
 *   amount: -0.03 (negativo = cargo)
 *   settlementTime: "2026-10-09 02:13:44.120" (UTC sin zona) o "2026-10-30T03:32:52.353Z"
 */

export const WHATSAPP_CHARGE_TYPES = {
  whatsapp_marketing_message: "marketing",
  whatsapp_utility_message: "utility",
  whatsapp_service_message: "service",
  whatsapp_authentication_message: "authentication",
  whatsapp_inbound_message: "inbound",
  whatsapp_free_entry_point_message: "free_entry_point",
} as const;

export type ChargeCategory = (typeof WHATSAPP_CHARGE_TYPES)[keyof typeof WHATSAPP_CHARGE_TYPES] | "other";

/** Categorías que se muestran como facturables en los paneles. */
export const BILLABLE_CATEGORIES = ["marketing", "utility", "service"] as const;

export const CATEGORY_LABELS: Record<ChargeCategory, string> = {
  marketing: "Marketing",
  utility: "Utilidad",
  service: "Servicio",
  authentication: "Autenticación",
  inbound: "Entrante",
  free_entry_point: "Entrada gratuita",
  other: "Otro WhatsApp",
};

export interface RawWalletTransaction {
  id: string;
  description?: string | null;
  amount: number | string;
  settlementTime: string;
  [key: string]: unknown;
}

export interface ParsedWalletCharge {
  externalId: string;
  chargeType: string;
  category: ChargeCategory;
  /** Monto del cargo en USD, positivo, con 6 decimales. */
  amountUsd: string;
  settledAt: Date;
  /** Referencia tras "ref:" (wamid de Meta). */
  messageRef: string | null;
}

/** Interpreta settlementTime en UTC, con o sin zona explícita. */
export function parseSettlementTime(value: string): Date {
  const v = value.trim();
  const iso = /[zZ]|[+-]\d{2}:?\d{2}$/.test(v) ? v.replace(" ", "T") : `${v.replace(" ", "T")}Z`;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) throw new Error(`settlementTime inválido: ${value}`);
  return date;
}

/** Convierte un monto (cargo negativo) a string positivo de 6 decimales sin errores de coma flotante. */
export function toChargeAmount(amount: number | string): string {
  const n = Math.abs(Number(amount));
  if (!Number.isFinite(n)) throw new Error(`Monto inválido: ${amount}`);
  return (Math.round(n * 1e6) / 1e6).toFixed(6);
}

/** Devuelve null si la transacción no es de WhatsApp (recargas, email, SMS, etc.). */
export function parseWalletTransaction(tx: RawWalletTransaction): ParsedWalletCharge | null {
  const description = (tx.description ?? "").trim();
  const [head = "", ...rest] = description.split(/\s+ref:\s*/i);
  const chargeType = head.trim().toLowerCase();
  if (!chargeType.startsWith("whatsapp_")) return null;
  const category: ChargeCategory = WHATSAPP_CHARGE_TYPES[chargeType as keyof typeof WHATSAPP_CHARGE_TYPES] ?? "other";
  const ref = rest.join(" ").trim();
  return {
    externalId: tx.id,
    chargeType,
    category,
    amountUsd: toChargeAmount(tx.amount),
    settledAt: parseSettlementTime(tx.settlementTime),
    messageRef: ref || null,
  };
}
