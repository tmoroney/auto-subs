/**
 * Request signing.
 *
 * The signing key is baked into the app at build time, so it is extractable
 * from any shipped binary — this is deliberately not a secret in the strong
 * sense. What it buys us is *rotation*: keys are per release, the Worker only
 * accepts keys for releases it still cares about, and a key lifted from an old
 * build stops working as soon as that release ages out of `SIGNING_KEYS`.
 */

const encoder = new TextEncoder();

/** `SIGNING_KEYS` secret: `{"3.9.0": "<hex>", "3.10.0": "<hex>"}`. */
export type SigningKeys = Record<string, string>;

export function parseSigningKeys(raw: string | undefined): SigningKeys {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    const keys: SigningKeys = {};
    for (const [version, key] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof key === "string" && key.length > 0) keys[version] = key;
    }
    return keys;
  } catch {
    return {};
  }
}

export async function signBody(key: string, body: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(body));
  return [...new Uint8Array(signature)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** Constant-time comparison, so the endpoint does not leak the signature byte by byte. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function verifyBody(
  key: string,
  body: string,
  signature: string,
): Promise<boolean> {
  return timingSafeEqual(await signBody(key, body), signature.toLowerCase());
}
