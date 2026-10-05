import {
  addDays, addHours, differenceInMinutes, endOfDay, format, isSameDay, isToday, isTomorrow, isYesterday, parseISO, startOfDay,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  CalendarDays, CheckSquare, MapPin, Phone, Truck, Users, type LucideIcon,
} from "lucide-react";
import type { AgendaTipo } from "@/lib/vendas/types";
import { AGENDA_TIPO_LABEL } from "@/lib/vendas/types";
import type { AgendaCliente, AgendaCompromisso } from "@/hooks/use-vendas-agenda";

export const LOCALE = ptBR;
/** Semana começa na segunda. */
export const SEMANA = { weekStartsOn: 1 as const, locale: ptBR };

type EstiloTipo = {
  label: string;
  icon: LucideIcon;
  /** Etiqueta (fundo claro, texto escuro; o inverso no tema escuro). */
  chip: string;
  /** Bolinha e filete lateral. */
  dot: string;
  borda: string;
};

export const TIPOS: Record<AgendaTipo, EstiloTipo> = {
  visita: {
    label: AGENDA_TIPO_LABEL.visita,
    icon: MapPin,
    chip: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-100",
    dot: "bg-sky-500",
    borda: "border-l-sky-500",
  },
  ligacao: {
    label: AGENDA_TIPO_LABEL.ligacao,
    icon: Phone,
    chip: "bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-100",
    dot: "bg-violet-500",
    borda: "border-l-violet-500",
  },
  reuniao: {
    label: AGENDA_TIPO_LABEL.reuniao,
    icon: Users,
    chip: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100",
    dot: "bg-amber-500",
    borda: "border-l-amber-500",
  },
  entrega: {
    label: AGENDA_TIPO_LABEL.entrega,
    icon: Truck,
    chip: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100",
    dot: "bg-emerald-500",
    borda: "border-l-emerald-500",
  },
  tarefa: {
    label: AGENDA_TIPO_LABEL.tarefa,
    icon: CheckSquare,
    chip: "bg-teal-100 text-teal-900 dark:bg-teal-950 dark:text-teal-100",
    dot: "bg-teal-500",
    borda: "border-l-teal-500",
  },
  outro: {
    label: AGENDA_TIPO_LABEL.outro,
    icon: CalendarDays,
    chip: "bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100",
    dot: "bg-slate-500",
    borda: "border-l-slate-500",
  },
};

export const ORDEM_TIPOS: AgendaTipo[] = ["visita", "ligacao", "reuniao", "entrega", "tarefa", "outro"];

export const STATUS_LABEL: Record<AgendaCompromisso["status"], string> = {
  scheduled: "Agendado",
  done: "Feito",
  cancelled: "Cancelado",
};

export const inicioDe = (c: Pick<AgendaCompromisso, "starts_at">) => parseISO(c.starts_at);

/** Fim para desenhar e para saber se atrasou: dia todo vai até o fim do dia; sem fim marcado, conta uma hora. */
export function fimDe(c: Pick<AgendaCompromisso, "starts_at" | "ends_at" | "all_day">) {
  const ini = inicioDe(c);
  if (c.all_day) return endOfDay(ini);
  if (c.ends_at) return parseISO(c.ends_at);
  return addHours(ini, 1);
}

/** Agendado e o horário já passou (com fim marcado, conta o fim; sem fim, o início; dia todo, o fim do dia). */
export function estaAtrasado(c: Pick<AgendaCompromisso, "status" | "starts_at" | "ends_at" | "all_day">, agora = new Date()) {
  if (c.status !== "scheduled") return false;
  const limite = c.all_day ? endOfDay(inicioDe(c)) : c.ends_at ? parseISO(c.ends_at) : inicioDe(c);
  return limite < agora;
}

export const hhmm = (d: Date) => format(d, "HH:mm");

export function horarioTexto(c: Pick<AgendaCompromisso, "starts_at" | "ends_at" | "all_day">) {
  if (c.all_day) return "Dia todo";
  const ini = inicioDe(c);
  if (!c.ends_at) return hhmm(ini);
  const fim = parseISO(c.ends_at);
  if (!isSameDay(ini, fim)) return `${hhmm(ini)} até ${format(fim, "dd/MM HH:mm")}`;
  return `${hhmm(ini)} às ${hhmm(fim)}`;
}

/** "Hoje", "Amanhã", "Ontem" ou "qua., 08/10". */
export function diaCurto(d: Date) {
  if (isToday(d)) return "Hoje";
  if (isTomorrow(d)) return "Amanhã";
  if (isYesterday(d)) return "Ontem";
  return format(d, "EEE, dd/MM", { locale: ptBR });
}

