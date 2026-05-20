import { useState, useMemo, useEffect } from "react";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { CurrencyInput } from "@/components/ui/currency-input";
import {
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  AlertCircle,
  CheckCircle2,
  Banknote,
  CreditCard,
  Smartphone,
  Ticket,
  Wallet,
  Receipt,
  Globe,
  MoreHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatBRL } from "@/lib/format";
import type { CloseCashierPayload } from "@/hooks/use-pdv-cashier";

export interface CashMovement {
  id: string;
  type: string;
  amount: number;
  payment_method?: string | null;
  description: string | null;
  created_at: string;
  discount_reason?: string | null;
  discount_authorized_by?: string | null;
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

export function printCashierReport(params: PrintCashierReportParams) {
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

  const conferenceRows: Array<[string, number, number | null]> = [
    ["Crédito", totalCredit, declaredCredit],
    ["Débito", totalDebit, declaredDebit],
    ["PIX", totalPix, declaredPix],
    ["Vale-refeição", totalVoucher, declaredVoucher],
    ["Online (Delivery)", totalOnlineDelivery, declaredOnline],
  ];

  const conferenceHtml = conferenceRows
    .filter(([, expected, declared]) => expected > 0 || declared != null)
    .map(([label, expected, declared]) => {
      const d = declared != null ? declared - expected : null;
      const status = d == null ? "—" : Math.abs(d) <= 0.5 ? "✓" : (d > 0 ? `+${formatBRL(d)}` : formatBRL(d));
      return `<div class="row">
        <span>${label}:</span>
        <span>Esp ${formatBRL(expected)} | Decl ${declared != null ? formatBRL(declared) : "—"} | ${status}</span>
      </div>`;
    })
    .join("");

  const riskLabels: Record<RiskLevel, string> = {
    ok: "OK", low: "Baixo", medium: "Médio", high: "Alto", critical: "Crítico",
  };

  const movementRows = movements.map((m) => {
    const time = format(new Date(m.created_at), "HH:mm", { locale: ptBR });
    const typeLabel = m.type === "venda" ? "Venda" : m.type === "sangria" ? "Sangria" : m.type === "reforco" ? "Reforço" : m.type;
    const methodMap: Record<string, string> = {
      dinheiro: "Dinheiro",
      cartao: "Cartão",
      credito: "Crédito",
      debito: "Débito",
      pix: "PIX",
      vale_refeicao: "VR",
    };
    const method = m.payment_method ? methodMap[m.payment_method] || m.payment_method : "";
    return `<tr>
      <td style="padding:2px 6px;font-size:11px">${time}</td>
      <td style="padding:2px 6px;font-size:11px">${typeLabel}</td>
      <td style="padding:2px 6px;font-size:11px">${method}</td>
      <td style="padding:2px 6px;font-size:11px;text-align:right">${formatBRL(m.amount)}</td>
    </tr>`;
  }).join("");

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Demonstrativo de Caixa</title>
<style>
  @page { size: 80mm auto; margin: 4mm; }
  body { font-family: 'Courier New', monospace; font-size: 12px; color: #000; margin: 0; padding: 8px; }
  h1 { font-size: 14px; text-align: center; margin: 0 0 4px; border-top: 2px solid #000; border-bottom: 2px solid #000; padding: 6px 0; }
  .section { margin: 8px 0; }
  .section-title { font-weight: bold; font-size: 12px; border-bottom: 1px dashed #000; padding-bottom: 2px; margin-bottom: 4px; }
  .row { display: flex; justify-content: space-between; font-size: 11px; padding: 1px 0; }
  .row.total { font-weight: bold; font-size: 12px; border-top: 1px solid #000; padding-top: 4px; margin-top: 4px; }
  .divider { border-top: 1px dashed #000; margin: 6px 0; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 10px; border-bottom: 1px solid #000; padding: 2px 6px; }
  .footer { text-align: center; font-size: 10px; margin-top: 12px; border-top: 2px solid #000; padding-top: 6px; }
  .risk-badge { display: inline-block; padding: 2px 8px; font-weight: bold; font-size: 11px; border: 1px solid #000; margin-top: 4px; }
</style></head><body>
<h1>DEMONSTRATIVO DE CAIXA</h1>
<div class="section">
  <div class="row"><span>Abertura:</span><span>${openedAt}</span></div>
  <div class="row"><span>Fechamento:</span><span>${closedAt}</span></div>
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
  <div class="row total"><span>Diferença:</span><span>${cashDiff >= 0 ? "+" : ""}${formatBRL(cashDiff)}</span></div>
</div>
${conferenceHtml ? `<div class="divider"></div>
<div class="section">
  <div class="section-title">CONFERÊNCIA POR FORMA</div>
  ${conferenceHtml}
</div>` : ""}
<div class="divider"></div>
<div class="section">
  <div class="row total"><span>Total de Vendas (sistema):</span><span>${formatBRL(totalSales)}</span></div>
</div>
${movements.length > 0 ? `
<div class="divider"></div>
<div class="section">
  <div class="section-title">MOVIMENTAÇÕES</div>
  <table><thead><tr><th>Hora</th><th>Tipo</th><th>Forma</th><th style="text-align:right">Valor</th></tr></thead>
  <tbody>${movementRows}</tbody></table>
</div>` : ""}
${finalNotes ? `
<div class="divider"></div>
<div class="section">
  <div class="section-title">OBSERVAÇÕES / JUSTIFICATIVA</div>
  <p style="font-size:11px;margin:4px 0">${finalNotes}</p>
</div>` : ""}
<div class="section" style="text-align:center;margin-top:8px">
  <span class="risk-badge">Risco: ${riskLabels[finalRisk]}</span>
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

export function CloseCashierDialog({
  open,
  onOpenChange,
  onClose,
  isClosing,
  session,
  movements = [],
}: CloseCashierDialogProps) {
  // Gaveta
  const [declaredCash, setDeclaredCash] = useState("");
  // Conferência por forma
  const [declaredCredit, setDeclaredCredit] = useState("");
  const [declaredDebit, setDeclaredDebit] = useState("");
  const [declaredPix, setDeclaredPix] = useState("");
  const [declaredVoucher, setDeclaredVoucher] = useState("");
  const [declaredOnline, setDeclaredOnline] = useState("");
  const [declaredOther, setDeclaredOther] = useState("");
  // Total geral
  const [declaredTotal, setDeclaredTotal] = useState("");
  // Justificativa única
  const [justification, setJustification] = useState("");
  // Observações
  const [notes, setNotes] = useState("");
  // Confirmação extra
  const [confirmOpen, setConfirmOpen] = useState(false);

  const openingBalance = Number(session?.opening_balance) || 0;
  const totalCash = Number(session?.total_cash) || 0;
  const totalCredit = Number(session?.total_credit) || 0;
  const totalDebit = Number(session?.total_debit) || 0;
  const totalPix = Number(session?.total_pix) || 0;
  const totalVoucher = Number(session?.total_voucher) || 0;
  const totalWithdrawals = Number(session?.total_withdrawals) || 0;
  const totalSales = Number(session?.total_sales) || 0;
  const totalOnlineDelivery = Number(session?.total_online_delivery) || 0;

  const totalReinforcements = useMemo(
    () =>
      movements
        .filter((m) => m.type === "reforco")
        .reduce((acc, m) => acc + m.amount, 0),
    [movements],
  );

  // Detectar "Outros meios" (vendas com payment_method fora do conjunto conhecido)
  const totalOther = useMemo(() => {
    const known = new Set(["dinheiro", "credito", "debito", "pix", "vale_refeicao", "cartao"]);
    return movements
      .filter((m) => m.type === "venda" && m.payment_method && !known.has(m.payment_method))
      .reduce((acc, m) => acc + Number(m.amount || 0), 0);
  }, [movements]);

  const expectedCash = openingBalance + totalCash + totalReinforcements - totalWithdrawals;

  const declaredCashNum = parseFloat(declaredCash) || 0;
  const cashDifference = declaredCashNum - expectedCash;
  const cashRiskLevel = getRiskLevel(cashDifference);
  const cashRiskConfig = getRiskConfig(cashRiskLevel);
  const hasCashDeclared = declaredCash !== "";

  // Estrutura unificada por meio (apenas os com expected>0 ou declarado preenchido)
  type MethodRow = {
    key: "cash" | "credit" | "debit" | "pix" | "voucher" | "online" | "other";
    label: string;
    expected: number;
    declared: string;
    diff: number;
    hasDeclared: boolean;
  };

  const parseDecl = (v: string) => {
    const n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  };

  const methodRows: MethodRow[] = [
    {
      key: "cash",
      label: "Dinheiro",
      expected: totalCash,
      declared: declaredCash,
      diff: hasCashDeclared ? declaredCashNum - expectedCash : 0,
      hasDeclared: hasCashDeclared,
    },
    {
      key: "credit",
      label: "Cartão de Crédito",
      expected: totalCredit,
      declared: declaredCredit,
      diff: declaredCredit !== "" ? parseDecl(declaredCredit) - totalCredit : 0,
      hasDeclared: declaredCredit !== "",
    },
    {
      key: "debit",
      label: "Cartão de Débito",
      expected: totalDebit,
      declared: declaredDebit,
      diff: declaredDebit !== "" ? parseDecl(declaredDebit) - totalDebit : 0,
      hasDeclared: declaredDebit !== "",
    },
    {
      key: "pix",
      label: "PIX",
      expected: totalPix,
      declared: declaredPix,
      diff: declaredPix !== "" ? parseDecl(declaredPix) - totalPix : 0,
      hasDeclared: declaredPix !== "",
    },
    {
      key: "voucher",
      label: "Vale-refeição",
      expected: totalVoucher,
      declared: declaredVoucher,
      diff: declaredVoucher !== "" ? parseDecl(declaredVoucher) - totalVoucher : 0,
      hasDeclared: declaredVoucher !== "",
    },
    {
      key: "online",
      label: "Online (Delivery)",
      expected: totalOnlineDelivery,
      declared: declaredOnline,
      diff: declaredOnline !== "" ? parseDecl(declaredOnline) - totalOnlineDelivery : 0,
      hasDeclared: declaredOnline !== "",
    },
    {
      key: "other",
      label: "Outros meios",
      expected: totalOther,
      declared: declaredOther,
      diff: declaredOther !== "" ? parseDecl(declaredOther) - totalOther : 0,
      hasDeclared: declaredOther !== "",
    },
  ];

  // "Online" e "Outros" só aparecem se houver expected>0 ou se operador preencher
  const visibleRows = methodRows.filter((r) => {
    if (["cash", "credit", "debit", "pix", "voucher"].includes(r.key)) return true;
    return r.expected > 0 || r.hasDeclared;
  });

  // Diferenças individuais ≠ 0
  const rowsWithDiff = visibleRows.filter((r) => r.hasDeclared && Math.abs(r.diff) > TOL);

  // Total esperado pelo sistema
  const expectedTotal = useMemo(
    () => visibleRows.reduce((acc, r) => acc + r.expected, 0),
    [visibleRows],
  );

  const declaredTotalNum = declaredTotal !== "" ? parseDecl(declaredTotal) : null;
  const totalDiff = declaredTotalNum != null ? declaredTotalNum - expectedTotal : 0;
  const hasTotalDiff = declaredTotalNum != null && Math.abs(totalDiff) > TOL;

  // NOVA REGRA: bloqueio considera APENAS a diferença total final.
  // Diferenças entre formas que se compensam são apenas informativas.
  const requiresJustification = hasTotalDiff;
  const hasReconciledMismatch = rowsWithDiff.length > 0 && !hasTotalDiff && declaredTotalNum != null;
  const justificationValid = justification.trim().length >= MIN_JUSTIFICATION_LENGTH;
  const justificationOk = !requiresJustification || justificationValid;

  const closingStatus: "no_difference" | "reconciled_with_mismatch" | "surplus" | "shortage" =
    hasTotalDiff
      ? (totalDiff > 0 ? "surplus" : "shortage")
      : (rowsWithDiff.length > 0 ? "reconciled_with_mismatch" : "no_difference");

  const canClose = useMemo(() => {
    if (!hasCashDeclared) return false;
    if (declaredTotal === "") return false; // total do dia obrigatório
    if (!justificationOk) return false;
    return true;
  }, [hasCashDeclared, declaredTotal, justificationOk]);

  const buildPayload = (): Omit<CloseCashierPayload, "sessionId"> => {
    const parseOpt = (v: string) => (v === "" ? null : parseFloat(v));
    const just = requiresJustification ? justification.trim() : undefined;

    return {
      declaredCash: declaredCashNum,
      expectedCash,
      declaredCredit: parseOpt(declaredCredit),
      declaredDebit: parseOpt(declaredDebit),
      declaredPix: parseOpt(declaredPix),
      declaredVoucher: parseOpt(declaredVoucher),
      declaredOnlineDelivery: parseOpt(declaredOnline),
      declaredOther: parseOpt(declaredOther),
      declaredTotalSales: declaredTotalNum,
      totalDifference: declaredTotalNum != null ? totalDiff : null,
      closingStatus,
      closingJustification: just ?? null,
      // Replica a justificativa única para cada meio com divergência (compat auditoria)
      justifications: {
        cash: rowsWithDiff.find((r) => r.key === "cash") ? just : undefined,
        credit: rowsWithDiff.find((r) => r.key === "credit") ? just : undefined,
        debit: rowsWithDiff.find((r) => r.key === "debit") ? just : undefined,
        pix: rowsWithDiff.find((r) => r.key === "pix") ? just : undefined,
        voucher: rowsWithDiff.find((r) => r.key === "voucher") ? just : undefined,
        onlineDelivery: rowsWithDiff.find((r) => r.key === "online") ? just : undefined,
        other: rowsWithDiff.find((r) => r.key === "other") ? just : undefined,
      },
      notes: notes.trim() || undefined,
      riskLevel: cashRiskLevel,
    };
  };

  const resetState = () => {
    setDeclaredCash("");
    setDeclaredCredit("");
    setDeclaredDebit("");
    setDeclaredPix("");
    setDeclaredVoucher("");
    setDeclaredOnline("");
    setDeclaredOther("");
    setDeclaredTotal("");
    setJustification("");
    setNotes("");
  };

  const finalizeClose = () => {
    const payload = buildPayload();
    printCashierReport({
      session: {
        ...session,
        declared_credit: payload.declaredCredit,
        declared_debit: payload.declaredDebit,
        declared_pix: payload.declaredPix,
        declared_voucher: payload.declaredVoucher,
        declared_online_delivery: payload.declaredOnlineDelivery,
      },
      movements,
      closingBalance: declaredCashNum,
      notes: notes.trim() || (requiresJustification ? justification.trim() : ""),
      riskLevel: cashRiskLevel,
    });
    onClose(payload);
    resetState();
    setConfirmOpen(false);
  };

  const handleConfirmClick = () => {
    if (!canClose) return;
    if (hasTotalDiff) {
      setConfirmOpen(true);
    } else {
      finalizeClose();
    }
  };

  const RiskIcon = cashRiskConfig.icon;

  // Valor absoluto da diferença total (ou soma das individuais quando total não foi declarado)
  const summedDiff = rowsWithDiff.reduce((a, r) => a + r.diff, 0);
  const displayedDiff = declaredTotalNum != null ? totalDiff : summedDiff;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl w-[95vw] max-h-[90vh] p-0 flex flex-col gap-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b">
            <DialogTitle>Fechar Caixa</DialogTitle>
            <DialogDescription>
              Confira os valores do caixa, informe os valores apurados e justifique diferenças antes de finalizar.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
            {/* SEÇÃO 1 — Valor total de venda do dia */}
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Receipt className="h-5 w-5 text-primary" />
                <h3 className="text-base font-semibold">1. Valor total de venda do dia</h3>
              </div>
              <div className="space-y-2">
                <Label htmlFor="declared-total" className="font-semibold flex items-center gap-1">
                  Total apurado pelo operador <span className="text-destructive">*</span>
                </Label>
                <p className="text-xs text-muted-foreground">
                  Total geral apurado pelo operador, somando todos os meios de pagamento.
                </p>
                <CurrencyInput
                  id="declared-total"
                  value={declaredTotal}
                  onChange={setDeclaredTotal}
                />
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs pt-1">
                  <div className="flex justify-between sm:flex-col sm:gap-0.5">
                    <span className="text-muted-foreground">Esperado:</span>
                    <span className="font-medium tabular-nums">{formatBRL(expectedTotal)}</span>
                  </div>
                  <div className="flex justify-between sm:flex-col sm:gap-0.5">
                    <span className="text-muted-foreground">Informado:</span>
                    <span className="font-medium tabular-nums">
                      {declaredTotalNum != null ? formatBRL(declaredTotalNum) : "—"}
                    </span>
                  </div>
                  <div className="flex justify-between sm:flex-col sm:gap-0.5">
                    <span className="text-muted-foreground">Diferença:</span>
                    {declaredTotalNum != null ? <DiffBadge diff={totalDiff} /> : <span>—</span>}
                  </div>
                </div>
              </div>
            </section>

            {/* SEÇÃO 2 — Resumo do caixa e vendas por pagamento */}
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Wallet className="h-5 w-5 text-primary" />
                <h3 className="text-base font-semibold">2. Resumo do caixa e vendas por pagamento</h3>
              </div>

              <Card>
                <CardContent className="pt-4 pb-4 space-y-3">
                  {/* Bloco 1 — Gaveta / dinheiro físico */}
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Gaveta / dinheiro físico
                    </p>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Abertura:</span>
                      <span className="font-medium tabular-nums">{formatBRL(openingBalance)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Vendas em dinheiro:</span>
                      <span className="font-medium tabular-nums text-green-600">+ {formatBRL(totalCash)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Reforços:</span>
                      <span className="font-medium tabular-nums text-green-600">+ {formatBRL(totalReinforcements)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Sangrias:</span>
                      <span className="font-medium tabular-nums text-destructive">- {formatBRL(totalWithdrawals)}</span>
                    </div>
                    <div className="flex justify-between font-semibold pt-1">
                      <span>Saldo esperado da gaveta:</span>
                      <span className="tabular-nums">{formatBRL(expectedCash)}</span>
                    </div>
                  </div>

                  <Separator />

                  {/* Bloco 2 — Vendas registradas por forma de pagamento */}
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Vendas registradas por forma de pagamento
                    </p>
                    {visibleRows.map((r) => (
                      <div key={r.key} className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{r.label}:</span>
                        <span className="font-medium tabular-nums">{formatBRL(r.expected)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between font-semibold pt-1">
                      <span>Total de vendas registradas:</span>
                      <span className="tabular-nums">{formatBRL(expectedTotal)}</span>
                    </div>
                    {totalSales !== expectedTotal && (
                      <p className="text-[11px] text-muted-foreground pt-1">
                        Total geral de vendas registradas no turno: {formatBRL(totalSales)}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* SEÇÃO 3 — Conferência dos valores apurados */}
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-primary" />
                <h3 className="text-base font-semibold">3. Conferência dos valores apurados</h3>
              </div>
              <p className="text-xs text-muted-foreground">
                Informe o valor apurado em cada meio de pagamento. A diferença é calculada automaticamente.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <MethodConference
                  icon={Banknote}
                  label="Dinheiro (gaveta)"
                  expected={expectedCash}
                  declared={declaredCash}
                  onChange={setDeclaredCash}
                />
                <MethodConference
                  icon={CreditCard}
                  label="Cartão de Crédito"
                  expected={totalCredit}
                  declared={declaredCredit}
                  onChange={setDeclaredCredit}
                />
                <MethodConference
                  icon={CreditCard}
                  label="Cartão de Débito"
                  expected={totalDebit}
                  declared={declaredDebit}
                  onChange={setDeclaredDebit}
                />
                <MethodConference
                  icon={Smartphone}
                  label="PIX"
                  expected={totalPix}
                  declared={declaredPix}
                  onChange={setDeclaredPix}
                />
                <MethodConference
                  icon={Ticket}
                  label="Vale-refeição"
                  expected={totalVoucher}
                  declared={declaredVoucher}
                  onChange={setDeclaredVoucher}
                />
                {(totalOnlineDelivery > 0 || declaredOnline !== "") && (
                  <MethodConference
                    icon={Globe}
                    label="Online (Delivery)"
                    expected={totalOnlineDelivery}
                    declared={declaredOnline}
                    onChange={setDeclaredOnline}
                  />
                )}
                {(totalOther > 0 || declaredOther !== "") && (
                  <MethodConference
                    icon={MoreHorizontal}
                    label="Outros meios"
                    expected={totalOther}
                    declared={declaredOther}
                    onChange={setDeclaredOther}
                  />
                )}
              </div>

              {hasCashDeclared && (
                <Card className={cn("border-2", cashRiskConfig.bgColor)}>
                  <CardContent className="pt-3 pb-3">
                    <div className="flex items-start gap-3">
                      <RiskIcon className={cn("h-5 w-5 mt-0.5", cashRiskConfig.color)} />
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className={cn("font-semibold text-sm", cashRiskConfig.color)}>
                            {cashRiskConfig.label}
                          </span>
                          <span className={cn("font-mono font-bold text-sm", cashRiskConfig.color)}>
                            {cashDifference >= 0 ? "+" : ""}{formatBRL(cashDifference)}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{cashRiskConfig.description}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </section>

            {/* SEÇÃO 4 — Diferenças encontradas */}
            {(rowsWithDiff.length > 0 || hasTotalDiff) && (
              <section className="space-y-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-orange-600" />
                  <h3 className="text-base font-semibold">4. Diferenças encontradas</h3>
                </div>
                <Card className="border-orange-300 dark:border-orange-900">
                  <CardContent className="pt-3 pb-3 space-y-1.5">
                    {rowsWithDiff.map((r) => (
                      <div key={r.key} className="flex justify-between items-center text-sm">
                        <span>{r.label}</span>
                        <DiffBadge diff={r.diff} />
                      </div>
                    ))}
                    {hasTotalDiff && (
                      <>
                        <Separator />
                        <div className="flex justify-between items-center text-sm font-semibold">
                          <span>Total do dia</span>
                          <DiffBadge diff={totalDiff} />
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>

                {hasReconciledMismatch && (
                  <Card className="border-yellow-300 bg-yellow-50 dark:bg-yellow-950/20 dark:border-yellow-900">
                    <CardContent className="pt-3 pb-3">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5 shrink-0" />
                        <div className="space-y-1">
                          <p className="font-semibold text-sm text-yellow-700 dark:text-yellow-500">
                            Divergência entre formas de pagamento
                          </p>
                          <p className="text-xs text-muted-foreground">
                            O total final do caixa está correto, mas existem diferenças entre os meios de pagamento.
                            Isso pode ocorrer por troca de forma de pagamento, lançamento incorreto ou ajuste operacional.
                            Você pode continuar o fechamento normalmente.
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </section>
            )}

            {/* SEÇÃO 5 — Justificativa (apenas quando há diferença total real) */}
            {requiresJustification && (
              <section className="space-y-2">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-destructive" />
                  <h3 className="text-base font-semibold">5. Justificativa da diferença</h3>
                </div>
                <p className="text-xs text-destructive">
                  Existe diferença no total final do fechamento. Informe uma justificativa para continuar.
                </p>
                <Label className="text-xs">
                  Justificativa* ({justification.trim().length}/{MIN_JUSTIFICATION_LENGTH})
                </Label>
                <Textarea
                  rows={3}
                  placeholder="Explique o motivo da diferença (mínimo 10 caracteres)..."
                  value={justification}
                  onChange={(e) => setJustification(e.target.value)}
                  className={cn(!justificationValid && "border-orange-400 focus-visible:ring-orange-400")}
                />
              </section>
            )}

            {/* SEÇÃO 6 — Resumo final */}
            <section className="space-y-2">
              <h3 className="text-base font-semibold">6. Resumo final do fechamento</h3>
              <Card className="bg-muted/30">
                <CardContent className="pt-4 pb-4 space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Total esperado pelo sistema:</span>
                    <span className="font-medium tabular-nums">{formatBRL(expectedTotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Total informado pelo operador:</span>
                    <span className="font-medium tabular-nums">
                      {declaredTotalNum != null ? formatBRL(declaredTotalNum) : "—"}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm items-center">
                    <span className="text-muted-foreground">Diferença total:</span>
                    {declaredTotalNum != null ? <DiffBadge diff={totalDiff} /> : <span>—</span>}
                  </div>
                  <Separator />
                  <div className="flex justify-between text-sm items-center">
                    <span className="text-muted-foreground">Status:</span>
                    {closingStatus === "no_difference" && (
                      <span className="flex items-center gap-1 text-green-600 font-medium">
                        <CheckCircle2 className="h-4 w-4" /> Conciliado
                      </span>
                    )}
                    {closingStatus === "reconciled_with_mismatch" && (
                      <span className="flex items-center gap-1 text-yellow-600 font-medium">
                        <AlertTriangle className="h-4 w-4" /> Conciliado com divergência entre formas
                      </span>
                    )}
                    {closingStatus === "surplus" && (
                      <span className="flex items-center gap-1 text-orange-600 font-medium">
                        <AlertTriangle className="h-4 w-4" /> Fechado com sobra
                      </span>
                    )}
                    {closingStatus === "shortage" && (
                      <span className="flex items-center gap-1 text-destructive font-medium">
                        <AlertCircle className="h-4 w-4" /> Fechado com falta
                      </span>
                    )}
                  </div>
                  {requiresJustification && justification.trim() && (
                    <>
                      <Separator />
                      <div className="text-xs">
                        <span className="text-muted-foreground">Justificativa:</span>
                        <p className="mt-1 whitespace-pre-wrap">{justification.trim()}</p>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </section>

            {/* Observações gerais (opcional) */}
            <div className="space-y-2">
              <Label htmlFor="notes">Observações gerais (opcional)</Label>
              <Textarea
                id="notes"
                placeholder="Notas adicionais sobre o fechamento..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>

            {/* Bloco de bloqueio removido — fechamento agora depende apenas da diferença total final */}
          </div>

          <DialogFooter className="px-6 py-4 border-t flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isClosing}
              className="w-full sm:w-auto"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmClick}
              disabled={isClosing || !canClose}
              variant="default"
              className="w-full sm:w-auto"
            >
              {isClosing ? "Fechando..." : "Confirmar Fechamento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar fechamento com diferença</AlertDialogTitle>
            <AlertDialogDescription>
              Este caixa possui diferença de <strong>{formatBRL(Math.abs(displayedDiff))}</strong>
              {" "}({closingStatus === "surplus" ? "sobra" : "falta"}).
              {" "}Deseja confirmar o fechamento com a justificativa informada?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isClosing}>Voltar e revisar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); finalizeClose(); }} disabled={isClosing}>
              Confirmar fechamento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
