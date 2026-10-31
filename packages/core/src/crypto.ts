import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Cifrado en reposo con AES-256-GCM. Formato: `v1.<iv>.<tag>.<ciphertext>` en base64url.
 * La clave (32 bytes en base64) viene de APP_ENCRYPTION_KEY y nunca se guarda en la BD.
 */
const VERSION = "v1";

export function parseEncryptionKey(base64Key: string | undefined): Buffer {
  if (!base64Key) throw new Error("Falta APP_ENCRYPTION_KEY");
  const key = Buffer.from(base64Key, "base64");
  if (key.length !== 32) throw new Error("APP_ENCRYPTION_KEY debe tener 32 bytes en base64");
  return key;
}

export function encryptSecret(plain: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [VERSION, iv, cipher.getAuthTag(), ciphertext].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(".");
}

export function decryptSecret(payload: string, key: Buffer): string {
  const [version, iv, tag, ciphertext] = payload.split(".");
  if (version !== VERSION || !iv || !tag || ciphertext === undefined) throw new Error("Formato de secreto cifrado inválido");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
}
