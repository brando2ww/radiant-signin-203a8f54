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
  Globe,
  MoreHorizontal,
  UserCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatBRL } from "@/lib/format";
import { usePDVCashier, type CloseCashierPayload } from "@/hooks/use-pdv-cashier";

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
      fiado: "À Prazo",
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
  ${totalFiado > 0 ? `<div class="row"><span>Vendas a Prazo (fiado):</span><span>${formatBRL(totalFiado)}</span></div>` : ""}
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



type Step = "blind" | "review" | "done";

const MIN_REVIEW_JUSTIFICATION = 30;

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
  const [step, setStep] = useState<Step>("blind");

  // Etapa 1 — apuração às cegas
  const [declaredCash, setDeclaredCash] = useState("");
  const [declaredCredit, setDeclaredCredit] = useState("");
  const [declaredDebit, setDeclaredDebit] = useState("");
  const [declaredPix, setDeclaredPix] = useState("");
  const [declaredVoucher, setDeclaredVoucher] = useState("");
  const [declaredOnline, setDeclaredOnline] = useState("");
  const [declaredOther, setDeclaredOther] = useState("");
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

  // Reset on close
  useEffect(() => {
    if (!open) {
      setStep("blind");
      setDeclaredCash(""); setDeclaredCredit(""); setDeclaredDebit("");
      setDeclaredPix(""); setDeclaredVoucher(""); setDeclaredOnline(""); setDeclaredOther(""); setDeclaredFiado("");
      setJustCash(""); setJustCredit(""); setJustDebit(""); setJustPix("");
      setJustVoucher(""); setJustOnline(""); setJustOther(""); setJustFiado(""); setNotes("");
    }
  }, [open]);

  // Ao abrir, recalcula totais e verifica se já existe snapshot da Etapa 1
  useEffect(() => {
    if (!open || !session?.id) return;
    (async () => {
      await supabase.rpc("pdv_recompute_session_totals", { p_session_id: session.id });
      queryClient.invalidateQueries({ queryKey: ["pdv-cashier-active"] });
      queryClient.invalidateQueries({ queryKey: ["pdv-cashier-movements"] });

      const { data: snap } = await supabase
        .from("pdv_cashier_close_blind_snapshots")
        .select("declared_cash, declared_credit, declared_debit, declared_pix, declared_voucher, declared_online_delivery, declared_other, declared_fiado")
        .eq("cashier_session_id", session.id)
        .maybeSingle();

      if (snap) {
        const toStr = (v: any) => (v == null ? "" : String(Number(v)));
        setDeclaredCash(toStr(snap.declared_cash));
        setDeclaredCredit(toStr(snap.declared_credit));
        setDeclaredDebit(toStr(snap.declared_debit));
        setDeclaredPix(toStr(snap.declared_pix));
        setDeclaredVoucher(toStr(snap.declared_voucher));
        setDeclaredOnline(toStr(snap.declared_online_delivery));
        setDeclaredOther(toStr(snap.declared_other));
        setDeclaredFiado(toStr((snap as any).declared_fiado));
        setStep("review");
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
    (totalOnlineDelivery <= 0 || declaredOnline !== "") &&
    (totalOther <= 0 || declaredOther !== "") &&
    (totalFiado <= 0 || declaredFiado !== "");

  const blindTotal =
    parseN(declaredCash) + parseN(declaredCredit) + parseN(declaredDebit) +
    parseN(declaredPix) + parseN(declaredVoucher) +
    (declaredOnline !== "" ? parseN(declaredOnline) : 0) +
    (declaredOther !== "" ? parseN(declaredOther) : 0) +
    (declaredFiado !== "" ? parseN(declaredFiado) : 0);

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
        declaredOnlineDelivery: declaredOnline !== "" ? parseN(declaredOnline) : null,
        declaredOther: declaredOther !== "" ? parseN(declaredOther) : null,
        declaredFiado: declaredFiado !== "" ? parseN(declaredFiado) : null,
        declaredTotal: blindTotal,
      });
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
  ];
  if (totalOnlineDelivery > 0 || declaredOnline !== "") {
    reviewRows.push({ key: "online", label: "Online (Delivery)", icon: Globe, expected: totalOnlineDelivery, declared: parseN(declaredOnline), justification: justOnline, setJust: setJustOnline });
  }
  if (totalOther > 0 || declaredOther !== "") {
    reviewRows.push({ key: "other", label: "Outros meios", icon: MoreHorizontal, expected: totalOther, declared: parseN(declaredOther), justification: justOther, setJust: setJustOther });
  }
  if (totalFiado > 0 || declaredFiado !== "") {
    reviewRows.push({ key: "fiado", label: "Vendas a Prazo", icon: UserCheck, expected: totalFiado, declared: parseN(declaredFiado), justification: justFiado, setJust: setJustFiado });
  }

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
      declaredOnlineDelivery: parseOpt(declaredOnline),
      declaredOther: parseOpt(declaredOther),
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

  const handleFinalize = () => {
    if (!allJustified) return;
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
          {/* ETAPA 1 — APURAÇÃO ÀS CEGAS */}
          {step === "blind" && (
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

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <BlindInput icon={Banknote} label="Dinheiro (gaveta)" value={declaredCash} onChange={setDeclaredCash} />
                <BlindInput icon={CreditCard} label="Cartão de Crédito" value={declaredCredit} onChange={setDeclaredCredit} />
                <BlindInput icon={CreditCard} label="Cartão de Débito" value={declaredDebit} onChange={setDeclaredDebit} />
                <BlindInput icon={Smartphone} label="PIX" value={declaredPix} onChange={setDeclaredPix} />
                <BlindInput icon={Ticket} label="Vale-refeição" value={declaredVoucher} onChange={setDeclaredVoucher} />
                {totalOnlineDelivery > 0 && (
                  <BlindInput icon={Globe} label="Online (Delivery)" value={declaredOnline} onChange={setDeclaredOnline} />
                )}
                {totalOther > 0 && (
                  <BlindInput icon={MoreHorizontal} label="Outros meios" value={declaredOther} onChange={setDeclaredOther} />
                )}
                {totalFiado > 0 && (
                  <BlindInput icon={UserCheck} label="Vendas a Prazo" value={declaredFiado} onChange={setDeclaredFiado} />
                )}
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
          {step === "review" && (
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
          {step === "done" && (
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
      </DialogContent>
    </Dialog>
  );
}
