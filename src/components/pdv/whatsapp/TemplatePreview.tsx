import { AlertTriangle, Clock, Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  WhatsAppTemplate, conferirParametros, renderizarTemplate, rotuloStatus,
} from "@/lib/whatsapp-templates";
import { cn } from "@/lib/utils";

interface Props {
  template: WhatsAppTemplate;
  /** Valores na ordem das variáveis do modelo. */
  valores: string[];
  /** Só para modelo com botão de link: o que vai colado no fim da URL. */
  variavelDoBotao?: string;
  className?: string;
}

const ICONE_STATUS = {
  aprovado: Check,
  em_aprovacao: Clock,
  rejeitado: X,
} as const;

/**
 * Mostra ao lojista a mensagem exata que o fornecedor vai receber.
 *
 * Existe porque no número oficial o texto que ele escreve em Compras >
 * Configurações não é o que sai: a Meta só aceita o modelo aprovado. Sem esta
 * tela, ele edita um texto, vê outro chegar e abre chamado — com razão.
 *
 * As lacunas em vermelho não são enfeite: parâmetro vazio faz a Meta recusar o
 * envio inteiro, e é melhor descobrir aqui do que no relatório de falhas.
 */
export function TemplatePreview({ template, valores, variavelDoBotao, className }: Props) {
  const problemas = conferirParametros(template, valores);
  const texto = renderizarTemplate(template, valores);
  const StatusIcon = ICONE_STATUS[template.status];

  // Quebra em pedaços para pintar de vermelho o que ficou por preencher.
  const pedacos = texto.split(/(\{\{\d+\}\})/g);

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">Mensagem que o fornecedor recebe</span>
        <Badge
          variant={template.status === "aprovado" ? "secondary" : "outline"}
          className="gap-1 text-[11px] font-normal"
        >
          <StatusIcon className="h-3 w-3" />
          {rotuloStatus(template.status)}
        </Badge>
        <code className="text-[11px] text-muted-foreground">{template.name}</code>
      </div>

      {/* Balão no estilo do WhatsApp: o lojista reconhece o formato antes de ler. */}
      <div className="rounded-lg rounded-tl-none border bg-[#e7ffdb] p-3 text-sm leading-relaxed text-[#111b21] shadow-sm dark:bg-emerald-950/40 dark:text-emerald-50">
        <p className="whitespace-pre-wrap break-words">
          {pedacos.map((p, i) =>
            /^\{\{\d+\}\}$/.test(p) ? (
              <span key={i} className="rounded bg-red-500/20 px-1 font-medium text-red-700 dark:text-red-300">
                {template.vars[Number(p.replace(/\D/g, "")) - 1] ?? p} em branco
              </span>
            ) : (
              <span key={i}>{p}</span>
            ),
          )}
        </p>

        {template.button && (
          <div className="mt-3 border-t border-black/10 pt-2 text-center text-sm font-medium text-[#027eb5] dark:border-white/10 dark:text-sky-300">
            {template.button.text}
          </div>
        )}
      </div>

      {template.button?.kind === "url" && variavelDoBotao && (
        <p className="break-all text-[11px] text-muted-foreground">
          Botão abre: {template.button.urlBase}{variavelDoBotao}
        </p>
      )}

      {problemas.length > 0 && (
        <div className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
          <div className="space-y-0.5">
            {problemas.map((p) => (
              <p key={p.indice}>
                <strong>{p.rotulo}</strong>{" "}
                {p.motivo === "vazio"
                  ? "está em branco. A Meta recusa o envio com variável vazia."
                  : "tem quebra de linha. A Meta não aceita e o texto vai ser achatado numa linha só."}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
