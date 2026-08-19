import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { SearchSelect, type SearchSelectOption } from "@/components/ui/search-select";
import { Loader2, PackagePlus } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatBRL } from "@/lib/format";
import { usePDVIngredients } from "@/hooks/use-pdv-ingredients";
import { usePDVSuppliers } from "@/hooks/use-pdv-suppliers";
import { usePDVChartOfAccounts } from "@/hooks/use-pdv-chart-of-accounts";
import { usePDVCostCenters } from "@/hooks/use-pdv-cost-centers";
import { useNfeEntry, type NfeEntryItem } from "@/hooks/use-nfe-entry";
import type { ParsedInvoice } from "@/lib/invoice/xml-parser";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nfe: ParsedInvoice | null;
  onDone?: () => void;
}

const PASSOS = ["Produtos", "Despesa"];

const TIPO_CONTA: Record<string, string> = {
  revenue: "Receitas", expense: "Despesas", cost: "Custos",
  asset: "Ativo", liability: "Passivo",
};

/**
 * Entrada de compra pela NF-e, no mesmo formato da compra avulsa.
 *
 * Substituiu o assistente de cinco passos: para quem opera, dar entrada é
 * responder duas perguntas — que insumo é cada item, e como a despesa vai ficar.
 * O resto já veio na nota e não precisa ser reconferido campo a campo.
 */
