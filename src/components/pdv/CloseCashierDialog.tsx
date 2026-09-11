import { useState, useMemo, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  AlertCircle,
  CheckCircle2,
  Banknote,
  Bike,
  CreditCard,
  Smartphone,
  Ticket,
  Globe,
  MoreHorizontal,
  UserCheck,
  Loader2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatBRL } from "@/lib/format";
import { usePDVCashier, type CloseCashierPayload } from "@/hooks/use-pdv-cashier";
import { toast } from "sonner";

export interface CashMovement {
  id: string;
  type: string;
  amount: number;
  payment_method?: string | null;
  description: string | null;
  created_at: string;
  discount_reason?: string | null;
  discount_authorized_by?: string | null;
  source?: string | null;
  comanda_id?: string | null;
}

export interface PrintCashierReportParams {
  session: any;
  movements: CashMovement[];
  closingBalance: number;
  notes: string;
  riskLevel: RiskLevel;
}

interface CloseCashierDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClose: (payload: Omit<CloseCashierPayload, "sessionId">) => void;
  isClosing: boolean;
  session: any;
  movements?: CashMovement[];
}

type RiskLevel = "ok" | "low" | "medium" | "high" | "critical";

const MIN_JUSTIFICATION_LENGTH = 10;
const TOL = 0.005; // tolerância para considerar diferença zero

function getRiskLevel(difference: number): RiskLevel {
  const absDiff = Math.abs(difference);
  if (absDiff <= 5) return "ok";
  if (absDiff <= 50) return "low";
  if (absDiff <= 100) return "medium";
  if (absDiff <= 200) return "high";
  return "critical";
}

function getRiskConfig(riskLevel: RiskLevel) {
  const configs = {
    ok: {
      icon: ShieldCheck,
      label: "Saldo Confere",
      color: "text-green-600",
      bgColor: "bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-900",
      description: "Não há divergência significativa.",
    },
    low: {
      icon: AlertCircle,
      label: "Divergência Baixa",
      color: "text-yellow-600",
      bgColor: "bg-yellow-50 border-yellow-200 dark:bg-yellow-950/20 dark:border-yellow-900",
      description: "Justificativa obrigatória para registrar a diferença.",
    },
    medium: {
      icon: AlertTriangle,
      label: "Divergência Média",
      color: "text-orange-600",
      bgColor: "bg-orange-50 border-orange-200 dark:bg-orange-950/20 dark:border-orange-900",
      description: "Requer justificativa detalhada.",
    },
    high: {
      icon: ShieldAlert,
      label: "Divergência Alta",
      color: "text-red-600",
      bgColor: "bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-900",
      description: "Requer justificativa detalhada e atenção.",
    },
    critical: {
      icon: ShieldX,
      label: "Divergência Crítica",
      color: "text-red-700",
      bgColor: "bg-red-100 border-red-300 dark:bg-red-950/30 dark:border-red-800",
      description: "Fechamento bloqueado. Contate um supervisor.",
    },
  };
  return configs[riskLevel];
}

function diffStatus(diff: number): "ok" | "surplus" | "shortage" {
  if (Math.abs(diff) <= TOL) return "ok";
  return diff > 0 ? "surplus" : "shortage";
}

