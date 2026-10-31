import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, parseEncryptionKey } from "./crypto";
import { formatUnitUsd, formatUsd } from "./money";
import { normalizePhone } from "./phone";

describe("formato USD", () => {
  it("totales con 2 decimales y unitarios con 4", () => {
    expect(formatUsd("1245.5")).toBe("$1,245.50");
    expect(formatUnitUsd(0.04517)).toBe("$0.0452");
  });
});

describe("normalizePhone", () => {
  it("unifica los formatos que devuelve GHL", () => {
    expect(normalizePhone("+51 976 232 041")).toBe("+51976232041");
    expect(normalizePhone("+51976232041")).toBe("+51976232041");
    expect(normalizePhone("976232041")).toBe("+51976232041");
    expect(normalizePhone("0051976232041")).toBe("+51976232041");
    expect(normalizePhone("123")).toBeNull();
    expect(normalizePhone(undefined)).toBeNull();
  });
});

describe("cifrado AES-256-GCM", () => {
  const key = parseEncryptionKey(randomBytes(32).toString("base64"));

  it("cifra y descifra", () => {
    const enc = encryptSecret("pit-secreto", key);
    expect(enc.startsWith("v1.")).toBe(true);
    expect(enc).not.toContain("pit-secreto");
    expect(decryptSecret(enc, key)).toBe("pit-secreto");
  });

  it("rechaza datos alterados o una clave distinta", () => {
    const enc = encryptSecret("pit-secreto", key);
    const parts = enc.split(".");
    parts[3] = Buffer.from("otro").toString("base64url");
    expect(() => decryptSecret(parts.join("."), key)).toThrow();
    expect(() => decryptSecret(enc, parseEncryptionKey(randomBytes(32).toString("base64")))).toThrow();
  });

  it("valida el largo de la clave", () => {
    expect(() => parseEncryptionKey(randomBytes(16).toString("base64"))).toThrow();
    expect(() => parseEncryptionKey(undefined)).toThrow();
  });
});
