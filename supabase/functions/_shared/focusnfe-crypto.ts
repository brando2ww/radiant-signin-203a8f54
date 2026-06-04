// AES-GCM encryption helper for FocusNFE tokens / passwords / CSC.
// Uses FOCUSNFE_ENCRYPTION_KEY (any length string) hashed to 256-bit key.

const enc = new TextEncoder();
const dec = new TextDecoder();

async function getKey(): Promise<CryptoKey> {
  const raw = Deno.env.get("FOCUSNFE_ENCRYPTION_KEY");
  if (!raw) throw new Error("FOCUSNFE_ENCRYPTION_KEY not set");
  const hash = await crypto.subtle.digest("SHA-256", enc.encode(raw));
  return crypto.subtle.importKey("raw", hash, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

function toB64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function fromB64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function encryptSecret(plain: string): Promise<string> {
  if (!plain) return "";
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(plain),
  );
  return `${toB64(iv)}.${toB64(ct)}`;
}

export async function decryptSecret(payload: string | null | undefined): Promise<string> {
  if (!payload) return "";
  const [ivB64, ctB64] = payload.split(".");
  if (!ivB64 || !ctB64) throw new Error("Formato cifrado inválido");
  const key = await getKey();
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromB64(ivB64) },
    key,
    fromB64(ctB64),
  );
  return dec.decode(pt);
}
