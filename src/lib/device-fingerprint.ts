// Identificador estável por navegador (não autenticado).
// Usado para gravar status de impressora por dispositivo no banco.
const KEY = "velara:device-fingerprint";

export function getDeviceFingerprint(): string {
  if (typeof window === "undefined") return "ssr";
  try {
    let id = window.localStorage.getItem(KEY);
    if (!id) {
      id = (crypto?.randomUUID?.() ?? `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      window.localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return "anon";
  }
}
