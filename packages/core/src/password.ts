import { hash, verify } from "@node-rs/argon2";

// Argon2id con parámetros recomendados por OWASP (m=19 MiB, t=2, p=1).
const OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export const PASSWORD_MIN_LENGTH = 12;

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

/** Hash de relleno para igualar tiempos cuando el usuario no existe. */
let dummyHash: Promise<string> | undefined;
export async function verifyAgainstDummy(password: string): Promise<false> {
  dummyHash ??= hashPassword("contraseña-de-relleno-no-valida");
  await verifyPassword(await dummyHash, password);
  return false;
}
