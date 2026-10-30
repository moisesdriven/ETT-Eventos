/**
 * Normaliza un teléfono a E.164. GHL devuelve formatos mixtos
 * ("+51 976 232 041" y "+51976232041") para la misma línea.
 * Devuelve null si no quedan dígitos suficientes.
 */
export function normalizePhone(raw: string | null | undefined, defaultCountryCode = "51"): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  let digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("00")) digits = digits.slice(2);
  else if (!trimmed.startsWith("+") && digits.length === 9) digits = defaultCountryCode + digits;
  if (digits.length < 8 || digits.length > 15) return null;
  return `+${digits}`;
}