export function diaLongo(d: Date) {
  const base = format(d, "EEEE, d 'de' MMMM", { locale: ptBR });
  const texto = base.charAt(0).toUpperCase() + base.slice(1);
  if (isToday(d)) return `Hoje · ${texto}`;
  if (isTomorrow(d)) return `Amanhã · ${texto}`;
  return texto;
}

export const capitalizar = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

export function nomeCliente(c: { name: string; trade_name?: string | null } | null | undefined) {
  if (!c) return null;
  return c.trade_name?.trim() || c.name;
}

export function enderecoCliente(c: AgendaCliente | null | undefined) {
  if (!c) return "";
  const rua = [c.street, c.address_number].filter((x) => x && String(x).trim()).join(", ");
  const comp = c.complement?.trim();
  const cidade = [c.city, c.state].filter(Boolean).join("/");
  return [rua + (comp ? ` (${comp})` : ""), c.district, cidade].filter((x) => x && String(x).trim()).join(" · ");
}

const formatarFone = (s: string | null | undefined) => {
  const d = (s ?? "").replace(/\D/g, "");
  if (d.length === 11) return d.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
  if (d.length === 10) return d.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
  return s?.trim() || "";
};

/** Local sugerido ao escolher o cliente: na ligação, o telefone; nos demais, o endereço. */
export function localSugerido(c: AgendaCliente | null | undefined, kind: AgendaTipo) {
  if (!c) return "";
  if (kind === "ligacao") {
    const fone = formatarFone(c.phone || c.whatsapp);
    if (fone) return fone;
  }
  return enderecoCliente(c);
}

export const moeda = (v: number | null | undefined) =>
  (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Duração em minutos para manter ao reagendar. */
export function duracaoMin(c: Pick<AgendaCompromisso, "starts_at" | "ends_at" | "all_day">) {
  if (c.all_day || !c.ends_at) return null;
  return Math.max(0, differenceInMinutes(parseISO(c.ends_at), inicioDe(c)));
}

/** Junta um dia (Date) e "HH:mm" num instante local. */
export function juntarDataHora(dia: Date, hora: string) {
  const [h, m] = hora.split(":").map((n) => parseInt(n, 10));
  const d = startOfDay(dia);
  d.setHours(Number.isFinite(h) ? h : 0, Number.isFinite(m) ? m : 0, 0, 0);
  return d;
}

// ── Exportar para outras agendas ─────────────────────────────────────────

const utcCompacto = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const diaCompacto = (d: Date) => format(d, "yyyyMMdd");

function descricaoExport(c: AgendaCompromisso) {
  const linhas = [
    TIPOS[c.kind]?.label,
    nomeCliente(c.customer) ? `Cliente: ${nomeCliente(c.customer)}` : null,
    c.proposta ? `Proposta ${c.proposta.number}` : null,
    c.notes?.trim() || null,
  ];
  return linhas.filter(Boolean).join("\n");
}

/** Link "Adicionar ao Google Agenda" (modelo de evento, não precisa de integração). */
export function googleAgendaUrl(c: AgendaCompromisso) {
  const ini = inicioDe(c);
  const datas = c.all_day
    ? `${diaCompacto(ini)}/${diaCompacto(addDays(ini, 1))}`
    : `${utcCompacto(ini)}/${utcCompacto(fimDe(c))}`;
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: c.title,
    dates: datas,
    details: descricaoExport(c),
  });
  if (c.location) p.set("location", c.location);
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

const escaparIcs = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Baixa um .ics (Outlook, Apple, Google importam). */
export function baixarIcs(c: AgendaCompromisso) {
  const ini = inicioDe(c);
  const linhas = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Velara//Forca de vendas//PT-BR",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${c.id}@velara`,
    `DTSTAMP:${utcCompacto(new Date())}`,
    ...(c.all_day
      ? [`DTSTART;VALUE=DATE:${diaCompacto(ini)}`, `DTEND;VALUE=DATE:${diaCompacto(addDays(ini, 1))}`]
      : [`DTSTART:${utcCompacto(ini)}`, `DTEND:${utcCompacto(fimDe(c))}`]),
    `SUMMARY:${escaparIcs(c.title)}`,
    ...(c.location ? [`LOCATION:${escaparIcs(c.location)}`] : []),
    `DESCRIPTION:${escaparIcs(descricaoExport(c))}`,
    c.status === "cancelled" ? "STATUS:CANCELLED" : "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  const blob = new Blob([linhas.join("\r\n")], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `compromisso-${format(ini, "yyyy-MM-dd")}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
