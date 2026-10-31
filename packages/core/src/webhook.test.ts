import { describe, expect, it } from "vitest";
import { parseTagWebhook } from "./webhook";

describe("parseTagWebhook", () => {
  it("lee el formato estándar del webhook de workflows de GHL", () => {
    const payload = {
      contact_id: "6z3pPnE0yqNrWUW0H0Zl",
      first_name: "Ana",
      tags: "ETT, men03-lci-08.10.26,quiero",
      date_created: "2026-10-28T12:01:53.108Z",
      location: { id: "QUFbIip4WxMo3dAuxG6i", name: "ETT" },
      workflow: { id: "w1", name: "Aviso de etiquetas" },
    };
    expect(parseTagWebhook(payload)).toEqual({
      contactId: "6z3pPnE0yqNrWUW0H0Zl",
      tags: ["ett", "men03-lci-08.10.26", "quiero"],
      locationId: "QUFbIip4WxMo3dAuxG6i",
      contactCreatedAt: new Date("2026-10-28T12:01:53.108Z"),
    });
  });

  it("acepta un cuerpo personalizado con contact.{id,tags} y tags como lista", () => {
    expect(parseTagWebhook({ contact: { id: "abc12345", tags: ["B", "a", "a"] }, locationId: "L1" })).toEqual({
      contactId: "abc12345",
      tags: ["a", "b"],
      locationId: "L1",
      contactCreatedAt: null,
    });
  });

  it("etiquetas vacías = el contacto se quedó sin etiquetas; sin campo = desconocidas", () => {
    expect(parseTagWebhook({ contact_id: "abc12345", tags: "" })?.tags).toEqual([]);
    expect(parseTagWebhook({ contact_id: "abc12345" })?.tags).toBeNull();
  });

  it.each([null, "texto", {}, { contact_id: "" }, { contact_id: "../../etc" }, { contact_id: 123 }])("rechaza %j", (body) => {
    expect(parseTagWebhook(body)).toBeNull();
  });
});
