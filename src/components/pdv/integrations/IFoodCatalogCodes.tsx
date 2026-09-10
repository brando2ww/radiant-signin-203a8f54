import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Check, Copy, Download, Search, CircleDashed } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useIFoodCatalogCodes, type CatalogCodeItem } from "@/hooks/use-ifood-catalog-codes";

/**
 * Códigos do cardápio para o lojista configurar no iFood.
 *
 * O iFood casa cada item do pedido pelo `externalCode` preenchido no cardápio
 * dele. Esta tela diz qual número usar em cada produto e complemento.
 *
 * O botão de copiar existe porque a conferência é feita com esta tela de um
 * lado e o painel do iFood do outro: digitar número olhando para outra janela
 * é onde nascem os erros que ninguém percebe depois.
 */
function CodigoBotao({ code, compacto = false }: { code: number; compacto?: boolean }) {
  const [copiado, setCopiado] = useState(false);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(String(code));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1200);
    } catch {
      toast.error("Não foi possível copiar. Selecione o número e copie manualmente.");
    }
  };

  return (
    <button
      type="button"
      onClick={copiar}
      title={`Copiar o código ${code}`}
      className={cn(
        "group inline-flex shrink-0 items-center gap-1.5 rounded-md border font-mono tabular-nums transition-colors",
        compacto ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-sm font-semibold",
        copiado
          ? "border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-400"
          : "border-border bg-muted/40 hover:border-primary/40 hover:bg-primary/5",
      )}
    >
      {code}
      {copiado
        ? <Check className="h-3 w-3" />
        : <Copy className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-60" />}
    </button>
  );
}

function SinalConfigurado({ item }: { item: CatalogCodeItem }) {
  if (item.configurado) {
    return (
      <span
        className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400"
        title="Este código já chegou num pedido do iFood, então está configurado corretamente lá."
      >
        <Check className="h-3.5 w-3.5" /> configurado
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 text-xs text-muted-foreground/70"
      title="Ainda não chegou nenhum pedido do iFood com este código."
    >
      <CircleDashed className="h-3.5 w-3.5" /> pendente
    </span>
  );
}

export function IFoodCatalogCodes() {
  const { data, isLoading } = useIFoodCatalogCodes();
  const [busca, setBusca] = useState("");

  const produtos = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return data?.produtos ?? [];
    return (data?.produtos ?? [])
      .map((p) => {
        const bateProduto =
          p.name.toLowerCase().includes(termo) || String(p.code).includes(termo);
        const subs = p.subitens.filter(
          (s) => s.name.toLowerCase().includes(termo) || String(s.code).includes(termo),
        );
        if (bateProduto) return p;
        if (subs.length) return { ...p, subitens: subs };
        return null;
      })
      .filter(Boolean) as typeof data.produtos;
  }, [data, busca]);

  const baixarCsv = () => {
    const linhas = ["codigo;tipo;nome"];
    for (const p of data?.produtos ?? []) {
      linhas.push(`${p.code};item;"${p.name.replace(/"/g, "'")}"`);
      for (const s of p.subitens) {
        linhas.push(`${s.code};complemento;"${s.name.replace(/"/g, "'")}"`);
      }
    }
    const blob = new Blob([linhas.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "codigos-cardapio-ifood.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader><Skeleton className="h-5 w-56" /></CardHeader>
        <CardContent className="space-y-2">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </CardContent>
      </Card>
    );
  }

  const total = data?.total ?? 0;
  const configurados = data?.configurados ?? 0;
  const pct = total ? Math.round((configurados / total) * 100) : 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-base">Códigos do cardápio</CardTitle>
            <CardDescription>
              Informe estes números no campo <strong>código externo</strong> de cada item e
              complemento do seu cardápio no iFood. É por eles que o pedido encontra o produto
              certo aqui dentro.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={baixarCsv} className="shrink-0 gap-2">
            <Download className="h-4 w-4" /> Baixar lista
          </Button>
        </div>

        {/* Progresso real: só conta o que já voltou num pedido do iFood. */}
        {total > 0 && (
          <div className="mt-4 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                <strong className="text-foreground">{configurados}</strong> de {total} códigos já
                apareceram em pedidos do iFood
              </span>
              <span className="font-medium tabular-nums">{pct}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-green-500 transition-all duration-700"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou número..."
            className="pl-9"
          />
        </div>

        {produtos.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {busca
              ? "Nenhum item encontrado."
              : "Nenhum produto no cardápio de delivery ainda."}
          </p>
        ) : (
          <div className="divide-y rounded-lg border">
            {produtos.map((p) => (
              <div key={p.code} className="p-3">
                <div className="flex items-center gap-3">
                  <CodigoBotao code={p.code} />
                  <span className="min-w-0 flex-1 truncate font-medium" title={p.name}>
                    {p.name}
                  </span>
                  <SinalConfigurado item={p} />
                </div>

                {p.subitens.length > 0 && (
                  <div className="mt-2 space-y-1.5 border-l-2 border-muted pl-4">
                    {p.subitens.map((s) => (
                      <div key={s.code} className="flex items-center gap-3">
                        <CodigoBotao code={s.code} compacto />
                        <span
                          className="min-w-0 flex-1 truncate text-sm text-muted-foreground"
                          title={s.name}
                        >
                          {s.name}
                        </span>
                        <SinalConfigurado item={s} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {produtos.length > 0 && (
          <p className="text-xs text-muted-foreground">
            <Badge variant="secondary" className="mr-1.5 text-[10px]">dica</Badge>
            Clique no número para copiar. O selo muda para <strong>configurado</strong> sozinho
            quando chega o primeiro pedido do iFood usando aquele código.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
