import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

/** "2026-10-05" → "05/10/2026" (data pura, sem fuso). */
export function dataBR(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return format(parseISO(iso.length === 10 ? `${iso}T12:00:00` : iso), "dd/MM/yyyy", { locale: ptBR });
  } catch {
    return iso;
  }
}

/** CPF ou CNPJ formatado a partir dos dígitos. */
export function documentoBR(doc: string | null | undefined): string {
  const d = (doc || "").replace(/\D/g, "");
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  return doc || "";
}

/** Telefone em formato de WhatsApp internacional (55 + DDD + número), ou null se não der. */
export function telefoneWhatsApp(...fontes: (string | null | undefined)[]): string | null {
  for (const f of fontes) {
    const d = (f || "").replace(/\D/g, "");
    if (d.length === 10 || d.length === 11) return `55${d}`;
    if ((d.length === 12 || d.length === 13) && d.startsWith("55")) return d;
  }
  return null;
}

/** Link do WhatsApp com a mensagem pronta (abre a conversa; quem envia é a pessoa). */
export function linkWhatsApp(telefone: string | null, texto: string): string {
  const t = encodeURIComponent(texto);
  return telefone ? `https://wa.me/${telefone}?text=${t}` : `https://wa.me/?text=${t}`;
}

export async function copiar(texto: string, rotulo = "Copiado") {
  try {
    await navigator.clipboard.writeText(texto);
    toast.success(rotulo);
  } catch {
    // Navegador sem permissão de área de transferência: seleciona num campo temporário.
    const el = document.createElement("textarea");
    el.value = texto;
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    try {
      document.execCommand("copy");
      toast.success(rotulo);
    } catch {
      toast.error("Não consegui copiar. Selecione o texto e copie à mão.");
    } finally {
      document.body.removeChild(el);
    }
  }
}