function DiffBadge({ diff }: { diff: number }) {
  const s = diffStatus(diff);
  if (s === "ok") {
    return (
      <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
        <CheckCircle2 className="h-3.5 w-3.5" /> Sem diferença
      </span>
    );
  }
  if (s === "surplus") {
    return (
      <span className="flex items-center gap-1 text-xs text-orange-600 font-medium">
        <AlertTriangle className="h-3.5 w-3.5" /> Sobra +{formatBRL(diff)}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-xs text-destructive font-medium">
      <AlertCircle className="h-3.5 w-3.5" /> Falta {formatBRL(diff)}
    </span>
  );
}

export async function printCashierReport(params: PrintCashierReportParams) {
  const { session, movements, closingBalance: finalBalance, notes: finalNotes, riskLevel: finalRisk } = params;

  const openedAt = session?.opened_at
    ? format(new Date(session.opened_at), "dd/MM/yyyy HH:mm", { locale: ptBR })
    : "—";
  const closedAt = session?.closed_at
    ? format(new Date(session.closed_at), "dd/MM/yyyy HH:mm", { locale: ptBR })
    : format(new Date(), "dd/MM/yyyy HH:mm", { locale: ptBR });

  const openingBal = Number(session?.opening_balance) || 0;
  const totalCash = Number(session?.total_cash) || 0;
  const totalCredit = Number(session?.total_credit) || 0;
  const totalDebit = Number(session?.total_debit) || 0;
  const totalPix = Number(session?.total_pix) || 0;
  const totalVoucher = Number(session?.total_voucher) || 0;
  const totalWithdrawals = Number(session?.total_withdrawals) || 0;
  const totalSales = Number(session?.total_sales) || 0;
  const totalOnlineDelivery = Number(session?.total_online_delivery) || 0;
  const totalFiado = Number((session as any)?.total_fiado) || 0;

  const totalReinforcements = movements
    .filter((m) => m.type === "reforco")
    .reduce((acc, m) => acc + m.amount, 0);

  const expectedCash = openingBal + totalCash + totalReinforcements - totalWithdrawals;
  const cashDiff = finalBalance - expectedCash;

  const declaredCredit = session?.declared_credit;
  const declaredDebit = session?.declared_debit;
  const declaredPix = session?.declared_pix;
  const declaredVoucher = session?.declared_voucher;
  const declaredOnline = session?.declared_online_delivery;
  const declaredFiado = (session as any)?.declared_fiado;

  const conferenceRows: Array<[string, number, number | null]> = [
    ["Crédito", totalCredit, declaredCredit],
    ["Débito", totalDebit, declaredDebit],
    ["PIX", totalPix, declaredPix],
    ["Vale-refeição", totalVoucher, declaredVoucher],
    ["Online (Delivery)", totalOnlineDelivery, declaredOnline],
    ["Vendas a Prazo", totalFiado, declaredFiado],
  ];

  // Tolerância do papel. Diferente do TOL da tela (meio centavo): na conferência
  // física, centavos de troco não são divergência que mereça justificativa.
  const PRINT_TOL = 0.5;

  // Composição das vendas por forma. Antes o total do sistema aparecia sozinho,
  // sem como o conferente somar de cima para baixo e chegar nele.
  const salesRows: Array<[string, number]> = [
    ["Dinheiro", totalCash],
    ["Crédito", totalCredit],
    ["Débito", totalDebit],
    ["PIX", totalPix],
    ["Vale-refeição", totalVoucher],
    ["Online (Delivery)", totalOnlineDelivery],
    ["Vendas a Prazo", totalFiado],
    ["Outros", Number((session as any)?.total_other) || 0],
  ].filter(([, v]) => (v as number) > 0) as Array<[string, number]>;

  const breakdownSum = salesRows.reduce((acc, [, v]) => acc + v, 0);

  const salesBreakdownHtml = salesRows
    .map(([label, v]) => {
      const pct = totalSales > 0 ? (v / totalSales) * 100 : 0;
      return `<div class="row"><span>${label} <small>(${pct.toFixed(0)}%)</small></span><span>${formatBRL(v)}</span></div>`;
    })
    .join("");

  // Inclui o dinheiro na conferência: ele é a forma mais sujeita a diferença e
  // ficava fora desta tabela, só no resumo da gaveta.
  const allConferenceRows: Array<[string, number, number | null]> = [
    ["Dinheiro", expectedCash, finalBalance],
    ...conferenceRows,
  ];

  const visibleRows = allConferenceRows.filter(
    ([, expected, declared]) => expected > 0 || (declared != null && declared > 0),
  );

  // Soma das diferenças. Três formas com R$ 5 de furo cada não aparecem em
  // lugar nenhum hoje — só o total revela.
  const totalDiff = visibleRows.reduce(
    (acc, [, expected, declared]) => acc + (declared != null ? declared - expected : 0),
    0,
  );
  const divergentCount = visibleRows.filter(
    ([, expected, declared]) => declared != null && Math.abs(declared - expected) > PRINT_TOL,
  ).length;

  const conferenceHtml = visibleRows.length
    ? `<table class="conf">
    <tr>
      <th>Forma</th><th class="num">Esperado</th><th class="num">Apurado</th><th class="num">Dif.</th>
    </tr>
    ${visibleRows
      .map(([label, expected, declared]) => {
        const d = declared != null ? declared - expected : null;
        const flag =
          d == null ? "—" : Math.abs(d) <= PRINT_TOL ? "OK" : `${d > 0 ? "+" : ""}${formatBRL(d)}`;
        return `<tr>
        <td>${label}</td>
        <td class="num">${formatBRL(expected)}</td>
        <td class="num">${declared != null ? formatBRL(declared) : "—"}</td>
        <td class="num flag">${flag}</td>
      </tr>`;
      })
      .join("")}
    <tr class="sum">
      <td>DIFERENÇA TOTAL</td>
      <td class="num"></td>
      <td class="num"></td>
      <td class="num">${totalDiff > 0 ? "+" : ""}${formatBRL(totalDiff)}</td>
    </tr>
  </table>
  ${divergentCount > 0
      ? `<div class="row muted"><span>${divergentCount} forma(s) fora da tolerância de ${formatBRL(PRINT_TOL)}</span><span></span></div>`
      : ""}`
    : "";

  // Nome da loja, quem abriu e quem fechou, e quantas vendas. Nada disso vinha
  // no papel — e num documento cuja função é responsabilizar alguém pela gaveta,
  // não ter o nome do operador é a falha mais séria.
  let businessName = "";
  let openedByName = "";
  let closedByName = "";
  let salesCount = 0;
  try {
    const ids = [session?.opened_by_user_id, session?.closed_by_user_id].filter(Boolean);
    const [{ data: biz }, { data: people }, { count }] = await Promise.all([
      supabase.from("business_settings").select("business_name").eq("user_id", session.user_id).maybeSingle(),
      ids.length
        ? supabase.from("profiles").select("id, full_name").in("id", ids as string[])
        : Promise.resolve({ data: [] as any[] }),
      session?.id
        ? supabase
            .from("pdv_orders")
            .select("id", { count: "exact", head: true })
            .eq("cashier_session_id", session.id)
        : Promise.resolve({ count: 0 }),
    ]);
    businessName = biz?.business_name ?? "";
    const nameOf = (id: string | null | undefined) =>
      (people ?? []).find((p: any) => p.id === id)?.full_name ?? "";
    openedByName = nameOf(session?.opened_by_user_id);
    closedByName = nameOf(session?.closed_by_user_id);
    salesCount = count ?? 0;
  } catch {
    // O demonstrativo sai mesmo sem esses complementos.
  }

  // Busca apenas despesas financeiras vinculadas à sessão (cancelamentos e descontos ficam no demonstrativo digital).
  let expenses: Array<{ description: string; amount: number }> = [];
  if (session?.id) {
    try {
      const { data: expData } = await supabase
        .from("pdv_financial_transactions")
        .select("description,amount,payment_date")
        .eq("user_id", session.user_id)
        .eq("transaction_type", "expense")
        .eq("status", "paid")
        .gte("payment_date", session.opened_at.slice(0, 10))
        .lte("payment_date", (session.closed_at || new Date().toISOString()).slice(0, 10))
        .order("payment_date", { ascending: true });
      expenses = (expData || []).map((r: any) => ({
        description: r.description || "Despesa",
        amount: Number(r.amount) || 0,
      }));
    } catch {
      // segue impressão sem despesas
    }
  }

  const expensesTotal = expenses.reduce((a, e) => a + e.amount, 0);

  // Cancelamentos e Descontos por sessão
  let cancelledOrders: Array<{ num: number | string | null; amount: number; reason: string | null }> = [];
  let discountedOrders: Array<{ num: number | null; discount: number; origem?: string }> = [];
  if (session?.id) {
    try {
      // Cancelado sem caixa aberto não tem sessão, e sair só por
      // `cashier_session_id` deixava esses de fora da comanda impressa. No
      // Kōten Garibaldi eram 15 de 48. Aqui eles entram pela HORA do
      // cancelamento, dentro da janela desta sessão.
      const inicioSessao = session.opened_at;
      const fimSessao = session.closed_at || new Date().toISOString();

      const [
        { data: cancelPdv }, { data: cancelDel }, { data: cancelComanda },
        { data: cancelPdvSemSessao }, { data: cancelDelSemSessao }, { data: cancelComandaSemSessao },
        { data: discPdv }, { data: discDel },
      ] = await Promise.all([
        supabase.from("pdv_orders").select("order_number,subtotal,cancellation_reason").eq("cashier_session_id", session.id).eq("status", "cancelled"),
        supabase.from("delivery_orders").select("order_number,subtotal,total,cancellation_reason").eq("cashier_session_id", session.id).eq("status", "cancelled"),
        // Cancelamento de comanda de salão nunca chega a virar pdv_orders — a
        // mesa/comanda cancela direto em pdv_comandas, então sem esta consulta
        // esses cancelamentos somem do fechamento (ficavam só no "salão", não
        // no papel entregue ao conferente).
        supabase.from("pdv_comandas").select("comanda_number,subtotal,cancellation_reason").eq("cashier_session_id", session.id).eq("status", "cancelada"),
        supabase.from("pdv_orders").select("order_number,subtotal,cancellation_reason")
          .eq("user_id", session.user_id).is("cashier_session_id", null).eq("status", "cancelled")
          .gte("cancelled_at", inicioSessao).lte("cancelled_at", fimSessao),
        supabase.from("delivery_orders").select("order_number,subtotal,total,cancellation_reason")
          .eq("user_id", session.user_id).is("cashier_session_id", null).eq("status", "cancelled")
          .gte("cancelled_at", inicioSessao).lte("cancelled_at", fimSessao),
        supabase.from("pdv_comandas").select("comanda_number,subtotal,cancellation_reason")
          .eq("user_id", session.user_id).is("cashier_session_id", null).eq("status", "cancelada")
          .gte("cancelled_at", inicioSessao).lte("cancelled_at", fimSessao),
        supabase.from("pdv_orders").select("order_number,discount").eq("cashier_session_id", session.id).neq("status", "cancelled").gt("discount", 0),
        supabase.from("delivery_orders").select("order_number,discount,discount_source").eq("cashier_session_id", session.id).neq("status", "cancelled").gt("discount", 0),
      ]);
      cancelledOrders = [
        ...(cancelPdv || []).map((o: any) => ({ num: o.order_number, amount: Number(o.subtotal || 0), reason: o.cancellation_reason })),
        ...(cancelDel || []).map((o: any) => ({ num: o.order_number, amount: Number(o.subtotal || o.total || 0), reason: o.cancellation_reason })),
        ...(cancelComanda || []).map((o: any) => ({ num: o.comanda_number, amount: Number(o.subtotal || 0), reason: o.cancellation_reason })),
        ...(cancelPdvSemSessao || []).map((o: any) => ({ num: o.order_number, amount: Number(o.subtotal || 0), reason: o.cancellation_reason })),
        ...(cancelDelSemSessao || []).map((o: any) => ({ num: o.order_number, amount: Number(o.subtotal || o.total || 0), reason: o.cancellation_reason })),
        ...(cancelComandaSemSessao || []).map((o: any) => ({ num: o.comanda_number, amount: Number(o.subtotal || 0), reason: o.cancellation_reason })),
      ];
      discountedOrders = [
        ...(discPdv || []).map((o: any) => ({ num: o.order_number, discount: Number(o.discount || 0) })),
        // A origem só existe no delivery: é lá que o resgate de fidelidade
        // vira desconto. No salão, desconto continua sendo autorizado na mão.
        ...(discDel || []).map((o: any) => ({
          num: o.order_number,
          discount: Number(o.discount || 0),
          origem: o.discount_source === "loyalty_prize" ? "prêmio" : undefined,
        })),
      ];
    } catch {
      // segue sem esses dados
    }
  }
  const cancTotal = cancelledOrders.reduce((a, o) => a + o.amount, 0);
  const discTotal = discountedOrders.reduce((a, o) => a + o.discount, 0);

  const reinforcementItems = movements.filter((m) => m.type === "reforco");
  const withdrawalItems = movements.filter((m) => m.type === "sangria");
  const reinforcementsTotal = reinforcementItems.reduce((a, m) => a + m.amount, 0);
  const withdrawalsTotal = withdrawalItems.reduce((a, m) => a + m.amount, 0);

  const reinforcementsHtml = `<div class="divider"></div>
<div class="section">
  <div class="section-title">REFORÇOS (ENTRADAS)</div>
  <div class="row total"><span>${reinforcementItems.length} entrada${reinforcementItems.length !== 1 ? "s" : ""}</span><span>+ ${formatBRL(reinforcementsTotal)}</span></div>
  ${reinforcementItems.map((m) => `<div class="row"><span>${format(new Date(m.created_at), "HH:mm", { locale: ptBR })} — ${m.description || "Reforço"}</span><span>${formatBRL(m.amount)}</span></div>`).join("")}
</div>`;

  const withdrawalsHtml = `<div class="divider"></div>
<div class="section">
  <div class="section-title">SANGRIAS (SAÍDAS)</div>
  <div class="row total"><span>${withdrawalItems.length} saída${withdrawalItems.length !== 1 ? "s" : ""}</span><span>- ${formatBRL(withdrawalsTotal)}</span></div>
  ${withdrawalItems.map((m) => `<div class="row"><span>${format(new Date(m.created_at), "HH:mm", { locale: ptBR })} — ${m.description || "Sangria"}</span><span>${formatBRL(m.amount)}</span></div>`).join("")}
</div>`;

  const cancellationsHtml = `<div class="divider"></div>
<div class="section">
  <div class="section-title">CANCELAMENTOS</div>
  <div class="row total"><span>${cancelledOrders.length} cancelamento${cancelledOrders.length !== 1 ? "s" : ""}${totalSales > 0 && cancTotal > 0 ? ` <small>(${((cancTotal / totalSales) * 100).toFixed(1)}% das vendas)</small>` : ""}</span><span>${cancelledOrders.length > 0 ? `- ${formatBRL(cancTotal)}` : "R$ 0,00"}</span></div>
  ${cancelledOrders.map((o) => `<div class="row"><span>#${o.num ?? "—"}${o.reason ? ` — ${String(o.reason).slice(0, 30)}` : ""}</span><span>${formatBRL(o.amount)}</span></div>`).join("")}
</div>`;

  const discountsHtml = `<div class="divider"></div>
<div class="section">
  <div class="section-title">DESCONTOS CONCEDIDOS</div>
  <div class="row total"><span>${discountedOrders.length} pedido${discountedOrders.length !== 1 ? "s" : ""}${totalSales > 0 && discTotal > 0 ? ` <small>(${((discTotal / totalSales) * 100).toFixed(1)}% das vendas)</small>` : ""}</span><span>${discountedOrders.length > 0 ? `- ${formatBRL(discTotal)}` : "R$ 0,00"}</span></div>
  ${discountedOrders.map((o) => `<div class="row"><span>#${o.num ?? "—"}${o.origem ? ` <small>(${o.origem})</small>` : ""}</span><span>- ${formatBRL(o.discount)}</span></div>`).join("")}
</div>`;

  const expensesHtml = expenses.length
    ? `<div class="divider"></div>
<div class="section">
  <div class="section-title">DESPESAS</div>
  <div class="row total"><span>${expenses.length} despesa${expenses.length > 1 ? "s" : ""}</span><span>- ${formatBRL(expensesTotal)}</span></div>
  ${expenses.map((e) => `<div class="row"><span>${String(e.description).slice(0, 45)}</span><span>${formatBRL(e.amount)}</span></div>`).join("")}
  <div class="row"><span style="font-size:11px;opacity:0.65">* Já descontadas do saldo da gaveta</span></div>
</div>`
    : "";

  const riskLabels: Record<RiskLevel, string> = {
    ok: "OK", low: "Baixo", medium: "Médio", high: "Alto", critical: "Crítico",
  };


  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Demonstrativo de Caixa</title>
<style>
  @page { size: 80mm auto; margin: 4mm; }
  * { color: #000 !important; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 13px; color: #000; margin: 0; padding: 8px; line-height: 1.35; -webkit-print-color-adjust: exact; }
  h1 { font-size: 16px; font-weight: 800; text-align: center; margin: 0 0 2px; border-top: 2px solid #000; border-bottom: 2px solid #000; padding: 6px 0; letter-spacing: 0.3px; }
  .subtitle { text-align: center; font-size: 12px; font-weight: 700; margin: 4px 0 8px; }
  .section { margin: 8px 0; }
  .section-title { font-weight: 800; font-size: 13px; border-bottom: 1.5px solid #000; padding-bottom: 3px; margin-bottom: 5px; text-transform: uppercase; }
  .row { display: flex; justify-content: space-between; gap: 8px; font-size: 13px; padding: 2px 0; }
  /* Dígito de largura fixa: sem isso as colunas de valor dançam a cada linha e
     o conferente perde a régua vertical para somar de cima para baixo. */
  .row > span:last-child { font-weight: 700; text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .row.total { font-weight: 800; font-size: 14px; border-top: 1.5px solid #000; padding-top: 5px; margin-top: 5px; }
  .row.muted > span { font-weight: 400; font-size: 12px; }
  .divider { border-top: 2px solid #000; margin: 7px 0; }
  /* Caixa do número que o operador precisa enxergar de longe. */
  .highlight { border: 2px solid #000; padding: 6px 8px; margin: 6px 0; }
  .highlight .label { font-size: 11px; font-weight: 700; text-transform: uppercase; }
  .highlight .value { font-size: 20px; font-weight: 800; text-align: right; font-variant-numeric: tabular-nums; line-height: 1.1; }
  .highlight.alert { border-width: 3px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 11px; font-weight: 800; border-bottom: 1.5px solid #000; padding: 3px 6px; text-transform: uppercase; }
  /* Conferência em 4 colunas: forma, esperado, apurado, diferença. Antes era
     tudo numa linha de texto corrido, que quebrava na bobina de 80mm. */
  table.conf { font-size: 12px; }
  table.conf th, table.conf td { padding: 3px 2px; }
  table.conf td { border-bottom: 1px dotted #999; }
  table.conf td.num, table.conf th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  table.conf tr.sum td { border-top: 1.5px solid #000; border-bottom: none; font-weight: 800; font-size: 13px; padding-top: 5px; }
  .flag { font-weight: 800; }
  .sign { margin-top: 18px; display: flex; gap: 10px; }
  .sign > div { flex: 1; text-align: center; font-size: 10px; border-top: 1px solid #000; padding-top: 3px; }
  .footer { text-align: center; font-size: 11px; margin-top: 12px; border-top: 2px solid #000; padding-top: 6px; font-weight: 600; }
  .risk-badge { display: inline-block; padding: 3px 10px; font-weight: 800; font-size: 12px; border: 2px solid #000; margin-top: 4px; text-transform: uppercase; }
  .criteria { font-size: 10px; text-align: center; margin-top: 3px; }
</style></head><body>
<h1>DEMONSTRATIVO DE CAIXA</h1>
${businessName ? `<div class="subtitle">${businessName}</div>` : ""}
<div class="section">
  <div class="row"><span>Abertura:</span><span>${openedAt}</span></div>
  <div class="row"><span>Fechamento:</span><span>${closedAt}</span></div>
  ${openedByName ? `<div class="row"><span>Aberto por:</span><span>${openedByName}</span></div>` : ""}
  ${closedByName ? `<div class="row"><span>Fechado por:</span><span>${closedByName}</span></div>` : ""}
</div>
<div class="divider"></div>
<div class="section">
  <div class="section-title">RESUMO DA GAVETA (DINHEIRO)</div>
  <div class="row"><span>Saldo Inicial:</span><span>${formatBRL(openingBal)}</span></div>
  <div class="row"><span>Vendas em dinheiro:</span><span>+ ${formatBRL(totalCash)}</span></div>
  <div class="row"><span>Reforços:</span><span>+ ${formatBRL(totalReinforcements)}</span></div>
  <div class="row"><span>Sangrias:</span><span>- ${formatBRL(totalWithdrawals)}</span></div>
  <div class="row total"><span>Esperado na gaveta:</span><span>${formatBRL(expectedCash)}</span></div>
  <div class="row total"><span>Contado pelo operador:</span><span>${formatBRL(finalBalance)}</span></div>
</div>
<div class="highlight${Math.abs(cashDiff) > PRINT_TOL ? " alert" : ""}">
  <div class="label">Diferença na gaveta ${Math.abs(cashDiff) <= PRINT_TOL ? "· confere" : cashDiff > 0 ? "· sobra" : "· falta"}</div>
  <div class="value">${cashDiff > 0 ? "+" : ""}${formatBRL(cashDiff)}</div>
</div>
${conferenceHtml ? `<div class="divider"></div>
<div class="section">
  <div class="section-title">CONFERÊNCIA POR FORMA</div>
  ${conferenceHtml}
</div>` : ""}
<div class="divider"></div>
<div class="section">
  <div class="section-title">Composição das vendas</div>
  ${salesBreakdownHtml}
  <div class="row total"><span>Total de Vendas (sistema):</span><span>${formatBRL(totalSales)}</span></div>
  ${Math.abs(breakdownSum - totalSales) > PRINT_TOL
    ? `<div class="row muted"><span>Não classificado por forma:</span><span>${formatBRL(totalSales - breakdownSum)}</span></div>`
    : ""}
  ${salesCount > 0
    ? `<div class="row muted"><span>${salesCount} venda(s) · ticket médio</span><span>${formatBRL(totalSales / salesCount)}</span></div>`
    : ""}
</div>
${reinforcementsHtml}
${withdrawalsHtml}
${expensesHtml}
${cancellationsHtml}
${discountsHtml}
${finalNotes ? `
<div class="divider"></div>
<div class="section">
  <div class="section-title">OBSERVAÇÕES / JUSTIFICATIVA</div>
  <p style="font-size:12px;margin:4px 0;font-weight:600">${finalNotes}</p>
</div>` : ""}
<div class="section" style="text-align:center;margin-top:8px">
  <span class="risk-badge">Risco: ${riskLabels[finalRisk]}</span>
  <div class="criteria">Classificação pela diferença na gaveta: ate R$ 5 confere · ate R$ 50 baixo · ate R$ 100 medio · ate R$ 200 alto</div>
</div>
<div class="sign">
  <div>Operador${closedByName ? `<br/>${closedByName}` : ""}</div>
  <div>Conferente</div>
</div>
<div class="footer">Documento gerado automaticamente<br/>${closedAt}</div>
</body></html>`;

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "none";
  iframe.style.left = "-9999px";
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (doc) {
    doc.open();
    doc.write(html);
    doc.close();
    setTimeout(() => {
      iframe.contentWindow?.print();
      setTimeout(() => document.body.removeChild(iframe), 1000);
    }, 300);
  }
}


interface MethodConferenceProps {
  icon: typeof CreditCard;
  label: string;
  expected: number;
  declared: string;
  onChange: (v: string) => void;
}

function MethodConference({
  icon: Icon,
  label,
  expected,
  declared,
  onChange,
}: MethodConferenceProps) {
  const declaredNum = parseFloat(declared);
  const hasDeclared = declared !== "" && !isNaN(declaredNum);
  const diff = hasDeclared ? declaredNum - expected : 0;
  const hasDivergence = hasDeclared && Math.abs(diff) > TOL;

  return (
    <Card className={cn("border", hasDivergence && "border-orange-300 dark:border-orange-900")}>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-sm font-medium truncate">{label}</span>
          </div>
          {hasDeclared && <DiffBadge diff={diff} />}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Esperado (sistema)</Label>
            <div className="h-9 px-3 flex items-center text-sm font-medium tabular-nums rounded-md border bg-muted/30">
              {formatBRL(expected)}
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Valor apurado</Label>
            <CurrencyInput value={declared} onChange={onChange} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}



type Step = "blind" | "review" | "done";

const MIN_REVIEW_JUSTIFICATION = 10;

interface BlindInputProps {
  icon: typeof CreditCard;
  label: string;
  value: string;
  onChange: (v: string) => void;
}

function BlindInput({ icon: Icon, label, value, onChange }: BlindInputProps) {
  return (
    <Card>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
          <Label className="text-sm font-medium truncate">{label}</Label>
        </div>
        <CurrencyInput value={value} onChange={onChange} />
      </CardContent>
    </Card>
  );
}

interface ReviewRowProps {
  label: string;
  icon: typeof CreditCard;
  expected: number;
  declared: number;
  justification: string;
  onJustificationChange: (v: string) => void;
}

function ReviewRow({ label, icon: Icon, expected, declared, justification, onJustificationChange }: ReviewRowProps) {
  const diff = declared - expected;
  const hasDiff = Math.abs(diff) > TOL;
  const justOk = justification.trim().length >= MIN_REVIEW_JUSTIFICATION;

  return (
    <Card className={cn("border", hasDiff && "border-orange-300 dark:border-orange-900")}>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-sm font-medium truncate">{label}</span>
          </div>
          <DiffBadge diff={diff} />
        </div>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="space-y-0.5">
            <span className="text-muted-foreground">Esperado</span>
            <div className="font-medium tabular-nums">{formatBRL(expected)}</div>
          </div>
          <div className="space-y-0.5">
            <span className="text-muted-foreground">Apurado</span>
            <div className="font-medium tabular-nums">{formatBRL(declared)}</div>
          </div>
          <div className="space-y-0.5">
            <span className="text-muted-foreground">Diferença</span>
            <div className={cn("font-medium tabular-nums", hasDiff && (diff > 0 ? "text-orange-600" : "text-destructive"))}>
              {diff >= 0 ? "+" : ""}{formatBRL(diff)}
            </div>
          </div>
        </div>
        {hasDiff && (
          <div className="space-y-1 pt-1">
            <Label className="text-xs">
              Justificativa* ({justification.trim().length}/{MIN_REVIEW_JUSTIFICATION})
            </Label>
            <Textarea
              rows={2}
              placeholder="Explique o motivo da diferença (mínimo 30 caracteres)..."
              value={justification}
              onChange={(e) => onJustificationChange(e.target.value)}
              className={cn(!justOk && "border-orange-400 focus-visible:ring-orange-400")}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function CloseCashierDialog({
  open,
  onOpenChange,
  onClose,
  isClosing,
  session,
  movements = [],
}: CloseCashierDialogProps) {
  const deliveryCashMovements = movements.filter(
    (m) => m.source === "delivery" && m.payment_method === "dinheiro" && m.type === "venda"
  );
  const totalDeliveryCash = deliveryCashMovements.reduce((s, m) => s + Number(m.amount), 0);

  const [step, setStep] = useState<Step>("blind");

  // Etapa 1 — apuração às cegas
  const [declaredCash, setDeclaredCash] = useState("");
  const [declaredCredit, setDeclaredCredit] = useState("");
  const [declaredDebit, setDeclaredDebit] = useState("");
  const [declaredPix, setDeclaredPix] = useState("");
  const [declaredVoucher, setDeclaredVoucher] = useState("");
  
  
  const [declaredFiado, setDeclaredFiado] = useState("");

  // Etapa 2 — justificativas por meio
  const [justCash, setJustCash] = useState("");
  const [justCredit, setJustCredit] = useState("");
  const [justDebit, setJustDebit] = useState("");
  const [justPix, setJustPix] = useState("");
  const [justVoucher, setJustVoucher] = useState("");
  const [justOnline, setJustOnline] = useState("");
  const [justOther, setJustOther] = useState("");
  const [justFiado, setJustFiado] = useState("");
  const [notes, setNotes] = useState("");

  const queryClient = useQueryClient();
  const { submitBlindClosing, isSubmittingBlind } = usePDVCashier();

  // Manager auth states (stale snapshot detection)
  const [needsManagerAuth, setNeedsManagerAuth] = useState(false);
  const [managerPassword, setManagerPassword] = useState("");
  const [isVerifyingManager, setIsVerifyingManager] = useState(false);
  const [snapshotId, setSnapshotId] = useState<string | null>(null);

  const draftSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset on close — preserva step e declared* para retomar de onde parou
  useEffect(() => {
    if (!open) {
      setJustCash(""); setJustCredit(""); setJustDebit(""); setJustPix("");
      setJustVoucher(""); setJustOnline(""); setJustOther(""); setJustFiado(""); setNotes("");
      setNeedsManagerAuth(false);
      setManagerPassword("");
      setSnapshotId(null);
    }
  }, [open]);

  // Auto-save debounced do rascunho cross-device no banco
  useEffect(() => {
    if (!open || !session?.id || step !== "blind") return;
    if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);
    draftSaveTimerRef.current = setTimeout(async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        await supabase
          .from("pdv_cashier_close_drafts")
          .upsert({
            cashier_session_id: session.id,
            user_id: user.id,
            declared_cash:    parseFloat(declaredCash)    || null,
            declared_credit:  parseFloat(declaredCredit)  || null,
            declared_debit:   parseFloat(declaredDebit)   || null,
            declared_pix:     parseFloat(declaredPix)     || null,
            declared_voucher: parseFloat(declaredVoucher) || null,
            declared_fiado:   parseFloat(declaredFiado)   || null,
            updated_at: new Date().toISOString(),
          }, { onConflict: "cashier_session_id" });
      } catch {}
    }, 1500);
    return () => { if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current); };
  }, [open, session?.id, step, declaredCash, declaredCredit, declaredDebit, declaredPix, declaredVoucher, declaredFiado]);

  // Ao abrir, recalcula totais e verifica se já existe snapshot da Etapa 1
  useEffect(() => {
    if (!open || !session?.id) return;
    (async () => {
      await supabase.rpc("pdv_recompute_session_totals", { p_session_id: session.id });
      queryClient.invalidateQueries({ queryKey: ["pdv-cashier-active"] });
      queryClient.invalidateQueries({ queryKey: ["pdv-cashier-movements"] });

      const { data: snap } = await supabase
        .from("pdv_cashier_close_blind_snapshots")
        .select("id, created_at, declared_cash, declared_credit, declared_debit, declared_pix, declared_voucher, declared_online_delivery, declared_other, declared_fiado")
        .eq("cashier_session_id", session.id)
        .maybeSingle();

      if (snap) {
        const hasNewMovements = movements.some(
          (m) => new Date(m.created_at) > new Date((snap as any).created_at)
        );

        if (hasNewMovements) {
          setSnapshotId((snap as any).id);
          setNeedsManagerAuth(true);
        } else {
          const toStr = (v: any) => (v == null ? "" : String(Number(v)));
          setDeclaredCash(toStr(snap.declared_cash));
          setDeclaredCredit(toStr(snap.declared_credit));
          setDeclaredDebit(toStr(snap.declared_debit));
          setDeclaredPix(toStr(snap.declared_pix));
          setDeclaredVoucher(toStr(snap.declared_voucher));
          setDeclaredFiado(toStr((snap as any).declared_fiado));
          setStep("review");
        }
      } else {
        // Sem snapshot committed: restaurar rascunho cross-device do banco
        const { data: draft } = await supabase
          .from("pdv_cashier_close_drafts")
          .select("declared_cash, declared_credit, declared_debit, declared_pix, declared_voucher, declared_fiado")
          .eq("cashier_session_id", session.id)
          .maybeSingle();
        if (draft) {
          const toStr = (v: any) => (v == null ? "" : String(Number(v)));
          setDeclaredCash(toStr(draft.declared_cash));
          setDeclaredCredit(toStr(draft.declared_credit));
          setDeclaredDebit(toStr(draft.declared_debit));
          setDeclaredPix(toStr(draft.declared_pix));
          setDeclaredVoucher(toStr(draft.declared_voucher));
          setDeclaredFiado(toStr(draft.declared_fiado));
        }
      }
    })();
  }, [open, session?.id, queryClient]);

  const openingBalance = Number(session?.opening_balance) || 0;
  const totalCash = Number(session?.total_cash) || 0;
  const totalCredit = Number(session?.total_credit) || 0;
  const totalDebit = Number(session?.total_debit) || 0;
  const totalPix = Number(session?.total_pix) || 0;
  const totalVoucher = Number(session?.total_voucher) || 0;
  const totalWithdrawals = Number(session?.total_withdrawals) || 0;
  const totalOnlineDelivery = Number(session?.total_online_delivery) || 0;
  const totalFiado = Number((session as any)?.total_fiado) || 0;

  const totalReinforcements = useMemo(
    () => movements.filter((m) => m.type === "reforco").reduce((a, m) => a + m.amount, 0),
    [movements],
  );

  const totalOther = useMemo(() => {
    const sessionOther = Number((session as any)?.total_other);
    if (Number.isFinite(sessionOther) && sessionOther > 0) return sessionOther;
    const known = new Set(["dinheiro", "credito", "debito", "pix", "vale_refeicao", "cartao"]);
    return movements
      .filter((m) => m.type === "venda" && m.payment_method && !known.has(m.payment_method))
      .reduce((a, m) => a + Number(m.amount || 0), 0);
  }, [movements, session]);

  const expectedCash = openingBalance + totalCash + totalReinforcements - totalWithdrawals;

  const parseN = (v: string) => {
    const n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  };

  // Etapa 1 — todos os campos preenchidos?
  const allBlindFilled =
    declaredCash !== "" &&
    declaredCredit !== "" &&
    declaredDebit !== "" &&
    declaredPix !== "" &&
    declaredVoucher !== "" &&
    declaredFiado !== "";

  const blindTotal =
    parseN(declaredCash) + parseN(declaredCredit) + parseN(declaredDebit) +
    parseN(declaredPix) + parseN(declaredVoucher) +
    parseN(declaredFiado);

  const handleSubmitBlind = async () => {
    if (!session?.id || !allBlindFilled) return;
    try {
      await submitBlindClosing({
        sessionId: session.id,
        declaredCash: parseN(declaredCash),
        declaredCredit: parseN(declaredCredit),
        declaredDebit: parseN(declaredDebit),
        declaredPix: parseN(declaredPix),
        declaredVoucher: parseN(declaredVoucher),
        declaredOnlineDelivery: totalOnlineDelivery,
        declaredOther: null,
        declaredFiado: parseN(declaredFiado),
        declaredTotal: blindTotal,
      });
      supabase.from("pdv_cashier_close_drafts").delete().eq("cashier_session_id", session.id);
      setStep("review");
    } catch {
      /* toast handled in mutation */
    }
  };

  // Etapa 2 — rows com diff
  type Row = {
    key: "cash" | "credit" | "debit" | "pix" | "voucher" | "online" | "other" | "fiado";
    label: string;
    icon: typeof CreditCard;
    expected: number;
    declared: number;
    justification: string;
    setJust: (v: string) => void;
  };

  const reviewRows: Row[] = [
    { key: "cash", label: "Dinheiro (gaveta)", icon: Banknote, expected: expectedCash, declared: parseN(declaredCash), justification: justCash, setJust: setJustCash },
    { key: "credit", label: "Cartão de Crédito", icon: CreditCard, expected: totalCredit, declared: parseN(declaredCredit), justification: justCredit, setJust: setJustCredit },
    { key: "debit", label: "Cartão de Débito", icon: CreditCard, expected: totalDebit, declared: parseN(declaredDebit), justification: justDebit, setJust: setJustDebit },
    { key: "pix", label: "PIX", icon: Smartphone, expected: totalPix, declared: parseN(declaredPix), justification: justPix, setJust: setJustPix },
    { key: "voucher", label: "Vale-refeição", icon: Ticket, expected: totalVoucher, declared: parseN(declaredVoucher), justification: justVoucher, setJust: setJustVoucher },
    
    { key: "fiado", label: "Vendas a Prazo", icon: UserCheck, expected: totalFiado, declared: parseN(declaredFiado), justification: justFiado, setJust: setJustFiado },
  ];

  const rowsWithDiff = reviewRows.filter((r) => Math.abs(r.declared - r.expected) > TOL);
  const allJustified = rowsWithDiff.every((r) => r.justification.trim().length >= MIN_REVIEW_JUSTIFICATION);

  const expectedTotal = reviewRows.reduce((a, r) => a + r.expected, 0);
  const declaredTotal = reviewRows.reduce((a, r) => a + r.declared, 0);
  const totalDiff = declaredTotal - expectedTotal;
  const _cashDifference = parseN(declaredCash) - expectedCash;
  const cashRiskLevel = getRiskLevel(totalDiff);
  const cashRiskConfig = getRiskConfig(cashRiskLevel);
  const RiskIcon = cashRiskConfig.icon;

  const closingStatus: "no_difference" | "reconciled_with_mismatch" | "surplus" | "shortage" =
    Math.abs(totalDiff) <= TOL
      ? (rowsWithDiff.length > 0 ? "reconciled_with_mismatch" : "no_difference")
      : (totalDiff > 0 ? "surplus" : "shortage");

  const buildPayload = (): Omit<CloseCashierPayload, "sessionId"> => {
    const parseOpt = (v: string) => (v === "" ? null : parseFloat(v));
    const consolidatedJustification = rowsWithDiff
      .map((r) => `[${r.label}] ${r.justification.trim()}`)
      .join("\n");
    return {
      declaredCash: parseN(declaredCash),
      expectedCash,
      declaredCredit: parseOpt(declaredCredit),
      declaredDebit: parseOpt(declaredDebit),
      declaredPix: parseOpt(declaredPix),
      declaredVoucher: parseOpt(declaredVoucher),
      declaredOnlineDelivery: totalOnlineDelivery,
      declaredOther: null,
      declaredFiado: parseOpt(declaredFiado),
      declaredTotalSales: declaredTotal,
      totalDifference: totalDiff,
      closingStatus,
      closingJustification: consolidatedJustification || null,
      justifications: {
        cash: justCash.trim() || undefined,
        credit: justCredit.trim() || undefined,
        debit: justDebit.trim() || undefined,
        pix: justPix.trim() || undefined,
        voucher: justVoucher.trim() || undefined,
        onlineDelivery: justOnline.trim() || undefined,
        other: justOther.trim() || undefined,
        fiado: justFiado.trim() || undefined,
      },
      notes: notes.trim() || undefined,
      riskLevel: cashRiskLevel,
    };
  };

  const handleManagerAuth = async () => {
    if (!managerPassword) return;
    setIsVerifyingManager(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: users } = await supabase
        .from("establishment_users")
        .select("display_name,discount_password")
        .eq("establishment_owner_id", user?.id || "")
        .eq("is_active", true);

      const manager = (users || []).find((u: any) => u.discount_password === managerPassword);
      if (!manager) {
        toast.error("Senha incorreta");
        setManagerPassword("");
        return;
      }

      if (snapshotId) {
        await supabase
          .from("pdv_cashier_close_blind_snapshots")
          .delete()
          .eq("id", snapshotId);
      }

      setNeedsManagerAuth(false);
      setSnapshotId(null);
      toast.success(`Autorizado por ${manager.display_name}. Reinicie o fechamento.`);
    } finally {
      setIsVerifyingManager(false);
      setManagerPassword("");
    }
  };

  const handleFinalize = () => {
    if (!allJustified) return;
    if (session?.id) supabase.from("pdv_cashier_close_drafts").delete().eq("cashier_session_id", session.id);
    const payload = buildPayload();
    printCashierReport({
      session: {
        ...session,
        declared_credit: payload.declaredCredit,
        declared_debit: payload.declaredDebit,
        declared_pix: payload.declaredPix,
        declared_voucher: payload.declaredVoucher,
        declared_online_delivery: payload.declaredOnlineDelivery,
        declared_fiado: payload.declaredFiado,
      },
      movements,
      closingBalance: parseN(declaredCash),
      notes: notes.trim() || payload.closingJustification || "",
      riskLevel: cashRiskLevel,
    });
    onClose(payload);
    setStep("done");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl w-[95vw] max-h-[90vh] p-0 flex flex-col gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle>Fechar Caixa</DialogTitle>
          <DialogDescription>
            {step === "blind" && "Etapa 1 de 2 — Informe os valores apurados em cada meio de pagamento. Os valores do sistema só serão revelados na próxima etapa."}
            {step === "review" && "Etapa 2 de 2 — Confira as diferenças e justifique cada divergência."}
            {step === "done" && "Fechamento concluído."}
          </DialogDescription>
          <div className="flex items-center gap-2 pt-2">
            <div className={cn("h-1 flex-1 rounded-full", step === "blind" ? "bg-primary" : "bg-primary/40")} />
            <div className={cn("h-1 flex-1 rounded-full", step === "review" ? "bg-primary" : step === "done" ? "bg-primary/40" : "bg-muted")} />
            <div className={cn("h-1 flex-1 rounded-full", step === "done" ? "bg-primary" : "bg-muted")} />
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* AUTORIZAÇÃO DE GERENTE (snapshot stale) */}
          {needsManagerAuth && (
            <div className="space-y-4 py-2">
              <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-4">
                <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Autorização necessária</p>
                  <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                    Foram registradas movimentações após o início do fechamento.
                    Um gerente deve autorizar para reiniciar a apuração do zero.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="manager-pwd">Senha do gerente</Label>
                <div className="flex gap-2">
                  <Input
                    id="manager-pwd"
                    type="password"
                    inputMode="numeric"
                    placeholder="••••"
                    value={managerPassword}
                    onChange={(e) => setManagerPassword(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleManagerAuth()}
                    autoFocus
                  />
                  <Button onClick={handleManagerAuth} disabled={!managerPassword || isVerifyingManager}>
                    {isVerifyingManager ? <Loader2 className="h-4 w-4 animate-spin" /> : "OK"}
                  </Button>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              </DialogFooter>
            </div>
          )}

          {/* ETAPA 1 — APURAÇÃO ÀS CEGAS */}
          {!needsManagerAuth && step === "blind" && (
            <>
              <Card className="bg-muted/40 border-dashed">
                <CardContent className="pt-3 pb-3 flex items-start gap-2">
                  <ShieldAlert className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p className="font-medium text-foreground">Apuração às cegas</p>
                    <p>Conte cada meio de pagamento e informe o valor encontrado. Você ainda não verá o valor esperado pelo sistema.</p>
                    <p>Ao avançar, sua apuração será registrada de forma definitiva para o administrador.</p>
                  </div>
                </CardContent>
              </Card>

              {totalDeliveryCash > 0 && (
                <Alert className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30">
                  <Bike className="h-4 w-4 text-blue-600" />
                  <AlertTitle className="text-blue-700 text-sm">Dinheiro de delivery na gaveta</AlertTitle>
                  <AlertDescription className="text-blue-600 text-xs space-y-1">
                    <p>
                      {deliveryCashMovements.length} pedido(s) de delivery registrado(s) como dinheiro,
                      totalizando <strong>{formatBRL(totalDeliveryCash)}</strong>.
                    </p>
                    <p>Verifique se esse valor foi recolhido pelos entregadores e está na gaveta antes de apurar.</p>
                    <div className="mt-2 space-y-0.5">
                      {deliveryCashMovements.map((m, i) => (
                        <div key={i} className="flex justify-between text-xs">
                          <span className="truncate">{m.description}</span>
                          <span className="tabular-nums ml-2">{formatBRL(Number(m.amount))}</span>
                        </div>
                      ))}
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <BlindInput icon={Banknote} label="Dinheiro (gaveta)" value={declaredCash} onChange={setDeclaredCash} />
                <BlindInput icon={CreditCard} label="Cartão de Crédito" value={declaredCredit} onChange={setDeclaredCredit} />
                <BlindInput icon={CreditCard} label="Cartão de Débito" value={declaredDebit} onChange={setDeclaredDebit} />
                <BlindInput icon={Smartphone} label="PIX" value={declaredPix} onChange={setDeclaredPix} />
                <BlindInput icon={Ticket} label="Vale-refeição" value={declaredVoucher} onChange={setDeclaredVoucher} />
                
                <BlindInput icon={UserCheck} label="Vendas a Prazo" value={declaredFiado} onChange={setDeclaredFiado} />
              </div>

              <Card>
                <CardContent className="pt-3 pb-3 flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Total geral apurado:</span>
                  <span className="font-semibold tabular-nums">{formatBRL(blindTotal)}</span>
                </CardContent>
              </Card>
            </>
          )}

          {/* ETAPA 2 — CONFERÊNCIA */}
          {!needsManagerAuth && step === "review" && (
            <>
              <Card className="bg-muted/40 border-dashed">
                <CardContent className="pt-3 pb-3 flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="text-xs text-muted-foreground">
                    <p className="font-medium text-foreground">Sua apuração foi registrada</p>
                    <p>Compare abaixo os valores apurados com o esperado pelo sistema. Justifique cada divergência para concluir o fechamento.</p>
                  </div>
                </CardContent>
              </Card>

              <section className="space-y-2">
                <h3 className="text-sm font-semibold">Gaveta (dinheiro físico)</h3>
                <Card>
                  <CardContent className="pt-3 pb-3 space-y-1 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">Abertura</span><span className="tabular-nums">{formatBRL(openingBalance)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Vendas em dinheiro</span><span className="tabular-nums">+ {formatBRL(totalCash)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Reforços</span><span className="tabular-nums">+ {formatBRL(totalReinforcements)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Sangrias</span><span className="tabular-nums">- {formatBRL(totalWithdrawals)}</span></div>
                    <Separator />
                    <div className="flex justify-between font-semibold"><span>Saldo esperado da gaveta</span><span className="tabular-nums">{formatBRL(expectedCash)}</span></div>
                  </CardContent>
                </Card>
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-semibold">Conferência por meio de pagamento</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {reviewRows.map((r) => (
                    <ReviewRow
                      key={r.key}
                      label={r.label}
                      icon={r.icon}
                      expected={r.expected}
                      declared={r.declared}
                      justification={r.justification}
                      onJustificationChange={r.setJust}
                    />
                  ))}
                </div>
              </section>


              <Card className={cn("border-2", cashRiskConfig.bgColor)}>
                <CardContent className="pt-3 pb-3">
                  <div className="flex items-start gap-3">
                    <RiskIcon className={cn("h-5 w-5 mt-0.5", cashRiskConfig.color)} />
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className={cn("font-semibold text-sm", cashRiskConfig.color)}>{cashRiskConfig.label}</span>
                        <span className={cn("font-mono font-bold text-sm", cashRiskConfig.color)}>
                          {totalDiff >= 0 ? "+" : ""}{formatBRL(totalDiff)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">{cashRiskConfig.description}</p>
                      <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                        <div><span className="text-muted-foreground">Esperado:</span> <span className="font-medium tabular-nums">{formatBRL(expectedTotal)}</span></div>
                        <div><span className="text-muted-foreground">Apurado:</span> <span className="font-medium tabular-nums">{formatBRL(declaredTotal)}</span></div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-2">
                <Label htmlFor="notes">Observação geral do fechamento (opcional)</Label>
                <Textarea
                  id="notes"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Comentários adicionais para o administrador..."
                />
              </div>
            </>
          )}

          {/* ETAPA 3 — DONE */}
          {!needsManagerAuth && step === "done" && (
            <div className="flex flex-col items-center justify-center py-8 gap-3 text-center">
              <CheckCircle2 className="h-12 w-12 text-green-600" />
              <h3 className="text-lg font-semibold">Caixa fechado com sucesso</h3>
              <p className="text-sm text-muted-foreground max-w-md">
                O fechamento foi registrado e a apuração ficou disponível para o administrador no menu Financeiro → Demonstrativo de Caixa.
              </p>
              <div className="flex gap-2 text-xs text-muted-foreground">
                <span>Status:</span>
                <span className="font-medium text-foreground">
                  {closingStatus === "no_difference" && "Conciliado"}
                  {closingStatus === "reconciled_with_mismatch" && "Conciliado com divergência entre formas"}
                  {closingStatus === "surplus" && `Sobra de ${formatBRL(Math.abs(totalDiff))}`}
                  {closingStatus === "shortage" && `Falta de ${formatBRL(Math.abs(totalDiff))}`}
                </span>
              </div>
            </div>
          )}
        </div>

        {!needsManagerAuth && (
          <DialogFooter className="px-6 py-4 border-t flex-col-reverse sm:flex-row sm:justify-end gap-2">
            {step === "blind" && (
              <>
                <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmittingBlind} className="w-full sm:w-auto">
                  Cancelar
                </Button>
                <Button onClick={handleSubmitBlind} disabled={!allBlindFilled || isSubmittingBlind} className="w-full sm:w-auto">
                  {isSubmittingBlind ? "Registrando..." : "Avançar para conferência"}
                </Button>
              </>
            )}
            {step === "review" && (
              <>
                <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isClosing} className="w-full sm:w-auto">
                  Cancelar
                </Button>
                <Button onClick={handleFinalize} disabled={isClosing || !allJustified} className="w-full sm:w-auto">
                  {isClosing ? "Fechando..." : "Confirmar Fechamento"}
                </Button>
              </>
            )}
            {step === "done" && (
              <Button onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
                Fechar
              </Button>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
