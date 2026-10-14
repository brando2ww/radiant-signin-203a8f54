import { useQuery } from "@tanstack/react-query";
import { Download, Monitor, Copy } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishmentId } from "@/hooks/use-establishment-id";

/**
 * Instalador da Print Bridge, já identificado com o restaurante em foco.
 *
 * O arquivo no storage é um só para todos. O que muda por restaurante é o NOME
 * com que ele chega ao computador: Velara-Impressao-<Nome>-<codigo>.exe. O
 * instalador (2.6.1+) lê o código do próprio nome e preenche o assistente, e
 * ninguém precisa digitar o UUID, que era onde a instalação dava errado: com o
 * código trocado a ponte sobe muda, ou imprime pedido de outro restaurante.
 *
 * O código é o dono do estabelecimento (visibleUserId), o mesmo TENANT_USER_ID
 * que a ponte usa para filtrar a fila. Para um super admin olhando a loja de um
 * cliente, sai o instalador DAQUELE cliente.
 */
const VERSAO = "2.6.1";
const CAMINHO = `print-bridge/VelaraPrintBridgeSetup-${VERSAO}.exe`;

/** "Restaurante Sertão Adentro" → "Restaurante-Sertao-Adentro" */
function nomeParaArquivo(nome: string): string {
  return (
    nome
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "Restaurante"
  );
}

export function PrintBridgeDownloadCard() {
  const { visibleUserId } = useEstablishmentId();

  const { data: nomeLoja } = useQuery({
    queryKey: ["print-bridge-nome-loja", visibleUserId],
    queryFn: async () => {
      const { data } = await supabase
        .from("tenants")
        .select("name")
        .eq("owner_user_id", visibleUserId!)
        .maybeSingle();
      return (data?.name as string | undefined) ?? null;
    },
    enabled: !!visibleUserId,
    staleTime: 10 * 60 * 1000,
  });

  if (!visibleUserId) return null;

  const arquivo = `Velara-Impressao-${nomeParaArquivo(nomeLoja ?? "Restaurante")}-${visibleUserId}.exe`;
  // `download` faz o storage responder com Content-Disposition e este nome de
  // arquivo. O atributo download do <a> não serve: o storage é outra origem.
  const url = supabase.storage.from("downloads").getPublicUrl(CAMINHO, { download: arquivo }).data
    .publicUrl;

  const copiarCodigo = async () => {
    try {
      await navigator.clipboard.writeText(visibleUserId);
      toast.success("Código do restaurante copiado");
    } catch {
      toast.error("Não consegui copiar. Selecione o código e copie à mão.");
    }
  };

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Monitor className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-medium">Programa de impressão (Print Bridge) · versão {VERSAO}</p>
          <p className="text-sm text-muted-foreground">
            Instale no computador do caixa que fica na mesma rede das impressoras (Windows 10 ou 11).
            O instalador já vem com os dados de{" "}
            <strong className="text-foreground">{nomeLoja ?? "este restaurante"}</strong>: é só avançar.
          </p>
          <p className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
            Código do restaurante:
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">
              {visibleUserId}
            </code>
            <button
              type="button"
              onClick={copiarCodigo}
              className="inline-flex items-center gap-1 rounded px-1 py-0.5 hover:bg-muted"
              aria-label="Copiar código do restaurante"
            >
              <Copy className="h-3 w-3" /> copiar
            </button>
          </p>
        </div>
        <Button asChild className="shrink-0">
          <a href={url} rel="noopener">
            <Download className="mr-2 h-4 w-4" />
            Baixar instalador
          </a>
        </Button>
      </CardContent>
    </Card>
  );
}
