import { parseWalletTransaction, type ParsedWalletCharge } from "@ett/core";
import { messageCharges } from "@ett/db";
import { sql } from "drizzle-orm";
import type { Ctx } from "../context";

export interface WalletFetchResult {
  charges: (ParsedWalletCharge & { raw: unknown })[];
  skipped: number;
}

/** Descarga los cobros del monedero de agencia del rango y se queda con los de WhatsApp. */
export async function fetchWalletCharges(ctx: Ctx, from: Date, to: Date): Promise<WalletFetchResult> {
  const charges: WalletFetchResult["charges"] = [];
  let skipped = 0;
  for await (const page of ctx.ghl.walletTransactions(ctx.companyId, from, to)) {
    for (const tx of page) {
      const parsed = parseWalletTransaction(tx);
      if (parsed) charges.push({ ...parsed, raw: tx });
      else skipped++;
    }
  }
  return { charges, skipped };
}

export async function upsertCharges(ctx: Ctx, charges: WalletFetchResult["charges"]): Promise<number> {
  for (let i = 0; i < charges.length; i += 500) {
    const chunk = charges.slice(i, i + 500);
    await ctx.db
      .insert(messageCharges)
      .values(
        chunk.map((c) => ({
          locationId: ctx.locationId,
          source: "ghl_wallet" as const,
          externalId: c.externalId,
          settledAt: c.settledAt,
          category: c.category,
          chargeType: c.chargeType,
          amountUsd: c.amountUsd,
          messageRef: c.messageRef,
          rawPayload: c.raw,
        })),
      )
      .onConflictDoUpdate({
        target: [messageCharges.source, messageCharges.externalId],
        set: {
          settledAt: sql`excluded.settled_at`,
          category: sql`excluded.category`,
          chargeType: sql`excluded.charge_type`,
          amountUsd: sql`excluded.amount_usd`,
          messageRef: sql`excluded.message_ref`,
          rawPayload: sql`excluded.raw_payload`,
          updatedAt: sql`now()`,
        },
      });
  }
  return charges.length;
}

export async function syncWallet(ctx: Ctx, from: Date, to: Date) {
  const { charges, skipped } = await fetchWalletCharges(ctx, from, to);
  await upsertCharges(ctx, charges);
  return { cobrosWhatsapp: charges.length, otrosCobrosIgnorados: skipped };
}
