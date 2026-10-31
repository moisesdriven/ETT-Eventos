import { z } from "zod";
import { createHttp, type HttpOptions } from "./http";

export interface GhlClientConfig {
  agencyToken: string;
  locationToken: string;
  locationId: string;
}

const walletTx = z
  .object({
    id: z.string(),
    description: z.string().nullish(),
    amount: z.union([z.number(), z.string()]),
    settlementTime: z.string(),
  })
  .passthrough();
export type GhlWalletTransaction = z.infer<typeof walletTx>;

const walletResponse = z.object({ data: z.object({ transactions: z.array(walletTx) }) });

const message = z
  .object({
    id: z.string(),
    altId: z.string().nullish(),
    conversationId: z.string().nullish(),
    contactId: z.string().nullish(),
    direction: z.string().nullish(),
    from: z.string().nullish(),
    to: z.string().nullish(),
    source: z.string().nullish(),
    status: z.string().nullish(),
    messageType: z.string().nullish(),
    dateAdded: z.string(),
  })
  .passthrough();
export type GhlMessage = z.infer<typeof message>;

const exportResponse = z.object({ messages: z.array(message), nextCursor: z.string().nullish(), total: z.number().nullish() });

const contact = z
  .object({
    id: z.string(),
    firstName: z.string().nullish(),
    lastName: z.string().nullish(),
    contactName: z.string().nullish(),
    phone: z.string().nullish(),
    tags: z.array(z.string()).nullish(),
    dateAdded: z.string().nullish(),
    dateUpdated: z.string().nullish(),
  })
  .passthrough();
export type GhlContact = z.infer<typeof contact>;

const tag = z.object({ id: z.string(), name: z.string() }).passthrough();
export type GhlTag = z.infer<typeof tag>;

const location = z.object({ id: z.string(), name: z.string(), companyId: z.string().nullish(), timezone: z.string().nullish() }).passthrough();

export function createGhlClient(config: GhlClientConfig, httpOptions: HttpOptions = {}) {
  const request = createHttp(httpOptions);
  const loc = { token: config.locationToken, rateKey: `location:${config.locationId}` };
  const agency = { token: config.agencyToken, rateKey: "agency" };

  return {
    locationId: config.locationId,

    async getLocation() {
      const res = await request<unknown>({ ...loc, method: "GET", path: `/locations/${config.locationId}` });
      return z.object({ location }).parse(res).location;
    },

    /** Cobros del monedero de agencia filtrados por la subcuenta (Version v3, máx. 1000 por página). */
    async *walletTransactions(companyId: string, from: Date, to: Date, pageSize = 1000) {
      for (let skip = 0; ; skip += pageSize) {
        const res = await request<unknown>({
          ...agency,
          method: "POST",
          version: "v3",
          path: `/saas/companies/${companyId}/wallet-transactions`,
          body: {
            skip,
            limit: pageSize,
            timezone: "UTC",
            filters: { locationId: config.locationId, settlementTime: { from: from.toISOString(), to: to.toISOString() } },
          },
        });
        const page = walletResponse.parse(res).data.transactions;
        yield page;
        if (page.length < pageSize) return;
      }
    },

    /**
     * Export de mensajes de WhatsApp por rango (cursor válido 2 min: consumir sin pausas largas).
     * Cada página trae `total` (mensajes del rango según GHL) para verificar que llegó todo.
     * Ojo: GHL a veces responde 0 mensajes sin error; quien llama debe verificar y reintentar.
     */
    async *whatsappMessages(from: Date, to: Date, pageSize = 500) {
      let cursor: string | undefined;
      for (;;) {
        const res = await request<unknown>({
          ...loc,
          method: "GET",
          path: "/conversations/messages/export",
          query: {
            locationId: config.locationId,
            channel: "WhatsApp",
            limit: pageSize,
            startDate: from.toISOString(),
            endDate: to.toISOString(),
            cursor,
          },
        });
        const page = exportResponse.parse(res);
        yield { messages: page.messages, total: page.total ?? null };
        if (!page.nextCursor || page.messages.length === 0) return;
        cursor = page.nextCursor;
      }
    },

    async listTags() {
      const res = await request<unknown>({ ...loc, method: "GET", path: `/locations/${config.locationId}/tags` });
      return z.object({ tags: z.array(tag) }).parse(res).tags;
    },

    async getContact(contactId: string): Promise<GhlContact | null> {
      try {
        const res = await request<unknown>({ ...loc, method: "GET", path: `/contacts/${contactId}` });
        return z.object({ contact }).parse(res).contact;
      } catch (err) {
        if (err instanceof Error && "status" in err && (err.status === 404 || err.status === 400)) return null;
        throw err;
      }
    },

    /** Cantidad de contactos con una etiqueta. */
    async countContactsWithTag(tagName: string): Promise<number> {
      const res = await request<unknown>({
        ...loc,
        method: "POST",
        path: "/contacts/search",
        body: { locationId: config.locationId, page: 1, pageLimit: 1, filters: [{ field: "tags", operator: "eq", value: tagName }] },
      });
      return z.object({ total: z.number() }).parse(res).total;
    },

    /** Todos los contactos con una etiqueta (páginas de 500). */
    async *contactsWithTag(tagName: string, pageSize = 500) {
      for (let page = 1; ; page++) {
        const res = await request<unknown>({
          ...loc,
          method: "POST",
          path: "/contacts/search",
          body: { locationId: config.locationId, page, pageLimit: pageSize, filters: [{ field: "tags", operator: "eq", value: tagName }] },
        });
        const parsed = z.object({ contacts: z.array(contact), total: z.number().nullish() }).parse(res);
        yield parsed.contacts;
        if (parsed.contacts.length < pageSize) return;
      }
    },
  };
}

export type GhlClient = ReturnType<typeof createGhlClient>;
