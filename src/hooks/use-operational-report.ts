import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishmentId } from "@/hooks/use-establishment-id";
import { differenceInCalendarDays, format, addDays, eachDayOfInterval } from "date-fns";

export type Sector = "cozinha" | "salao" | "caixa" | "bar" | "estoque" | "gerencia";
export type Shift = "manha" | "tarde" | "noite";

export const SECTOR_LABEL: Record<Sector, string> = {
  cozinha: "Cozinha",
  salao: "Salão",
  caixa: "Caixa",
  bar: "Bar",
  estoque: "Estoque",
  gerencia: "Gerência",
};

export const SHIFT_LABEL: Record<Shift, string> = {
  manha: "Manhã",
  tarde: "Tarde",
  noite: "Noite",
};

// Map UI shift to DB schedule shift values
const SHIFT_DB_MAP: Record<Shift, string[]> = {
  manha: ["manha", "abertura", "manhã"],
  tarde: ["tarde"],
  noite: ["noite", "fechamento"],
};

export interface ReportFilters {
  from: Date;
  to: Date;
  compareFrom: Date | null;
  compareTo: Date | null;
  sectors: Sector[];
  shifts: Shift[];
}

const fmt = (d: Date) => format(d, "yyyy-MM-dd");

interface ExecRow {
  id: string;
  status: string;
  score: number | null;
  execution_date: string;
  started_at: string | null;
  completed_at: string | null;
  operator_id: string | null;
  checklist_id: string;
  schedule_id: string | null;
  checklists: { name: string; sector: Sector | null } | null;
  checklist_schedules: { shift: string | null; start_time: string | null; max_duration_minutes: number | null } | null;
  checklist_operators: { name: string; sector: Sector | null; avatar_color: string | null } | null;
}

async function fetchExecs(userId: string, from: Date, to: Date): Promise<ExecRow[]> {
  const { data, error } = await supabase
    .from("checklist_executions")
    .select(
      "id,status,score,execution_date,started_at,completed_at,operator_id,checklist_id,schedule_id,checklists(name,sector),checklist_schedules(shift,start_time,max_duration_minutes),checklist_operators(name,sector,avatar_color)"
    )
    .eq("user_id", userId)
    .gte("execution_date", fmt(from))
    .lte("execution_date", fmt(to));
  if (error) throw error;
  return (data || []) as any as ExecRow[];
}

function filterExecs(execs: ExecRow[], filters: ReportFilters): ExecRow[] {
  return execs.filter((e) => {
    if (filters.sectors.length) {
      const s = (e.checklists?.sector || null) as Sector | null;
      if (!s || !filters.sectors.includes(s)) return false;
    }
    if (filters.shifts.length) {
      const sh = (e.checklist_schedules?.shift || "").toLowerCase();
      const ok = filters.shifts.some((f) => SHIFT_DB_MAP[f].includes(sh));
      if (!ok) return false;
    }
    return true;
  });
}

function isLate(e: ExecRow): boolean {
  if (e.status === "atrasado") return true;
  if (e.status === "concluido" && e.completed_at && e.checklist_schedules?.start_time && e.checklist_schedules?.max_duration_minutes) {
    const [h, m] = e.checklist_schedules.start_time.split(":").map(Number);
    const deadlineMin = h * 60 + m + (e.checklist_schedules.max_duration_minutes || 0);
    const d = new Date(e.completed_at);
    const compMin = d.getHours() * 60 + d.getMinutes();
    return compMin > deadlineMin;
  }
  return false;
}

