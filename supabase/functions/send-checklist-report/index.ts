import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendMail } from "../_shared/smtp-mailer.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function yesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split("T")[0];
}

function formatDatePtBR(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const months = [
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
  ];
  const weekdays = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
  const d = new Date(year, month - 1, day);
  return `${weekdays[d.getDay()]}, ${day} de ${months[month - 1]} de ${year}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const { user_id, report_date, test_email } = body as { user_id?: string; report_date?: string; test_email?: string };

    // Cron mode: sem user_id → processa todos os usuários habilitados
    if (!user_id) {
      return await handleCron(supabase);
    }

    // Manual mode: user_id específico (test_email substitui o e-mail salvo no banco)
    const date = report_date || yesterday();
    const result = await sendReportForUser(supabase, user_id, date, test_email);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("send-checklist-report error:", message);
    return new Response(JSON.stringify({ error: "Falha ao processar relatório" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function handleCron(supabase: ReturnType<typeof createClient>) {
  const now = new Date();
  const currentHour = String(now.getUTCHours()).padStart(2, "0");
  const date = yesterday();

  const { data: settings, error } = await supabase
    .from("operational_task_settings")
    .select("user_id, email_report_time, email_report_address")
    .eq("email_report_enabled", true)
    .not("email_report_address", "is", null);

  if (error) throw error;
  if (!settings || settings.length === 0) {
    return new Response(
      JSON.stringify({ message: "Nenhum usuário com relatório por e-mail habilitado" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // UTC offset reference: email_report_time is stored as HH:MM in local time (BRT = UTC-3)
  // We match by comparing UTC hour with the stored time adjusted by -3h
  // For simplicity: match users whose local send hour equals current UTC hour + 3
  const results: { user_id: string; status: string }[] = [];
  for (const s of settings) {
    const reportHour = (s.email_report_time || "08:00").substring(0, 2);
    const reportHourUtc = String((Number(reportHour) + 3) % 24).padStart(2, "0");
    if (reportHourUtc === currentHour) {
      try {
        const r = await sendReportForUser(supabase, s.user_id, date);
        results.push({ user_id: s.user_id, status: r.status });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "erro";
        console.error(`Falha ao enviar relatório para ${s.user_id}:`, msg);
        results.push({ user_id: s.user_id, status: "failed" });
      }
    }
  }

  return new Response(JSON.stringify({ processed: results.length, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sendReportForUser(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  reportDate: string,
  testEmail?: string,
): Promise<{ status: string; stats?: Record<string, unknown> }> {
  // Fetch settings
  const { data: settings } = await supabase
    .from("operational_task_settings")
    .select("email_report_address, email_report_include_checklists, email_report_include_tasks")
    .eq("user_id", userId)
    .maybeSingle();

  // test_email (passado pelo botão de teste na UI) tem prioridade sobre o e-mail salvo no banco
  const recipientEmail = testEmail || settings?.email_report_address;

  if (!recipientEmail) {
    await logReport(supabase, userId, reportDate, null, "skipped", null, null);
    return { status: "skipped" };
  }

  const includeChecklists = settings?.email_report_include_checklists !== false;
  const includeTasks = settings?.email_report_include_tasks !== false;

  // ---- Checklist data ----
  let checklistStats = {
    total: 0, concluido: 0, atrasado: 0, nao_iniciado: 0, em_andamento: 0,
    executions: [] as Array<{ name: string; sector: string; status: string; score: number | null }>,
    criticalFailures: [] as Array<{ checklist: string; item: string }>,
    openAlerts: 0,
  };

  if (includeChecklists) {
    const { data: executions } = await supabase
      .from("checklist_executions")
      .select("id, status, score, checklist_id, checklists(name, sector)")
      .eq("user_id", userId)
      .eq("execution_date", reportDate);

    for (const ex of executions || []) {
      checklistStats.total++;
      const s = ex.status as string;
      if (s === "concluido") checklistStats.concluido++;
      else if (s === "atrasado") checklistStats.atrasado++;
      else if (s === "nao_iniciado") checklistStats.nao_iniciado++;
      else if (s === "em_andamento") checklistStats.em_andamento++;

      const ch = ex.checklists as { name: string; sector: string } | null;
      checklistStats.executions.push({
        name: ch?.name || "—",
        sector: ch?.sector || "—",
        status: s,
        score: ex.score,
      });

      // Critical failures for this execution
      const { data: critItems } = await supabase
        .from("checklist_execution_items")
        .select("id, item_id, value, is_compliant, checklist_items(title, is_critical)")
        .eq("execution_id", ex.id);

      for (const ci of critItems || []) {
        const item = ci.checklist_items as { title: string; is_critical: boolean } | null;
        if (item?.is_critical && (ci.is_compliant === false || ci.value === null)) {
          checklistStats.criticalFailures.push({
            checklist: ch?.name || "—",
            item: item.title,
          });
        }
      }
    }

    // Open alerts for the day
    const alertStart = `${reportDate}T00:00:00`;
    const alertEnd = `${reportDate}T23:59:59`;
    const { count: alertCount } = await supabase
      .from("checklist_alerts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("is_acknowledged", false)
      .gte("created_at", alertStart)
      .lte("created_at", alertEnd);

    checklistStats.openAlerts = alertCount || 0;
  }

  // ---- Operational tasks data ----
  let taskStats = {
    total: 0, done: 0, skipped: 0, pending: 0,
    byShift: {} as Record<string, { done: number; skipped: number; pending: number }>,
  };

  if (includeTasks) {
    const { data: tasks } = await supabase
      .from("operational_task_instances")
      .select("status, shift")
      .eq("user_id", userId)
      .eq("task_date", reportDate);

    for (const t of tasks || []) {
      taskStats.total++;
      const shift = t.shift || "Sem turno";
      if (!taskStats.byShift[shift]) taskStats.byShift[shift] = { done: 0, skipped: 0, pending: 0 };

      if (t.status === "done") { taskStats.done++; taskStats.byShift[shift].done++; }
      else if (t.status === "skipped") { taskStats.skipped++; taskStats.byShift[shift].skipped++; }
      else { taskStats.pending++; taskStats.byShift[shift].pending++; }
    }
  }

  const completionRate = checklistStats.total > 0
    ? Math.round((checklistStats.concluido / checklistStats.total) * 100)
    : null;

  const stats = { checklistStats, taskStats, completionRate, reportDate };

  // ---- Render HTML ----
  const html = renderEmailHtml({
    reportDate,
    includeChecklists,
    includeTasks,
    checklistStats,
    taskStats,
    completionRate,
  });

  // ---- Send email ----
  try {
    await sendMail({
      to: recipientEmail,
      subject: `Velara · Relatório de ${formatDatePtBR(reportDate)}`,
      html,
    });

    await logReport(supabase, userId, reportDate, recipientEmail, "sent", null, stats);
    return { status: "sent", stats };
  } catch (smtpErr: unknown) {
    // Log error internally — never expose SMTP details in response
    const safeMsg = "Falha no envio SMTP";
    console.error("SMTP error for user", userId, ":", smtpErr instanceof Error ? smtpErr.message : smtpErr);
    await logReport(supabase, userId, reportDate, recipientEmail, "failed", safeMsg, stats);
    return { status: "failed" };
  }
}

async function logReport(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  reportDate: string,
  recipientEmail: string | null,
  status: "sent" | "failed" | "skipped",
  errorMessage: string | null,
  stats: Record<string, unknown> | null,
) {
  await supabase.from("checklist_report_logs").insert({
    user_id: userId,
    report_date: reportDate,
    recipient_email: recipientEmail,
    status,
    error_message: errorMessage,
    stats,
  });
}

// ---- HTML Template ----
interface RenderOptions {
  reportDate: string;
  includeChecklists: boolean;
  includeTasks: boolean;
  checklistStats: {
    total: number; concluido: number; atrasado: number; nao_iniciado: number; em_andamento: number;
    executions: Array<{ name: string; sector: string; status: string; score: number | null }>;
    criticalFailures: Array<{ checklist: string; item: string }>;
    openAlerts: number;
  };
  taskStats: {
    total: number; done: number; skipped: number; pending: number;
    byShift: Record<string, { done: number; skipped: number; pending: number }>;
  };
  completionRate: number | null;
}

const SECTOR_LABELS: Record<string, string> = {
  cozinha: "Cozinha", salao: "Salão", caixa: "Caixa",
  bar: "Bar", estoque: "Estoque", gerencia: "Gerência",
};

const STATUS_LABELS: Record<string, string> = {
  concluido: "Concluído", atrasado: "Atrasado",
  nao_iniciado: "Não iniciado", em_andamento: "Em andamento", pendente: "Pendente",
};

const STATUS_BADGE: Record<string, { bg: string; color: string; label: string }> = {
  concluido:    { bg: "#dcfce7", color: "#166534", label: "Concluído" },
  atrasado:     { bg: "#fee2e2", color: "#991b1b", label: "Atrasado" },
  nao_iniciado: { bg: "#f1f5f9", color: "#475569", label: "Não iniciado" },
  em_andamento: { bg: "#fef3c7", color: "#92400e", label: "Em andamento" },
  pendente:     { bg: "#f1f5f9", color: "#475569", label: "Pendente" },
};

function scoreBar(score: number | null): string {
  if (score === null) return `<span style="color:#94a3b8;font-size:12px;">—</span>`;
  const pct = Math.min(100, Math.max(0, score));
  const fill = pct >= 80 ? "#16a34a" : pct >= 50 ? "#d97706" : "#dc2626";
  const emptyW = Math.round(60 * (1 - pct / 100));
  const fillW = 60 - emptyW;
  return `
    <table cellpadding="0" cellspacing="0" style="display:inline-table;vertical-align:middle;margin-right:6px;">
      <tr>
        ${fillW > 0 ? `<td width="${fillW}" height="5" style="background:${fill};border-radius:3px 0 0 3px;font-size:0;">&nbsp;</td>` : ""}
        ${emptyW > 0 ? `<td width="${emptyW}" height="5" style="background:#e5e7eb;border-radius:${fillW === 0 ? "3px" : "0 3px 3px 0"};font-size:0;">&nbsp;</td>` : ""}
      </tr>
    </table>
    <span style="font-size:12px;color:#0f172a;font-weight:600;">${pct.toFixed(0)}%</span>`;
}

function renderEmailHtml(opts: RenderOptions): string {
  const { reportDate, includeChecklists, includeTasks, checklistStats, taskStats, completionRate } = opts;
  const appUrl = (Deno.env.get("APP_URL") || "https://velaraia.app").replace(/\/$/, "");
  const logoUrl = "http://site.agenciaquantique.com.br/wp-content/uploads/2026/06/logo_velara_preto-1.png";

  const rateColor = completionRate === null ? "#64748b"
    : completionRate >= 80 ? "#16a34a"
    : completionRate >= 50 ? "#d97706"
    : "#dc2626";

  const heroStatus = completionRate === null ? ""
    : completionRate >= 80 ? "Bom desempenho"
    : completionRate >= 50 ? "Atenção necessária"
    : "Situação crítica";

  // --- Metric cards ---
  const metricCards = includeChecklists ? `
    <td width="33%" style="padding:0 5px 0 0;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f8f5;border:1px solid #e5e7eb;border-top:3px solid #f5c400;border-radius:10px;">
        <tr><td style="padding:16px 14px;text-align:center;">
          <p style="margin:0;font-size:22px;font-weight:700;color:#0f172a;line-height:1;">${checklistStats.concluido}/${checklistStats.total}</p>
          <p style="margin:6px 0 0;font-size:11px;color:#64748b;line-height:1.4;">Checklists<br/>concluídos</p>
        </td></tr>
      </table>
    </td>
    <td width="33%" style="padding:0 2px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f8f5;border:1px solid #e5e7eb;border-top:3px solid #f5c400;border-radius:10px;">
        <tr><td style="padding:16px 14px;text-align:center;">
          <p style="margin:0;font-size:22px;font-weight:700;color:${rateColor};line-height:1;">${completionRate !== null ? `${completionRate}%` : "—"}</p>
          <p style="margin:6px 0 0;font-size:11px;color:#64748b;line-height:1.4;">Taxa de<br/>conclusão</p>
        </td></tr>
      </table>
    </td>
    <td width="33%" style="padding:0 0 0 5px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f8f5;border:1px solid #e5e7eb;border-top:3px solid ${checklistStats.openAlerts > 0 ? "#dc2626" : "#f5c400"};border-radius:10px;">
        <tr><td style="padding:16px 14px;text-align:center;">
          <p style="margin:0;font-size:22px;font-weight:700;color:${checklistStats.openAlerts > 0 ? "#dc2626" : "#0f172a"};line-height:1;">${checklistStats.openAlerts}</p>
          <p style="margin:6px 0 0;font-size:11px;color:#64748b;line-height:1.4;">Alertas<br/>em aberto</p>
        </td></tr>
      </table>
    </td>` : includeTasks ? `
    <td width="33%" style="padding:0 5px 0 0;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f8f5;border:1px solid #e5e7eb;border-top:3px solid #f5c400;border-radius:10px;">
        <tr><td style="padding:16px 14px;text-align:center;">
          <p style="margin:0;font-size:22px;font-weight:700;color:#0f172a;line-height:1;">${taskStats.done}/${taskStats.total}</p>
          <p style="margin:6px 0 0;font-size:11px;color:#64748b;line-height:1.4;">Tarefas<br/>concluídas</p>
        </td></tr>
      </table>
    </td>
    <td width="33%" style="padding:0 2px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f8f5;border:1px solid #e5e7eb;border-top:3px solid #f5c400;border-radius:10px;">
        <tr><td style="padding:16px 14px;text-align:center;">
          <p style="margin:0;font-size:22px;font-weight:700;color:#d97706;line-height:1;">${taskStats.skipped}</p>
          <p style="margin:6px 0 0;font-size:11px;color:#64748b;line-height:1.4;">Tarefas<br/>puladas</p>
        </td></tr>
      </table>
    </td>
    <td width="33%" style="padding:0 0 0 5px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f8f5;border:1px solid #e5e7eb;border-top:3px solid #f5c400;border-radius:10px;">
        <tr><td style="padding:16px 14px;text-align:center;">
          <p style="margin:0;font-size:22px;font-weight:700;color:#64748b;line-height:1;">${taskStats.pending}</p>
          <p style="margin:6px 0 0;font-size:11px;color:#64748b;line-height:1.4;">Tarefas<br/>pendentes</p>
        </td></tr>
      </table>
    </td>` : "";

  // --- Checklist section ---
  const checklistSection = includeChecklists ? `
    <p style="font-size:14px;font-weight:700;color:#0f172a;margin:32px 0 12px 0;padding-bottom:8px;border-bottom:2px solid #f5c400;letter-spacing:0.2px;">Checklists do dia</p>
    ${checklistStats.total === 0
      ? `<p style="color:#94a3b8;font-size:14px;margin:0;">Nenhum checklist registrado para este dia.</p>`
      : `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px;">
          <thead>
            <tr style="background:#f8f8f5;">
              <th style="padding:9px 12px;text-align:left;color:#64748b;font-weight:600;font-size:11px;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">CHECKLIST</th>
              <th style="padding:9px 12px;text-align:left;color:#64748b;font-weight:600;font-size:11px;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">SETOR</th>
              <th style="padding:9px 12px;text-align:left;color:#64748b;font-weight:600;font-size:11px;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">STATUS</th>
              <th style="padding:9px 12px;text-align:left;color:#64748b;font-weight:600;font-size:11px;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">SCORE</th>
            </tr>
          </thead>
          <tbody>
            ${checklistStats.executions.map((ex, i) => {
              const badge = STATUS_BADGE[ex.status] || { bg: "#f1f5f9", color: "#475569", label: ex.status };
              return `
              <tr style="background:${i % 2 === 0 ? "#ffffff" : "#fafaf8"};">
                <td style="padding:10px 12px;color:#0f172a;font-weight:500;border-bottom:1px solid #f1f5f9;">${ex.name}</td>
                <td style="padding:10px 12px;color:#64748b;border-bottom:1px solid #f1f5f9;">${SECTOR_LABELS[ex.sector] || ex.sector}</td>
                <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;">
                  <span style="background:${badge.bg};color:${badge.color};font-size:11px;font-weight:600;padding:3px 10px;border-radius:20px;white-space:nowrap;">${badge.label}</span>
                </td>
                <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;white-space:nowrap;">${scoreBar(ex.score)}</td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>`
    }
    ${checklistStats.criticalFailures.length > 0 ? `
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;">
        <tr>
          <td style="background:#fff5f5;border:1px solid #fecaca;border-left:3px solid #dc2626;border-radius:8px;padding:14px 18px;">
            <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#dc2626;">⚠️ Itens críticos em aberto (${checklistStats.criticalFailures.length})</p>
            ${checklistStats.criticalFailures.map(f =>
              `<p style="margin:4px 0;font-size:12px;color:#7f1d1d;"><span style="font-weight:600;">${f.checklist}</span> — ${f.item}</p>`
            ).join("")}
          </td>
        </tr>
      </table>` : ""}
  ` : "";

  // --- Task section ---
  const taskSection = includeTasks ? `
    <p style="font-size:14px;font-weight:700;color:#0f172a;margin:32px 0 12px 0;padding-bottom:8px;border-bottom:2px solid #f5c400;letter-spacing:0.2px;">Tarefas operacionais</p>
    ${taskStats.total === 0
      ? `<p style="color:#94a3b8;font-size:14px;margin:0;">Nenhuma tarefa operacional registrada para este dia.</p>`
      : Object.entries(taskStats.byShift).map(([shift, counts]) => `
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:10px;">
            <tr>
              <td style="background:#f8f8f5;border:1px solid #e5e7eb;border-top:3px solid #f5c400;border-radius:8px;padding:14px 16px;">
                <p style="margin:0 0 10px;font-size:13px;font-weight:700;color:#0f172a;">${shift}</p>
                <table cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding-right:8px;">
                      <span style="font-size:12px;background:#dcfce7;color:#166534;padding:4px 12px;border-radius:20px;white-space:nowrap;font-weight:600;">✓ ${counts.done} feitas</span>
                    </td>
                    <td style="padding-right:8px;">
                      <span style="font-size:12px;background:#fef3c7;color:#92400e;padding:4px 12px;border-radius:20px;white-space:nowrap;font-weight:600;">↷ ${counts.skipped} puladas</span>
                    </td>
                    ${counts.pending > 0 ? `<td>
                      <span style="font-size:12px;background:#f1f5f9;color:#475569;padding:4px 12px;border-radius:20px;white-space:nowrap;font-weight:600;">○ ${counts.pending} pendentes</span>
                    </td>` : ""}
                  </tr>
                </table>
              </td>
            </tr>
          </table>`).join("")
    }
  ` : "";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <title>Velara · Relatório de ${formatDatePtBR(reportDate)}</title>
</head>
<body style="margin:0;padding:0;background:#f7f7f3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f7f3;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,.08);">

          <!-- Header: fundo branco, logo preto real -->
          <tr>
            <td style="background:#ffffff;padding:32px 36px 24px;border-bottom:3px solid #f5c400;">
              <img src="${logoUrl}" alt="Velara" width="130" style="display:block;width:130px;height:auto;border:0;" />
              <p style="margin:14px 0 2px;font-size:12px;font-weight:600;color:#64748b;letter-spacing:0.5px;text-transform:uppercase;">Relatório diário de checklists</p>
              <p style="margin:0;font-size:13px;color:#0f172a;">${formatDatePtBR(reportDate)}</p>
            </td>
          </tr>

          ${(includeChecklists && completionRate !== null) ? `
          <!-- Hero: taxa de conclusão em destaque -->
          <tr>
            <td style="background:#f8f8f5;padding:24px 36px;border-bottom:1px solid #e5e7eb;">
              <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#64748b;letter-spacing:0.8px;text-transform:uppercase;">Resumo do dia</p>
              <p style="margin:0;font-size:48px;font-weight:800;color:${rateColor};line-height:1;">${completionRate}%</p>
              ${heroStatus ? `<p style="margin:6px 0 0;font-size:13px;color:#64748b;">${heroStatus}</p>` : ""}
            </td>
          </tr>` : ""}

          <!-- Body -->
          <tr>
            <td style="padding:28px 36px;">

              <!-- Metric cards -->
              ${metricCards ? `<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px;"><tr>${metricCards}</tr></table>` : ""}

              ${checklistSection}
              ${taskSection}

              ${!includeChecklists && !includeTasks ? `
                <p style="color:#94a3b8;font-size:14px;text-align:center;padding:40px 0;margin:0;">
                  Nenhuma seção habilitada para este relatório.
                </p>
              ` : ""}

              <!-- CTA -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:36px;">
                <tr>
                  <td align="center">
                    <a href="${appUrl}/pdv/tarefas" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:14px 36px;border-radius:8px;letter-spacing:0.3px;">
                      Ver no Velara →
                    </a>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer: fundo claro -->
          <tr>
            <td style="background:#f8f8f5;padding:20px 36px;border-top:1px solid #e5e7eb;">
              <p style="margin:0;font-size:11px;color:#94a3b8;text-align:center;line-height:1.7;">
                Você recebeu este relatório por estar cadastrado como proprietário ou gestor no Velara.<br/>
                Para alterar suas preferências, acesse
                <a href="${appUrl}/pdv/tarefas" style="color:#0f172a;text-decoration:underline;">Configurações → Relatórios</a>.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
