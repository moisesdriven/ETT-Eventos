import "server-only";
import { auditLogs } from "@ett/db";
import { db } from "./db";
import { getClientIp } from "./request";

export async function audit(entry: {
  userId: string | null;
  action: string;
  entity?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}) {
  await db.insert(auditLogs).values({ ...entry, ip: await getClientIp() });
}