export function useOperationalReport(filters: ReportFilters) {
  const { visibleUserId } = useEstablishmentId();

  const reportQuery = useQuery({
    queryKey: [
      "operational-report",
      visibleUserId,
      fmt(filters.from),
      fmt(filters.to),
      filters.compareFrom ? fmt(filters.compareFrom) : null,
      filters.compareTo ? fmt(filters.compareTo) : null,
      filters.sectors.sort().join(","),
      filters.shifts.sort().join(","),
    ],
    queryFn: async () => {
      if (!visibleUserId) return null;

      const [curRaw, prevRaw] = await Promise.all([
        fetchExecs(visibleUserId, filters.from, filters.to),
        filters.compareFrom && filters.compareTo
          ? fetchExecs(visibleUserId, filters.compareFrom, filters.compareTo)
          : Promise.resolve<ExecRow[]>([]),
      ]);

      const cur = filterExecs(curRaw, filters);
      const prev = filterExecs(prevRaw, filters);

      // ---- METRICS ----
      const total = cur.length;
      const completed = cur.filter((e) => e.status === "concluido").length;
      const overdue = cur.filter(isLate).length;
      const completionRate = total ? Math.round((completed / total) * 100) : 0;

      const prevTotal = prev.length;
      const prevCompleted = prev.filter((e) => e.status === "concluido").length;
      const prevOverdue = prev.filter(isLate).length;
      const prevRate = prevTotal ? Math.round((prevCompleted / prevTotal) * 100) : 0;

      const pct = (a: number, b: number) => (b === 0 ? (a > 0 ? 100 : 0) : Math.round(((a - b) / b) * 100));

      // ---- CRITICAL OPEN ----
      const execIds = cur.map((e) => e.id);
      let criticalOpen = 0;
      if (execIds.length) {
        const { data: items } = await supabase
          .from("checklist_execution_items")
          .select("id,is_compliant,checklist_items!inner(is_critical)")
          .in("execution_id", execIds);
        criticalOpen = (items || []).filter(
          (i: any) => i.checklist_items?.is_critical && i.is_compliant === false
        ).length;
      }

      // ---- EVOLUTION ----
      const days = eachDayOfInterval({ start: filters.from, end: filters.to });
      const prevDays =
        filters.compareFrom && filters.compareTo
          ? eachDayOfInterval({ start: filters.compareFrom, end: filters.compareTo })
          : [];
      const dayMap: Record<string, { t: number; c: number }> = {};
      cur.forEach((e) => {
        const k = e.execution_date;
        if (!dayMap[k]) dayMap[k] = { t: 0, c: 0 };
        dayMap[k].t++;
        if (e.status === "concluido") dayMap[k].c++;
      });
      const prevDayMap: Record<string, { t: number; c: number }> = {};
      prev.forEach((e) => {
        const k = e.execution_date;
        if (!prevDayMap[k]) prevDayMap[k] = { t: 0, c: 0 };
        prevDayMap[k].t++;
        if (e.status === "concluido") prevDayMap[k].c++;
      });
      const evolution = days.map((d, i) => {
        const key = fmt(d);
        const dm = dayMap[key];
        const rate = dm && dm.t ? Math.round((dm.c / dm.t) * 100) : null;
        const prevKey = prevDays[i] ? fmt(prevDays[i]) : null;
        const pm = prevKey ? prevDayMap[prevKey] : null;
        const prevRateVal = pm && pm.t ? Math.round((pm.c / pm.t) * 100) : null;
        return { date: key, label: format(d, "dd/MM"), rate, previous: prevRateVal };
      });

      // ---- BY SECTOR ----
      const sectorMap: Record<string, { sector: Sector; total: number; completed: number; overdue: number; critical: number }> = {};
      const sectorExecs: Record<string, string[]> = {};
      cur.forEach((e) => {
        const s = (e.checklists?.sector || "cozinha") as Sector;
        if (!sectorMap[s]) sectorMap[s] = { sector: s, total: 0, completed: 0, overdue: 0, critical: 0 };
        sectorMap[s].total++;
        if (e.status === "concluido") sectorMap[s].completed++;
        if (isLate(e)) sectorMap[s].overdue++;
        if (!sectorExecs[s]) sectorExecs[s] = [];
        sectorExecs[s].push(e.id);
      });
      // critical per sector
      if (execIds.length) {
        const { data: items } = await supabase
          .from("checklist_execution_items")
          .select("execution_id,is_compliant,checklist_items!inner(is_critical)")
          .in("execution_id", execIds);
        const critByExec: Record<string, number> = {};
        (items || []).forEach((i: any) => {
          if (i.checklist_items?.is_critical && i.is_compliant === false) {
            critByExec[i.execution_id] = (critByExec[i.execution_id] || 0) + 1;
          }
        });
        Object.entries(sectorExecs).forEach(([s, ids]) => {
          sectorMap[s].critical = ids.reduce((acc, id) => acc + (critByExec[id] || 0), 0);
        });
      }
      const bySector = Object.values(sectorMap)
        .map((s) => ({ ...s, rate: s.total ? Math.round((s.completed / s.total) * 100) : 0 }))
        .sort((a, b) => a.rate - b.rate);

      // ---- TEAM RANKING ----
      const teamMap: Record<string, { operatorId: string; name: string; sector: Sector | null; avatarColor: string | null; total: number; onTime: number; scoreSum: number; scoreCount: number }> = {};
      cur.forEach((e) => {
        if (!e.operator_id) return;
        if (!teamMap[e.operator_id]) {
          teamMap[e.operator_id] = {
            operatorId: e.operator_id,
            name: e.checklist_operators?.name || "—",
            sector: e.checklist_operators?.sector || null,
            avatarColor: e.checklist_operators?.avatar_color || null,
            total: 0,
            onTime: 0,
            scoreSum: 0,
            scoreCount: 0,
          };
        }
        const r = teamMap[e.operator_id];
        r.total++;
        if (e.status === "concluido" && !isLate(e)) r.onTime++;
        if (e.score != null) {
          r.scoreSum += e.score;
          r.scoreCount++;
        }
      });
      const prevTeamScore: Record<string, number> = {};
      const prevTeamCount: Record<string, number> = {};
      prev.forEach((e) => {
        if (!e.operator_id || e.score == null) return;
        prevTeamScore[e.operator_id] = (prevTeamScore[e.operator_id] || 0) + e.score;
        prevTeamCount[e.operator_id] = (prevTeamCount[e.operator_id] || 0) + 1;
      });
      const teamRanking = Object.values(teamMap)
        .map((r) => {
          const score = r.scoreCount ? Math.round(r.scoreSum / r.scoreCount) : 0;
          const prevAvg = prevTeamCount[r.operatorId]
            ? prevTeamScore[r.operatorId] / prevTeamCount[r.operatorId]
            : null;
          const delta = prevAvg != null ? Math.round(score - prevAvg) : null;
          return { ...r, score, delta };
        })
        .sort((a, b) => b.score - a.score);

      // ---- TOP FAILING CHECKLISTS ----
      const cMap: Record<string, { id: string; name: string; sector: Sector | null; total: number; onTime: number; execIds: string[] }> = {};
      cur.forEach((e) => {
        const id = e.checklist_id;
        if (!cMap[id]) {
          cMap[id] = {
            id,
            name: e.checklists?.name || "—",
            sector: e.checklists?.sector || null,
            total: 0,
            onTime: 0,
            execIds: [],
          };
        }
        cMap[id].total++;
        cMap[id].execIds.push(e.id);
        if (e.status === "concluido" && !isLate(e)) cMap[id].onTime++;
      });
      // most ignored item per checklist
      const itemSkips: Record<string, Record<string, { title: string; count: number }>> = {};
      if (execIds.length) {
        const { data: items } = await supabase
          .from("checklist_execution_items")
          .select("execution_id,item_id,is_compliant,checklist_items!inner(title,checklist_id)")
          .in("execution_id", execIds);
        (items || []).forEach((i: any) => {
          if (i.is_compliant === false) {
            const cid = i.checklist_items?.checklist_id;
            const title = i.checklist_items?.title || "—";
            if (!cid) return;
            if (!itemSkips[cid]) itemSkips[cid] = {};
            if (!itemSkips[cid][i.item_id]) itemSkips[cid][i.item_id] = { title, count: 0 };
            itemSkips[cid][i.item_id].count++;
          }
        });
      }
      const topFailing = Object.values(cMap)
        .map((c) => {
          const onTimeRate = c.total ? Math.round((c.onTime / c.total) * 100) : 0;
          const skips = itemSkips[c.id] ? Object.values(itemSkips[c.id]).sort((a, b) => b.count - a.count) : [];
          return {
            id: c.id,
            name: c.name,
            sector: c.sector,
            total: c.total,
            onTimeRate,
            topSkippedItem: skips[0]?.title || null,
          };
        })
        .sort((a, b) => a.onTimeRate - b.onTimeRate)
        .slice(0, 5);

      // ---- ALERTS ----
      const { data: alertRows } = await supabase
        .from("checklist_alerts")
        .select("id,alert_type,message,is_acknowledged,created_at,execution_id,checklist_executions(checklists(name))")
        .eq("user_id", visibleUserId)
        .gte("created_at", filters.from.toISOString())
        .lte("created_at", new Date(filters.to.getTime() + 86400000 - 1).toISOString())
        .order("created_at", { ascending: false });

      const alertsByType: Record<string, number> = { temperatura_fora: 0, item_critico: 0, prazo_expirado: 0 };
      (alertRows || []).forEach((a: any) => {
        alertsByType[a.alert_type] = (alertsByType[a.alert_type] || 0) + 1;
      });
      const recentAlerts = (alertRows || [])
        .filter((a: any) => !a.is_acknowledged)
        .slice(0, 5)
        .map((a: any) => ({
          id: a.id,
          type: a.alert_type as "temperatura_fora" | "item_critico" | "prazo_expirado",
          message: a.message,
          createdAt: a.created_at,
          checklistName: a.checklist_executions?.checklists?.name || null,
        }));

      return {
        metrics: {
          total,
          totalDelta: pct(total, prevTotal),
          completionRate,
          completionRateDelta: completionRate - prevRate,
          overdue,
          overduePct: total ? Math.round((overdue / total) * 100) : 0,
          overdueDelta: pct(overdue, prevOverdue),
          criticalOpen,
        },
        evolution,
        bySector,
        teamRanking,
        topFailing,
        alerts: { byType: alertsByType, recent: recentAlerts },
        isEmpty: total === 0,
      };
    },
    enabled: !!visibleUserId,
  });

  return {
    data: reportQuery.data,
    isLoading: reportQuery.isLoading,
    refetch: reportQuery.refetch,
  };
}
