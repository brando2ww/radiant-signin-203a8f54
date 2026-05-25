export type ShiftKey = "manha" | "tarde" | "noite";

export interface ShiftInfo {
  key: ShiftKey;
  label: string;
  range: string;
  order: number;
}

export const SHIFTS: Record<ShiftKey, ShiftInfo> = {
  manha: { key: "manha", label: "Manhã", range: "05:00 – 11:59", order: 0 },
  tarde: { key: "tarde", label: "Tarde", range: "12:00 – 17:59", order: 1 },
  noite: { key: "noite", label: "Noite", range: "18:00 – 04:59", order: 2 },
};

export function getShift(completedAt: string | null): ShiftKey {
  let hour = 12;
  if (completedAt) {
    const d = new Date(completedAt);
    if (!isNaN(d.getTime())) hour = d.getHours();
  }
  if (hour >= 5 && hour < 12) return "manha";
  if (hour >= 12 && hour < 18) return "tarde";
  return "noite";
}

export function statusRank(status: string | null): number {
  if (!status || status === "pendente") return 0;
  if (status === "aprovado") return 1;
  if (status === "reprovado") return 2;
  return 3;
}
