import { supabase } from "@/integrations/supabase/client";

const SHARE_ORIGIN = "https://cardapio.velaraia.app";

/**
 * URL "humana" do cardápio, usada para abrir no navegador.
 * Usa o slug se houver, caindo de volta para o user id.
 */
export function buildPublicMenuUrl(opts: {
  userId: string;
  slug?: string | null;
  origin?: string;
}): string {
  const origin =
    opts.origin ?? (typeof window !== "undefined" ? window.location.origin : "");
  const handle = opts.slug?.trim() || opts.userId;
  return `${origin}/cardapio/${handle}`;
}

/**
 * URL para compartilhar (WhatsApp, redes sociais).
 * Aponta para a Edge Function og-cardapio que serve as meta tags
 * Open Graph com o logo do negócio antes de redirecionar para o cardápio.
 */
export function buildShareableMenuUrl(opts: {
  userId: string;
  slug?: string | null;
}): string {
  const handle = opts.slug?.trim() || opts.userId;
  return `${SHARE_ORIGIN}/${handle}`;
}

/** Normaliza um candidato a slug (lowercase, hífens, sem acentos). */
export function normalizeSlug(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;

export function isValidSlug(s: string): boolean {
  return SLUG_RE.test(s);
}

/** Verifica se um slug está disponível (ignora o próprio user). */
export async function isSlugAvailable(
  slug: string,
  currentUserId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("business_settings")
    .select("user_id")
    .ilike("slug", slug)
    .maybeSingle();
  if (!data) return true;
  return data.user_id === currentUserId;
}
