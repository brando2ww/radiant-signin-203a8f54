/** Utilitários do app do representante (telefone, nomes, mês corrente). */
import { endOfMonth, startOfMonth } from "date-fns";
import { toLocalDateStr } from "@/lib/date";

export function onlyDigits(value?: string | null): string {
  return (value ?? "").replace(/\D/g, "");
}

/** Telefone brasileiro para o formato internacional sem "+": "(54) 97777-0001" → "5554977770001". */
export function phoneE164(value?: string | null): string | null {
  let d = onlyDigits(value).replace(/^0+/, "");
  if (!d) return null;
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  if (d.length < 12 || d.length > 13) return null;
  return d;
}

export function telHref(value?: string | null): string | null {
  const e = phoneE164(value);
  return e ? `tel:+${e}` : null;
}

export function whatsappHref(value?: string | null, text?: string): string | null {
  const e = phoneE164(value);
  if (!e) return null;
  return `https://wa.me/${e}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

/** Compartilhar pelo WhatsApp sem destinatário (o representante escolhe o contato no aparelho). */
export function whatsappShareHref(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export function firstName(name?: string | null): string {
  return (name ?? "").trim().split(/\s+/)[0] || "";
}

export function initials(name?: string | null): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function greeting(date = new Date()): string {
  const h = date.getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

/** Limites do mês corrente no horário do aparelho (timestamps em ISO e datas YYYY-MM-DD). */
export function currentMonthRange(now = new Date()) {
  const start = startOfMonth(now);
  const end = endOfMonth(now);
  const nextStart = new Date(start.getFullYear(), start.getMonth() + 1, 1);
  return {
    key: toLocalDateStr(start).slice(0, 7),
    startIso: start.toISOString(),
    nextStartIso: nextStart.toISOString(),
    startDate: toLocalDateStr(start),
    endDate: toLocalDateStr(end),
  };
}

/** Normaliza para busca: minúsculas e sem acento. */
export function normalizeSearch(value?: string | null): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export function formatQty(value?: number | string | null): string {
  if (value === null || value === undefined || value === "") return "";
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}

/** Botão de fechar do Sheet maior e visível sobre foto (alvo de toque de 40px). Vai no className do SheetContent. */
export const SHEET_CLOSE_GRANDE =
  "[&>button:last-child]:right-3 [&>button:last-child]:top-3 [&>button:last-child]:flex [&>button:last-child]:h-10 [&>button:last-child]:w-10 [&>button:last-child]:items-center [&>button:last-child]:justify-center [&>button:last-child]:rounded-full [&>button:last-child]:bg-background/90 [&>button:last-child]:opacity-100 [&>button:last-child]:shadow-md";
