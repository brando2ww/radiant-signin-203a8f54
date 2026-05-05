import { useState, useMemo } from "react";
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

const MIN_JUSTIFICATION_LENGTH = 30;

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
  const totalChange = Number(session?.total_change) || 0;
  const totalCredit = Number(session?.total_credit) || 0;
  const totalDebit = Number(session?.total_debit) || 0;
  const totalPix = Number(session?.total_pix) || 0;
  const totalVoucher = Number(session?.total_voucher) || 0;
  const totalWithdrawals = Number(session?.total_withdrawals) || 0;
  const totalSales = Number(session?.total_sales) || 0;

  const totalReinforcements = movements
    .filter((m) => m.type === "reforco")
    .reduce((acc, m) => acc + m.amount, 0);

  const netCash = totalCash;
  const expectedCash = openingBal + netCash + totalReinforcements - totalWithdrawals;
  const cashDiff = finalBalance - expectedCash;

  const declaredCredit = session?.declared_credit;
  const declaredDebit = session?.declared_debit;
  const declaredPix = session?.declared_pix;
  const declaredVoucher = session?.declared_voucher;

  const conferenceRows: Array<[string, number, number | null]> = [
    ["Crédito", totalCredit, declaredCredit],
    ["Débito", totalDebit, declaredDebit],
    ["PIX", totalPix, declaredPix],
    ["Vale-refeição", totalVoucher, declaredVoucher],
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
  <div class="section-title">CONFERÊNCIA DAS MÁQUINAS / EXTRATOS</div>
  ${conferenceHtml}
</div>` : ""}
<div class="divider"></div>
<div class="section">
  <div class="row total"><span>Total de Vendas (todas as formas):</span><span>${formatBRL(totalSales)}</span></div>
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
  justification: string;
  onJustificationChange: (v: string) => void;
}

function MethodConference({
  icon: Icon,
  label,
  expected,
  declared,
  onChange,
  justification,
  onJustificationChange,
}: MethodConferenceProps) {
  const declaredNum = parseFloat(declared);
  const hasDeclared = declared !== "" && !isNaN(declaredNum);
  const diff = hasDeclared ? declaredNum - expected : 0;
  const ok = hasDeclared && Math.abs(diff) <= 0.5;
  const hasDivergence = hasDeclared && !ok;
  const justOk = !hasDivergence || justification.trim().length >= MIN_JUSTIFICATION_LENGTH;

  return (
    <Card className={cn("border", hasDivergence && "border-orange-300 dark:border-orange-900")}>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">{label}</span>
          </div>
          {hasDeclared && (
            ok ? (
              <span className="flex items-center gap-1 text-xs text-green-600">
                <CheckCircle2 className="h-3.5 w-3.5" /> Conferido
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs text-orange-600">
                <AlertTriangle className="h-3.5 w-3.5" /> {diff > 0 ? "+" : ""}{formatBRL(diff)}
              </span>
            )
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Esperado (sistema)</Label>
            <div className="h-9 px-3 flex items-center text-sm font-medium tabular-nums rounded-md border bg-muted/30">
              {formatBRL(expected)}
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Conforme máquina/extrato</Label>
            <CurrencyInput value={declared} onChange={onChange} />
          </div>
        </div>
        {hasDivergence && (
          <div className="space-y-1 pt-1">
            <Label className="text-xs text-orange-700">
              Justificativa* ({justification.trim().length}/{MIN_JUSTIFICATION_LENGTH})
            </Label>
            <Textarea
              rows={2}
              placeholder="Explique a divergência (mínimo 30 caracteres)..."
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
  // Gaveta
  const [declaredCash, setDeclaredCash] = useState("");
  const [cashJustification, setCashJustification] = useState("");
  // Conferência por forma
  const [declaredCredit, setDeclaredCredit] = useState("");
  const [declaredDebit, setDeclaredDebit] = useState("");
  const [declaredPix, setDeclaredPix] = useState("");
  const [declaredVoucher, setDeclaredVoucher] = useState("");
  const [creditJust, setCreditJust] = useState("");
  const [debitJust, setDebitJust] = useState("");
  const [pixJust, setPixJust] = useState("");
  const [voucherJust, setVoucherJust] = useState("");
  // Observações gerais
  const [notes, setNotes] = useState("");

  const openingBalance = Number(session?.opening_balance) || 0;
  const totalCash = Number(session?.total_cash) || 0;
  const totalChange = Number(session?.total_change) || 0;
  const totalCredit = Number(session?.total_credit) || 0;
  const totalDebit = Number(session?.total_debit) || 0;
  const totalPix = Number(session?.total_pix) || 0;
  const totalVoucher = Number(session?.total_voucher) || 0;
  const totalWithdrawals = Number(session?.total_withdrawals) || 0;
  const totalSales = Number(session?.total_sales) || 0;

  const totalReinforcements = useMemo(
    () =>
      movements
        .filter((m) => m.type === "reforco")
        .reduce((acc, m) => acc + m.amount, 0),
    [movements],
  );

  const netCash = totalCash - totalChange;
  const expectedCash = openingBalance + netCash + totalReinforcements - totalWithdrawals;

  const declaredCashNum = parseFloat(declaredCash) || 0;
  const cashDifference = declaredCashNum - expectedCash;
  const cashRiskLevel = getRiskLevel(cashDifference);
  const cashRiskConfig = getRiskConfig(cashRiskLevel);
  const hasCashDeclared = declaredCash !== "";
  const cashHasDivergence = hasCashDeclared && cashRiskLevel !== "ok";

  // Validação de justificativa por forma
  const formMethods = [
    { key: "credit" as const, total: totalCredit, declared: declaredCredit, just: creditJust },
    { key: "debit" as const, total: totalDebit, declared: declaredDebit, just: debitJust },
    { key: "pix" as const, total: totalPix, declared: declaredPix, just: pixJust },
    { key: "voucher" as const, total: totalVoucher, declared: declaredVoucher, just: voucherJust },
  ];

  const formsWithDivergence = formMethods.filter((f) => {
    if (f.declared === "") return false;
    const d = parseFloat(f.declared) - f.total;
    return Math.abs(d) > 0.5;
  });

  const allFormJustificationsValid = formsWithDivergence.every(
    (f) => f.just.trim().length >= MIN_JUSTIFICATION_LENGTH,
  );

  const cashJustificationValid =
    !cashHasDivergence || cashJustification.trim().length >= MIN_JUSTIFICATION_LENGTH;

  const isBlocked = cashRiskLevel === "critical";

  const canClose = useMemo(() => {
    if (!hasCashDeclared) return false;
    if (isBlocked) return false;
    if (!cashJustificationValid) return false;
    if (!allFormJustificationsValid) return false;
    return true;
  }, [hasCashDeclared, isBlocked, cashJustificationValid, allFormJustificationsValid]);

  const handleClose = () => {
    const parseOpt = (v: string) => (v === "" ? null : parseFloat(v));

    const payload: Omit<CloseCashierPayload, "sessionId"> = {
      declaredCash: declaredCashNum,
      expectedCash,
      declaredCredit: parseOpt(declaredCredit),
      declaredDebit: parseOpt(declaredDebit),
      declaredPix: parseOpt(declaredPix),
      declaredVoucher: parseOpt(declaredVoucher),
      justifications: {
        cash: cashHasDivergence ? cashJustification.trim() : undefined,
        credit: creditJust.trim() || undefined,
        debit: debitJust.trim() || undefined,
        pix: pixJust.trim() || undefined,
        voucher: voucherJust.trim() || undefined,
      },
      notes: notes.trim() || undefined,
      riskLevel: cashRiskLevel,
    };

    // Imprime recibo (com novos totais já inferidos da sessão atual)
    printCashierReport({
      session: {
        ...session,
        declared_credit: payload.declaredCredit,
        declared_debit: payload.declaredDebit,
        declared_pix: payload.declaredPix,
        declared_voucher: payload.declaredVoucher,
      },
      movements,
      closingBalance: declaredCashNum,
      notes: notes.trim() || (cashHasDivergence ? cashJustification : ""),
      riskLevel: cashRiskLevel,
    });

    onClose(payload);
    // Reset
    setDeclaredCash("");
    setCashJustification("");
    setDeclaredCredit("");
    setDeclaredDebit("");
    setDeclaredPix("");
    setDeclaredVoucher("");
    setCreditJust("");
    setDebitJust("");
    setPixJust("");
    setVoucherJust("");
    setNotes("");
  };

  const RiskIcon = cashRiskConfig.icon;

  // Resumo final: status por forma
  const formStatuses = formMethods
    .filter((f) => f.total > 0 || f.declared !== "")
    .map((f) => {
      if (f.declared === "") return { key: f.key, label: f.key, status: "pending" as const };
      const d = parseFloat(f.declared) - f.total;
      if (Math.abs(d) <= 0.5) return { key: f.key, label: f.key, status: "ok" as const };
      const justOk = f.just.trim().length >= MIN_JUSTIFICATION_LENGTH;
      return { key: f.key, label: f.key, status: justOk ? ("justified" as const) : ("missing" as const), diff: d };
    });

  const labelMap: Record<string, string> = {
    credit: "Crédito",
    debit: "Débito",
    pix: "PIX",
    voucher: "Vale-refeição",
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl w-[95vw] max-h-[90vh] p-0 flex flex-col gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle>Fechar Caixa</DialogTitle>
          <DialogDescription>
            Confira o dinheiro físico da gaveta e os totais de cada máquina/extrato separadamente.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {/* GRUPO 1 — Contagem da gaveta */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-primary" />
              <h3 className="text-base font-semibold">1. Contagem da gaveta</h3>
            </div>

            <Card>
              <CardContent className="pt-4 pb-4 space-y-2">
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
                <Separator />
                <div className="flex justify-between font-semibold">
                  <span>Saldo Esperado da Gaveta:</span>
                  <span className="tabular-nums">{formatBRL(expectedCash)}</span>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-2">
              <Label htmlFor="declared-cash" className="font-semibold">
                Dinheiro contado na gaveta
              </Label>
              <CurrencyInput
                id="declared-cash"
                value={declaredCash}
                onChange={setDeclaredCash}
                autoFocus
              />
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

            {cashHasDivergence && !isBlocked && (
              <div className="space-y-1">
                <Label className="text-xs">
                  Justificativa da diferença na gaveta* ({cashJustification.trim().length}/{MIN_JUSTIFICATION_LENGTH})
                </Label>
                <Textarea
                  rows={2}
                  placeholder="Explique detalhadamente o motivo da diferença na gaveta..."
                  value={cashJustification}
                  onChange={(e) => setCashJustification(e.target.value)}
                  className={cn(!cashJustificationValid && "border-orange-400 focus-visible:ring-orange-400")}
                />
              </div>
            )}
          </section>

          {/* GRUPO 2 — Conferência por forma */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-primary" />
              <h3 className="text-base font-semibold">2. Conferência das máquinas e extratos</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Informe o total recebido em cada forma conforme a máquina ou o extrato. Esses valores não afetam a
              gaveta — servem para conferir o que foi efetivamente cobrado.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <MethodConference
                icon={CreditCard}
                label="Cartão de Crédito"
                expected={totalCredit}
                declared={declaredCredit}
                onChange={setDeclaredCredit}
                justification={creditJust}
                onJustificationChange={setCreditJust}
              />
              <MethodConference
                icon={CreditCard}
                label="Cartão de Débito"
                expected={totalDebit}
                declared={declaredDebit}
                onChange={setDeclaredDebit}
                justification={debitJust}
                onJustificationChange={setDebitJust}
              />
              <MethodConference
                icon={Smartphone}
                label="PIX"
                expected={totalPix}
                declared={declaredPix}
                onChange={setDeclaredPix}
                justification={pixJust}
                onJustificationChange={setPixJust}
              />
              <MethodConference
                icon={Ticket}
                label="Vale-refeição"
                expected={totalVoucher}
                declared={declaredVoucher}
                onChange={setDeclaredVoucher}
                justification={voucherJust}
                onJustificationChange={setVoucherJust}
              />
            </div>
          </section>

          {/* RESUMO FINAL */}
          <section className="space-y-2">
            <h3 className="text-base font-semibold">Resumo do fechamento</h3>
            <Card className="bg-muted/30">
              <CardContent className="pt-4 pb-4 space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total geral de vendas do turno:</span>
                  <span className="font-bold tabular-nums">{formatBRL(totalSales)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Saldo esperado da gaveta:</span>
                  <span className="font-medium tabular-nums">{formatBRL(expectedCash)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Contado pelo operador:</span>
                  <span className="font-medium tabular-nums">{hasCashDeclared ? formatBRL(declaredCashNum) : "—"}</span>
                </div>
                {formStatuses.length > 0 && (
                  <>
                    <Separator className="my-2" />
                    <div className="space-y-1">
                      {formStatuses.map((s) => (
                        <div key={s.key} className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">{labelMap[s.key]}</span>
                          {s.status === "ok" && (
                            <span className="flex items-center gap-1 text-green-600">
                              <CheckCircle2 className="h-3 w-3" /> Conferido
                            </span>
                          )}
                          {s.status === "justified" && (
                            <span className="flex items-center gap-1 text-orange-600">
                              <AlertTriangle className="h-3 w-3" /> Divergência justificada
                            </span>
                          )}
                          {s.status === "missing" && (
                            <span className="flex items-center gap-1 text-destructive">
                              <AlertCircle className="h-3 w-3" /> Justificativa pendente
                            </span>
                          )}
                          {s.status === "pending" && (
                            <span className="text-muted-foreground">Não declarado</span>
                          )}
                        </div>
                      ))}
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

          {isBlocked && (
            <Card className="border-2 border-red-500 bg-red-50 dark:bg-red-950/20">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start gap-3">
                  <ShieldX className="h-6 w-6 text-red-700 mt-0.5" />
                  <div className="space-y-2">
                    <p className="font-semibold text-red-700">Fechamento Bloqueado</p>
                    <p className="text-sm text-red-600">
                      A divergência da gaveta ({formatBRL(Math.abs(cashDifference))}) excede o limite permitido.
                      Recontagem o caixa ou contate um supervisor.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
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
            onClick={handleClose}
            disabled={isClosing || !canClose}
            variant={isBlocked ? "destructive" : "default"}
            className="w-full sm:w-auto"
          >
            {isClosing ? "Fechando..." : isBlocked ? "Bloqueado" : "Confirmar Fechamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
