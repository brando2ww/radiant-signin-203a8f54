import { Fragment } from "react";
import { AlertTriangle, Clock, Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  WhatsAppTemplate, conferirParametros, renderizarTemplate, rotuloStatus,
} from "@/lib/whatsapp-templates";
import { WhatsAppChatPreview } from "./WhatsAppChatPreview";
import { formatarWhatsApp } from "./whatsapp-format";
import { cn } from "@/lib/utils";

interface Props {
  template: WhatsAppTemplate;
  /** Valores na ordem das variáveis do modelo. */
  valores: string[];
  /** Nome do fornecedor, para o topo da conversa. */
  contato?: string;
  /** Só para modelo com botão de link: o que vai colado no fim da URL. */
  variavelDoBotao?: string;
  rodape?: string;
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
export function TemplatePreview({
  template, valores, contato, variavelDoBotao, rodape, className,
}: Props) {
  const problemas = conferirParametros(template, valores);
  const texto = renderizarTemplate(template, valores);
  const StatusIcon = ICONE_STATUS[template.status];

  // O que sobrou como {{n}} é variável sem valor: pinta de vermelho em vez de
  // exibir a chave crua, que não diz nada a quem não escreveu o modelo.
  const conteudo = texto.split(/(\{\{\d+\}\})/g).map((p, i) =>
    /^\{\{\d+\}\}$/.test(p) ? (
      <span
        key={i}
        className="rounded bg-red-500/25 px-1 font-medium text-red-700 dark:text-red-200"
      >
        {template.vars[Number(p.replace(/\D/g, "")) - 1] ?? p} em branco
      </span>
    ) : (
      <Fragment key={i}>{formatarWhatsApp(p, `p${i}`)}</Fragment>
    ),
  );

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

      <WhatsAppChatPreview
        contato={contato || valores[0] || "Fornecedor"}
        conteudo={conteudo}
        botao={template.button ? { kind: template.button.kind, text: template.button.text } : undefined}
        rodape={
          rodape ??
          (template.button?.kind === "url" && variavelDoBotao
            ? `O botão abre ${template.button.urlBase}${variavelDoBotao}`
            : template.button?.kind === "url"
              ? "O link exclusivo de cada fornecedor entra no botão na hora do envio."
              : undefined)
        }
      />

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
