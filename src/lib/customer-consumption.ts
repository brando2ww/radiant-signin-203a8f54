import { telefoneSoNumeros } from "@/lib/telefone";

export type CustomerChannel = "pdv" | "delivery";
export interface CustomerConsumption {
  telefone: string;
  canal: CustomerChannel;
  referencia: string;
  numero: string;
  data_consumo: string;
  valor: number;
  status: string;
}
export interface CustomerCredit {
  id: string;
  telefone: string;
  restante: number;
  valor: number;
  vence_em: string;
  criado_em: string;
}
export interface CustomerActivity {
  channels: CustomerChannel[];
  consumptions: CustomerConsumption[];
  cashback_credits: CustomerCredit[];
  salon_spent: number;
  salon_visits: number;
  delivery_spent: number;
  delivery_visits: number;
}

export function brazilDate(value: string | Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}

export function whatsappCustomerUrl(phone: string | null | undefined): string | null {
  const normalized = telefoneSoNumeros(phone);
  return normalized ? `https://wa.me/55${normalized}` : null;
}

export interface CustomerDateFilters {
  source: string;
  consumedFrom: string;
  consumedTo: string;
  expiresFrom: string;
  expiresTo: string;
  cashbackOnly: boolean;
}

/** Cada intervalo precisa corresponder a uma data real, no canal selecionado. */
export function matchesCustomerActivity(
  customer: Pick<CustomerActivity, "channels" | "consumptions" | "cashback_credits"> & { cashback_balance: number },
  filters: CustomerDateFilters,
): boolean {
  if (filters.source !== "all" && !customer.channels.includes(filters.source as CustomerChannel)) return false;
  if (filters.cashbackOnly && !(customer.cashback_balance > 0)) return false;
  if (filters.consumedFrom || filters.consumedTo) {
    if (!customer.consumptions.some((consumption) => {
      if (filters.source !== "all" && consumption.canal !== filters.source) return false;
      const day = brazilDate(consumption.data_consumo);
      return (!filters.consumedFrom || day >= filters.consumedFrom) && (!filters.consumedTo || day <= filters.consumedTo);
    })) return false;
  }
  if (filters.expiresFrom || filters.expiresTo) {
    if (!customer.cashback_credits.some((credit) =>
      (!filters.expiresFrom || credit.vence_em >= filters.expiresFrom) && (!filters.expiresTo || credit.vence_em <= filters.expiresTo))) return false;
  }
  return true;
}

export function customerActivity(
  channels: CustomerChannel[], consumptions: CustomerConsumption[], credits: CustomerCredit[],
): CustomerActivity {
  const sum = (channel: CustomerChannel) => Math.round(consumptions.filter((row) => row.canal === channel).reduce((total, row) => total + Number(row.valor), 0) * 100) / 100;
  return {
    channels: Array.from(new Set([...channels, ...consumptions.map((row) => row.canal)])),
    consumptions: [...consumptions].sort((a, b) => b.data_consumo.localeCompare(a.data_consumo)),
    cashback_credits: credits,
    salon_spent: sum("pdv"),
    salon_visits: consumptions.filter((row) => row.canal === "pdv").length,
    delivery_spent: sum("delivery"),
    delivery_visits: consumptions.filter((row) => row.canal === "delivery").length,
  };
}
