import { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Loader2, Lock, AlertCircle, CheckCircle2, ScanLine } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { supabase } from "@/integrations/supabase/client";
import { ChecklistExecutionPage } from "@/components/pdv/checklists/execution/ChecklistExecutionPage";
import { SECTOR_LABELS, type ChecklistSector } from "@/hooks/use-checklists";
import {
  UtensilsCrossed, Armchair, Calculator, Wine, Package, Briefcase,
} from "lucide-react";
import { Toaster } from "@/components/ui/toaster";
import { toLocalDateStr } from "@/lib/date";

const SECTOR_ICONS: Record<ChecklistSector, React.ElementType> = {
  cozinha: UtensilsCrossed,
  salao: Armchair,
  caixa: Calculator,
  bar: Wine,
  estoque: Package,
  gerencia: Briefcase,
};

interface ChecklistInfo {
  id: string;
  name: string;
  sector: ChecklistSector;
  color: string | null;
  user_id: string;
  is_active: boolean;
  qr_access_enabled: boolean;
}

interface Operator {
  id: string;
  name: string;
  sector: string;
}

const MAX_FAILS = 3;
const BLOCK_SECONDS = 60;

export default function PublicChecklistAccess() {
  const { checklistId } = useParams<{ checklistId: string }>();
  const [loading, setLoading] = useState(true);
  const [checklist, setChecklist] = useState<ChecklistInfo | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [pin, setPin] = useState("");
  const [operator, setOperator] = useState<Operator | null>(null);
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [failCount, setFailCount] = useState(0);
  const [blockedUntil, setBlockedUntil] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [validating, setValidating] = useState(false);
  const [completed, setCompleted] = useState(false);

  // Tick for countdown
  useEffect(() => {
    if (!blockedUntil) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [blockedUntil]);

  // Load checklist
  useEffect(() => {
    if (!checklistId) return;
    setLoading(true);
    supabase
      .from("checklists")
      .select("id, name, sector, color, user_id, is_active, qr_access_enabled")
      .eq("id", checklistId)
      .maybeSingle()
      .then(({ data }) => {
        if (!data || !data.is_active || !(data as any).qr_access_enabled) {
          setUnavailable(true);
        } else {
          setChecklist(data as ChecklistInfo);
          // Log open
          supabase.from("checklist_access_logs").insert({
            user_id: (data as any).user_id,
            operator_id: null,
            action: "qr_open",
            details: { source: "qr", checklistId: data.id },
          }).then(({ error }) => {
            if (error) console.warn("[checklist] qr_open log failed:", error);
          });
        }
        setLoading(false);
      });
  }, [checklistId]);

  const isBlocked = blockedUntil !== null && now < blockedUntil;
  const remainingSec = isBlocked ? Math.ceil((blockedUntil! - now) / 1000) : 0;

  const handleSubmit = useCallback(async () => {
    if (!checklist || pin.length < 4 || isBlocked) return;
    setValidating(true);
    setError("");

    const { data, error: err } = await supabase
      .from("checklist_operators")
      .select("id, name, sector, access_level")
      .eq("user_id", checklist.user_id)
      .eq("pin", pin)
      .eq("is_active", true)
      .maybeSingle();

    if (err || !data) {
      const newCount = failCount + 1;
      setFailCount(newCount);
      setPin("");
      setError("PIN inválido. Tente novamente.");

      // Log failure
      await supabase.from("checklist_access_logs").insert({
        user_id: checklist.user_id,
        operator_id: "00000000-0000-0000-0000-000000000000",
        action: "qr_pin_fail",
        details: { source: "qr", checklistId: checklist.id, attempt: newCount },
      });

      if (newCount >= MAX_FAILS) {
        const until = Date.now() + BLOCK_SECONDS * 1000;
        setBlockedUntil(until);
        setError(`Muitas tentativas. Aguarde ${BLOCK_SECONDS}s.`);
        await supabase.from("checklist_access_logs").insert({
          user_id: checklist.user_id,
          operator_id: "00000000-0000-0000-0000-000000000000",
          action: "qr_blocked",
          details: { source: "qr", checklistId: checklist.id },
        });
      }
      setValidating(false);
      return;
    }

    // Success - log + start execution
    await supabase.from("checklist_access_logs").insert({
      user_id: checklist.user_id,
      operator_id: data.id,
      action: "login",
      details: { source: "qr", checklistId: checklist.id },
    });

    setOperator({ id: data.id, name: data.name, sector: data.sector });
    setFailCount(0);
    setBlockedUntil(null);

    // Find or create execution for today (without schedule)
    const todayStr = toLocalDateStr();
    const { data: existing } = await supabase
      .from("checklist_executions")
      .select("id")
      .eq("checklist_id", checklist.id)
      .eq("execution_date", todayStr)
      .eq("operator_id", data.id)
      .is("schedule_id", null)
      .maybeSingle();

    let execId = existing?.id;
    if (!execId) {
      const { data: exec, error: e2 } = await supabase
        .from("checklist_executions")
        .insert({
          checklist_id: checklist.id,
          operator_id: data.id,
          user_id: checklist.user_id,
          execution_date: todayStr,
          status: "em_andamento",
          started_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (e2) {
        setError("Erro ao iniciar execução.");
        setValidating(false);
        return;
      }
      execId = exec.id;

      // Create execution items
      const { data: items } = await supabase
        .from("checklist_items")
        .select("id")
        .eq("checklist_id", checklist.id)
        .order("sort_order");
      if (items && items.length > 0) {
        await supabase.from("checklist_execution_items").insert(
          items.map((it: any) => ({ execution_id: execId, item_id: it.id }))
        );
      }
    }

    setExecutionId(execId!);
    setValidating(false);
  }, [checklist, pin, failCount, isBlocked]);

  const resetSession = () => {
    setPin("");
    setOperator(null);
    setExecutionId(null);
    setCompleted(false);
    setError("");
  };

  // Render states
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (unavailable) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center space-y-3">
            <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto" />
            <h2 className="text-lg font-semibold">Checklist indisponível</h2>
            <p className="text-sm text-muted-foreground">
              Este checklist não está disponível no momento. Entre em contato com seu gestor.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!checklist) return null;

  // Completed view
  if (completed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center space-y-4">
            <CheckCircle2 className="h-16 w-16 text-primary mx-auto" />
            <h2 className="text-xl font-bold">Checklist concluído!</h2>
            <p className="text-sm text-muted-foreground">
              Obrigado, {operator?.name}. Suas respostas foram registradas.
            </p>
            <Button onClick={resetSession} className="w-full h-12 text-base">
              <ScanLine className="h-5 w-5 mr-2" /> Escanear outro QR Code
            </Button>
          </CardContent>
        </Card>
        <Toaster />
      </div>
    );
  }

  // Execution view
  if (executionId && operator) {
    return (
      <div className="min-h-screen bg-background">
        <ChecklistExecutionPage
          executionId={executionId}
          userId={checklist.user_id}
          onBack={resetSession}
          onComplete={() => setCompleted(true)}
        />
        <Toaster />
      </div>
    );
  }

  // PIN entry
  const SectorIcon = SECTOR_ICONS[checklist.sector];
  const color = checklist.color || "#6366f1";

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full space-y-4">
        <div className="flex justify-center">
          <Logo size="lg" />
        </div>

        <Card>
          <CardHeader className="text-center space-y-3">
            <h1 className="text-2xl font-bold">{checklist.name}</h1>
            <div
              className="inline-flex mx-auto items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium text-white"
              style={{ backgroundColor: color }}
            >
              <SectorIcon className="h-4 w-4" />
              {SECTOR_LABELS[checklist.sector]}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-center space-y-1">
              <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Lock className="h-6 w-6 text-primary" />
              </div>
              <CardTitle className="text-lg">Identifique-se</CardTitle>
              <p className="text-sm text-muted-foreground">Digite seu PIN de 4 dígitos</p>
            </div>

            <div className="flex justify-center">
              <InputOTP
                maxLength={4}
                value={pin}
                onChange={setPin}
                disabled={isBlocked || validating}
              >
                <InputOTPGroup>
                  <InputOTPSlot index={0} className="h-14 w-14 text-xl" />
                  <InputOTPSlot index={1} className="h-14 w-14 text-xl" />
                  <InputOTPSlot index={2} className="h-14 w-14 text-xl" />
                  <InputOTPSlot index={3} className="h-14 w-14 text-xl" />
                </InputOTPGroup>
              </InputOTP>
            </div>

            {error && (
              <p className="text-sm text-destructive text-center font-medium">
                {isBlocked ? `${error.split("Aguarde")[0]}Aguarde ${remainingSec}s.` : error}
              </p>
            )}

            <Button
              className="w-full h-12 text-base"
              onClick={handleSubmit}
              disabled={pin.length !== 4 || validating || isBlocked}
            >
              {validating ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : null}
              {isBlocked ? `Bloqueado (${remainingSec}s)` : "Entrar"}
            </Button>
          </CardContent>
        </Card>
      </div>
      <Toaster />
    </div>
  );
}
