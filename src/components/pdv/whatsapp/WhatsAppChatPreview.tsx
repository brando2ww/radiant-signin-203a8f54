import { type ReactNode } from "react";
import { Check, ExternalLink, Reply } from "lucide-react";
import { formatarWhatsApp } from "./whatsapp-format";
import { cn } from "@/lib/utils";

export interface ChatButton {
  kind: "url" | "quick_reply";
  text: string;
}

interface Props {
  /** Nome que aparece no topo da conversa — o destinatário. */
  contato: string;
  /** Texto da mensagem, já com a marcação do WhatsApp (*negrito*, _itálico_). */
  texto?: string;
  /** Alternativa a `texto`: conteúdo já montado (usado para pintar lacunas). */
  conteudo?: ReactNode;
  botao?: ChatButton;
  /** Linha discreta abaixo do balão, dentro da moldura. */
  rodape?: string;
  className?: string;
  /** Altura máxima da área rolável do chat. */
  alturaMax?: string;
}

/** Iniciais para o avatar, no máximo duas. */
function iniciais(nome: string): string {
  return nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * Simulação da conversa no WhatsApp.
 *
 * Uma caixa monoespaçada cinza não é prévia: o lojista lê asteriscos, quebras
 * de linha soltas e não consegue julgar se a mensagem ficou boa. Aqui ele vê o
 * que o fornecedor vê — negrito aplicado, link destacado, botão desenhado — e
 * decide com a mesma informação que o destinatário vai ter.
 *
 * O balão é de SAÍDA (verde, à direita) porque a conversa é a do lojista com o
 * fornecedor: é a mensagem que ele está prestes a mandar.
 */
export function WhatsAppChatPreview({
  contato, texto, conteudo, botao, rodape, className, alturaMax = "320px",
}: Props) {
  // Papel de parede do WhatsApp: rabiscos discretos, em SVG embutido para não
  // depender de arquivo nem de rede.
  const papel =
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='60' viewBox='0 0 60 60'%3E%3Cg fill='none' stroke='%23000' stroke-opacity='.04' stroke-width='1.4'%3E%3Ccircle cx='12' cy='14' r='4'/%3E%3Cpath d='M32 8h10v9H32z'/%3E%3Cpath d='M46 30l5 5-5 5-5-5z'/%3E%3Cpath d='M8 38c4-5 10-5 14 0'/%3E%3Cpath d='M24 48h12'/%3E%3C/g%3E%3C/svg%3E\")";

  return (
    <div className={cn("overflow-hidden rounded-xl border shadow-sm", className)}>
      {/* Barra de topo da conversa */}
      <div className="flex items-center gap-3 border-b bg-[#f0f2f5] px-3 py-2 dark:bg-[#202c33]">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#00a884] text-xs font-semibold text-white">
          {iniciais(contato) || "?"}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-[#111b21] dark:text-[#e9edef]">{contato}</p>
          <p className="text-[11px] text-[#667781] dark:text-[#8696a0]">online</p>
        </div>
      </div>

      {/* Área da conversa */}
      <div
        className="overflow-y-auto bg-[#efeae2] px-3 py-4 dark:bg-[#0b141a]"
        style={{ backgroundImage: papel, maxHeight: alturaMax }}
      >
        <div className="flex justify-end">
          <div className="relative max-w-[85%]">
            {/* Rabinho do balão */}
            <span
              aria-hidden
              className="absolute -right-[7px] top-0 h-3 w-3 bg-[#d9fdd3] dark:bg-[#005c4b]"
              style={{ clipPath: "polygon(0 0, 100% 0, 0 100%)" }}
            />
            <div className="rounded-lg rounded-tr-none bg-[#d9fdd3] px-2.5 py-2 shadow-sm dark:bg-[#005c4b]">
              <p className="whitespace-pre-wrap break-words text-[13.5px] leading-[19px] text-[#111b21] dark:text-[#e9edef]">
                {conteudo ?? formatarWhatsApp(texto ?? "")}
              </p>

              {botao && (
                <div className="-mx-2.5 mt-2 border-t border-black/10 pt-1.5 dark:border-white/10">
                  <div className="flex items-center justify-center gap-1.5 text-[13.5px] font-medium text-[#027eb5] dark:text-[#53bdeb]">
                    {botao.kind === "url" ? (
                      <ExternalLink className="h-3.5 w-3.5" />
                    ) : (
                      <Reply className="h-3.5 w-3.5" />
                    )}
                    {botao.text}
                  </div>
                </div>
              )}

              {/* Hora e os dois tiques, como na conversa real */}
              <div className="-mb-0.5 mt-0.5 flex items-center justify-end gap-1">
                <span className="text-[11px] text-[#667781] dark:text-[#8696a0]">agora</span>
                <span className="relative inline-flex h-3 w-4 shrink-0 text-[#53bdeb]">
                  <Check className="absolute left-0 top-0 h-3 w-3" strokeWidth={3} />
                  <Check className="absolute left-1 top-0 h-3 w-3" strokeWidth={3} />
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {rodape && (
        <p className="border-t bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">{rodape}</p>
      )}
    </div>
  );
}