export function NfeEntryDialog({ open, onOpenChange, nfe, onDone }: Props) {
  const { ingredients } = usePDVIngredients();
  const { suppliers } = usePDVSuppliers();
  const { accounts } = usePDVChartOfAccounts();
  const { costCenters } = usePDVCostCenters();
  const { save, saving } = useNfeEntry();

  const [passo, setPasso] = useState(1);
  const [vinculos, setVinculos] = useState<Record<number, string | null>>({});
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [chartAccountId, setChartAccountId] = useState<string | null>(null);
  const [costCenterId, setCostCenterId] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<string>("boleto");
  const [paid, setPaid] = useState(false);
  const [notes, setNotes] = useState("");

  const duplicatas = nfe?.payment?.duplicatas ?? [];

  useEffect(() => {
    if (!open || !nfe) return;
    setPasso(1);
    setVinculos({});
    setNotes("");
    setPaid(false);
    setPaymentMethod(nfe.payment?.formaPagamento ?? "boleto");

    // Fornecedor pelo CNPJ da nota. Achar sozinho evita que a mesma empresa
    // vire dois cadastros a cada importação.
    const cnpj = (nfe.supplier.cnpj || "").replace(/\D/g, "");
    const achado = suppliers.find(
      (s: any) => (s.cnpj || "").replace(/\D/g, "") === cnpj && cnpj.length === 14,
    );
    setSupplierId(achado?.id ?? null);
    setChartAccountId(achado?.default_chart_account_id ?? null);
    setCostCenterId(achado?.default_cost_center_id ?? null);
  }, [open, nfe, suppliers]);

  const opcoesInsumo = useMemo<SearchSelectOption[]>(
    () => (ingredients ?? []).map((i: any) => ({
      value: i.id,
      label: i.name,
      hint: i.unit || undefined,
    })),
    [ingredients],
  );

  const opcoesConta = useMemo<SearchSelectOption[]>(() => {
    const porId = new Map(accounts.map((a: any) => [a.id, a]));
    const temFilho = new Set(accounts.filter((a: any) => a.parent_id).map((a: any) => a.parent_id));
    return accounts
      .filter((a: any) => !temFilho.has(a.id))
      .map((a: any) => ({
        value: a.id,
        label: `${a.code} · ${a.name}`,
        group: a.parent_id
          ? (porId.get(a.parent_id) as any)?.name ?? TIPO_CONTA[a.account_type]
          : TIPO_CONTA[a.account_type] ?? "Outras",
      }));
  }, [accounts]);

  const opcoesFornecedor = useMemo<SearchSelectOption[]>(
    () => suppliers.map((s: any) => ({ value: s.id, label: s.company_name || s.name })),
    [suppliers],
  );

  const opcoesCentro = useMemo<SearchSelectOption[]>(
    () => costCenters.map((c: any) => ({ value: c.id, label: c.name })),
    [costCenters],
  );

  if (!nfe) return null;

  const vinculados = Object.values(vinculos).filter(Boolean).length;

  const confirmar = async () => {
    const items: NfeEntryItem[] = nfe.items.map((item, idx) => ({
      index: idx,
      ingredientId: vinculos[idx] ?? null,
      quantity: item.quantity,
      unitPrice: item.unitValue,
    }));

    const ok = await save({
      nfe, supplierId, items, chartAccountId, costCenterId,
      paymentMethod, paid, notes: notes || undefined,
    });
    if (ok) {
      onOpenChange(false);
      onDone?.();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col">
        <DialogHeader>
          <DialogTitle>Dar entrada · {PASSOS[passo - 1]}</DialogTitle>
          <p className="text-sm text-muted-foreground">
            NF-e {nfe.invoiceNumber} · {nfe.supplier.name} · {formatBRL(nfe.totals.invoice)}
          </p>
        </DialogHeader>

        <div className="space-y-1">
          <Progress value={(passo / PASSOS.length) * 100} className="h-2" />
          <div className="flex justify-between text-xs text-muted-foreground">
            {PASSOS.map((p, i) => (
              <span key={p} className={i + 1 === passo ? "font-semibold text-foreground" : ""}>{p}</span>
            ))}
          </div>
        </div>

        <ScrollArea className="-mx-1 flex-1 px-1">
          {passo === 1 && (
            <div className="space-y-3 py-2">
              <p className="text-sm text-muted-foreground">
                Escolha o insumo de cada item da nota. O que ficar em branco entra no
                documento mas não movimenta estoque.
              </p>
              {nfe.items.map((item, idx) => (
                <div key={idx} className="rounded-md border p-3">
                  <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm font-medium">{item.productName}</span>
                    <span className="text-xs text-muted-foreground">
                      {item.quantity} {item.unit} × {formatBRL(item.unitValue)} ={" "}
                      <span className="font-medium text-foreground">{formatBRL(item.totalValue)}</span>
                    </span>
                  </div>
                  <SearchSelect
                    options={opcoesInsumo}
                    value={vinculos[idx] ?? undefined}
                    onChange={(v) => setVinculos((m) => ({ ...m, [idx]: v ?? null }))}
                    placeholder="Não movimentar estoque"
                    title="Escolher insumo"
                    searchPlaceholder="Buscar insumo..."
                    emptyText="Nenhum insumo cadastrado com esse nome."
                  />
                </div>
              ))}
            </div>
          )}

          {passo === 2 && (
            <div className="space-y-4 py-2">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Fornecedor</Label>
                  <SearchSelect
                    options={opcoesFornecedor}
                    value={supplierId ?? undefined}
                    onChange={(v) => setSupplierId(v ?? null)}
                    placeholder="Selecione"
                    title="Fornecedores"
                    searchPlaceholder="Buscar fornecedor..."
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Forma de pagamento</Label>
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="boleto">Boleto</SelectItem>
                      <SelectItem value="pix">PIX</SelectItem>
                      <SelectItem value="dinheiro">Dinheiro</SelectItem>
                      <SelectItem value="transferencia">Transferência</SelectItem>
                      <SelectItem value="credito">Cartão de crédito</SelectItem>
                      <SelectItem value="debito">Cartão de débito</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Conta contábil</Label>
                  <SearchSelect
                    options={opcoesConta}
                    value={chartAccountId ?? undefined}
                    onChange={(v) => setChartAccountId(v ?? null)}
                    placeholder="Sem classificação"
                    title="Plano de contas"
                    searchPlaceholder="Buscar por código ou nome..."
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Sem conta, a despesa aparece como "Sem classificação" na DRE.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Centro de custo</Label>
                  <SearchSelect
                    options={opcoesCentro}
                    value={costCenterId ?? undefined}
                    onChange={(v) => setCostCenterId(v ?? null)}
                    placeholder="Nenhum"
                    title="Centros de custo"
                    searchPlaceholder="Buscar..."
                  />
                </div>
              </div>

              {/* A cobrança que veio na nota manda: cada duplicata vira uma
                  conta a pagar com o vencimento declarado. */}
              {duplicatas.length > 0 ? (
                <div className="rounded-md border p-3">
                  <p className="text-sm font-medium">Cobrança informada na nota</p>
                  <p className="mb-2 text-xs text-muted-foreground">
                    {duplicatas.length === 1
                      ? "Será criada 1 conta a pagar em Lançamentos."
                      : `Serão criadas ${duplicatas.length} contas a pagar em Lançamentos, uma por duplicata.`}
                  </p>
                  <ul className="divide-y text-sm">
                    {duplicatas.map((d, i) => (
                      <li key={i} className="flex items-center justify-between py-1.5">
                        <span className="text-muted-foreground">
                          Parcela {i + 1}/{duplicatas.length}
                        </span>
                        <span className="flex items-center gap-4">
                          <span>{format(d.vencimento, "dd/MM/yyyy", { locale: ptBR })}</span>
                          <span className="w-24 text-right font-medium tabular-nums">{formatBRL(d.valor)}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="flex items-center justify-between rounded-md border p-3">
                  <div>
                    <p className="text-sm font-medium">A nota não informou cobrança</p>
                    <p className="text-xs text-muted-foreground">
                      Será criada uma conta a pagar de {formatBRL(nfe.totals.invoice)}, com vencimento na emissão.
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant={paid ? "default" : "outline"}
                    onClick={() => setPaid((p) => !p)}
                  >
                    {paid ? "Já foi paga" : "Marcar como paga"}
                  </Button>
                </div>
              )}

              <div className="space-y-1.5">
                <Label className="text-xs">Observações</Label>
                <Textarea rows={2} className="resize-none" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </div>
          )}
        </ScrollArea>

        <div className="flex items-center justify-between border-t pt-3">
          <Badge variant="secondary">
            {vinculados} de {nfe.items.length} {nfe.items.length === 1 ? "item vinculado" : "itens vinculados"}
          </Badge>
          <div className="flex gap-2">
            {passo > 1 && (
              <Button type="button" variant="outline" onClick={() => setPasso((p) => p - 1)}>
                Voltar
              </Button>
            )}
            {passo < PASSOS.length ? (
              <Button type="button" onClick={() => setPasso((p) => p + 1)}>Continuar</Button>
            ) : (
              <Button type="button" onClick={confirmar} disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PackagePlus className="mr-2 h-4 w-4" />}
                Confirmar entrada
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
