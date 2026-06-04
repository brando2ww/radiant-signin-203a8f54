import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const evoUrl = Deno.env.get("EVOLUTION_API_URL")!;
    const evoKey = Deno.env.get("EVOLUTION_API_KEY")!;

    if (!evoUrl || !evoKey) {
      console.error("Evolution não configurado");
      return new Response(
        JSON.stringify({ error: "WhatsApp não está configurado no servidor. Solicite ativação ao suporte.", code: "evolution_not_configured" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const supabase = createClient(supabaseUrl, serviceKey);

    const { user_id, date } = await req.json();

    // If called via cron (no user_id), process all enabled tenants
    if (!user_id) {
      return await handleCron(supabase, evoUrl, evoKey);
    }

    const today = date || new Date().toISOString().split("T")[0];
    const result = await sendReportForUser(supabase, evoUrl, evoKey, user_id, today);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("send-tasks-report error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function handleCron(supabase: any, evoUrl: string, evoKey: string) {
  const now = new Date();
  const currentHour = String(now.getHours()).padStart(2, "0");
  const currentMinute = String(now.getMinutes()).padStart(2, "0");
  const currentTime = `${currentHour}:${currentMinute}`;
  const today = now.toISOString().split("T")[0];

  // Find all users with auto report enabled and matching time (within 30min window)
  const { data: settings, error } = await supabase
    .from("operational_task_settings")
    .select("user_id, whatsapp_report_time")
    .eq("whatsapp_report_enabled", true)
    .not("whatsapp_report_phone", "is", null);

  if (error) throw error;
  if (!settings || settings.length === 0) {
    return new Response(JSON.stringify({ message: "No users with auto report enabled" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const results = [];
  for (const s of settings) {
    const reportTime = s.whatsapp_report_time || "23:00";
    // Check if current time matches (exact hour match)
    if (reportTime.substring(0, 2) === currentHour) {
      try {
        const r = await sendReportForUser(supabase, evoUrl, evoKey, s.user_id, today);
        results.push({ user_id: s.user_id, ...r });
      } catch (e: any) {
        results.push({ user_id: s.user_id, error: e.message });
      }
    }
  }

  return new Response(JSON.stringify({ processed: results.length, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sendReportForUser(
  supabase: any,
  evoUrl: string,
  evoKey: string,
  userId: string,
  date: string
) {
  // 1. Get task settings
  const { data: settings, error: settingsErr } = await supabase
    .from("operational_task_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (settingsErr) throw settingsErr;
  if (!settings?.whatsapp_report_phone) {
    throw new Error("Número de telefone para relatório não configurado");
  }

  // 2. Get WhatsApp connection (check own user + establishment owner)
  let conn = null;
  const { data: ownConn } = await supabase
    .from("whatsapp_connections")
    .select("instance_name")
    .eq("user_id", userId)
    .eq("connection_status", "open")
    .maybeSingle();

  conn = ownConn;

  if (!conn) {
    // Check if user is an establishment user and use owner's connection
    const { data: estUser } = await supabase
      .from("establishment_users")
      .select("establishment_owner_id")
      .eq("user_id", userId)
      .eq("is_active", true)
      .maybeSingle();

    if (estUser?.establishment_owner_id) {
      const { data: ownerConn } = await supabase
        .from("whatsapp_connections")
        .select("instance_name")
        .eq("user_id", estUser.establishment_owner_id)
        .eq("connection_status", "open")
        .maybeSingle();
      conn = ownerConn;
    }
  }

  if (!conn) {
    throw new Error("WhatsApp não está conectado. Conecte primeiro nas configurações.");
  }

  // 3. Get task instances for the date
  const { data: tasks, error: tasksErr } = await supabase
    .from("operational_task_instances")
    .select("*")
    .eq("user_id", userId)
    .eq("task_date", date)
    .order("shift")
    .order("title");

  if (tasksErr) throw tasksErr;
  if (!tasks || tasks.length === 0) {
    throw new Error("Nenhuma tarefa encontrada para esta data");
  }

  // 4. Get shifts config
  const shifts = (settings.shifts as any[]) || [
    { name: "Abertura", start: "06:00", end: "11:00" },
    { name: "Tarde", start: "11:00", end: "17:00" },
    { name: "Fechamento", start: "17:00", end: "23:00" },
  ];

  // 5. Build message chunks
  const messages = buildReportMessages(tasks, shifts, date);

  // 6. Validate destination and send via Evolution API
  let phone = settings.whatsapp_report_phone.replace(/\D/g, "");
  if (!phone.startsWith("55")) {
    phone = "55" + phone;
  }
  console.log("Sending report to phone:", phone, "parts:", messages.length);
  const instanceName = encodeURIComponent(conn.instance_name);
  const numberCheckUrl = `${evoUrl}/chat/whatsappNumbers/${instanceName}`;
  const sendUrl = `${evoUrl}/message/sendText/${instanceName}`;
  console.log("Evolution number check URL:", numberCheckUrl);
  console.log("Evolution send URL:", sendUrl);

  const numberCheckResponse = await fetch(numberCheckUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: evoKey,
    },
    body: JSON.stringify({ numbers: [phone] }),
  });

  if (!numberCheckResponse.ok) {
    const errorText = await numberCheckResponse.text();
    console.error("Error checking WhatsApp number:", errorText);
    throw new Error("Erro ao verificar número do WhatsApp antes do envio.");
  }

  const numberCheckResult = await numberCheckResponse.json();
  console.log("WhatsApp number check result:", JSON.stringify(numberCheckResult));
  const numberInfo = Array.isArray(numberCheckResult) ? numberCheckResult[0] : numberCheckResult;

  if (!numberInfo?.exists) {
    throw new Error(
      `O número ${settings.whatsapp_report_phone} não foi encontrado no WhatsApp. Verifique se o número está correto e possui WhatsApp ativo.`
    );
  }

  for (let partIndex = 0; partIndex < messages.length; partIndex++) {
    const text = messages[partIndex];
    const evoResponse = await fetch(sendUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: evoKey,
      },
      body: JSON.stringify({
        number: phone,
        text,
      }),
    });

    const responseBody = await evoResponse.text();
    console.log(`Evolution API response (part ${partIndex + 1}/${messages.length}):`, evoResponse.status, responseBody);

    try {
      const parsed = JSON.parse(responseBody);
      const msgs = parsed?.response?.message || (Array.isArray(parsed) ? parsed : [parsed]);
      if (Array.isArray(msgs) && msgs.some((m: any) => m.exists === false)) {
        throw new Error(
          `O número ${settings.whatsapp_report_phone} não foi encontrado no WhatsApp. Verifique se o número está correto e possui WhatsApp ativo.`
        );
      }
    } catch (parseErr: any) {
      if (parseErr.message.includes("não foi encontrado")) throw parseErr;
    }

    if (!evoResponse.ok) {
      throw new Error(`Falha ao enviar mensagem via WhatsApp (status ${evoResponse.status})`);
    }

    if (partIndex < messages.length - 1) {
      await new Promise((r) => setTimeout(r, 350));
    }
  }

  return { success: true, message: "Relatório enviado com sucesso!", parts: messages.length };
}

function buildReportMessages(tasks: any[], shifts: any[], date: string) {
  const shiftEmojis: Record<string, string> = {
    "Abertura": "🌅",
    "Tarde": "☀️",
    "Fechamento": "🌙",
  };

  const [y, m, d] = date.split("-");
  const formattedDate = `${d}/${m}/${y}`;

  const total = tasks.length;
  const done = tasks.filter((t: any) => t.status === "done").length;
  const pending = total - done;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  const grouped: Record<string, any[]> = {};
  for (const t of tasks) {
    if (!grouped[t.shift]) grouped[t.shift] = [];
    grouped[t.shift].push(t);
  }

  const sections: string[] = [];
  sections.push(`📋 *Relatório de Tarefas — ${formattedDate}*\n\n✅ Concluídas: ${done}/${total} (${pct}%)`);

  for (const shift of shifts) {
    const shiftTasks = grouped[shift.name] || [];
    if (shiftTasks.length === 0) continue;

    const emoji = shiftEmojis[shift.name] || "📌";
    let section = `*${emoji} ${shift.name} (${shift.start}-${shift.end})*\n`;

    for (const t of shiftTasks) {
      if (t.status === "done") {
        const completedTime = t.completed_at
          ? new Date(t.completed_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
          : "";
        const by = t.completed_by ? ` — ${t.completed_by}` : "";
        section += `✅ ${t.title}${by} ${completedTime}\n`;
      } else if (t.status === "skipped") {
        section += `⏭️ ${t.title} (pulada)\n`;
      } else {
        section += `❌ ${t.title}\n`;
      }
    }

    sections.push(section.trimEnd());
  }

  sections.push(
    pending > 0
      ? `📊 *Pendentes: ${pending} tarefa${pending > 1 ? "s" : ""} não concluída${pending > 1 ? "s" : ""}*`
      : `🎉 *Todas as tarefas foram concluídas!*`
  );

  return sections;
}
