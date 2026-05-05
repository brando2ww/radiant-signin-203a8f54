import type { DeliverySettings, DeliveryZone, ExcludedCEP, CepRange } from "@/hooks/use-delivery-settings";

export type CoverageReason = "excluded" | "range" | "zone" | "city" | "none";

export interface CoverageResult {
  covered: boolean;
  fee: number | null;
  reason: CoverageReason;
  matched?: { range?: CepRange; zone?: DeliveryZone };
}

const onlyDigits = (v?: string | null) => (v || "").replace(/\D/g, "");

/** Normaliza para 8 dígitos (zero à esquerda); retorna '' se inválido. */
export const normalizeCEP = (v?: string | null): string => {
  const d = onlyDigits(v);
  if (d.length === 0) return "";
  return d.padStart(8, "0").slice(0, 8);
};

const normalizeName = (v?: string | null) =>
  (v || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

export interface ResolveInput {
  cep?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  uf?: string | null;
  settings: Pick<
    DeliverySettings,
    "default_delivery_fee" | "delivery_zones" | "covered_city" | "excluded_ceps" | "cep_ranges"
  > | null | undefined;
}

export const resolveDeliveryCoverage = ({
  cep,
  neighborhood,
  city,
  uf,
  settings,
}: ResolveInput): CoverageResult => {
  if (!settings) return { covered: false, fee: null, reason: "none" };

  const cepN = normalizeCEP(cep);

  // 1) Excluído explicitamente
  if (cepN && (settings.excluded_ceps || []).some((e: ExcludedCEP) => normalizeCEP(e.cep) === cepN)) {
    return { covered: false, fee: null, reason: "excluded" };
  }

  // 2) Faixa de CEP
  if (cepN) {
    const ranges = settings.cep_ranges || [];
    const match = ranges.find((r) => {
      const a = normalizeCEP(r.cep_start);
      const b = normalizeCEP(r.cep_end);
      if (!a || !b) return false;
      return cepN >= a && cepN <= b;
    });
    if (match) return { covered: true, fee: Number(match.fee) || 0, reason: "range", matched: { range: match } };
  }

  // 3) Bairro listado
  if (neighborhood) {
    const nb = normalizeName(neighborhood);
    const zone = (settings.delivery_zones || []).find((z) => normalizeName(z.neighborhood) === nb);
    if (zone) return { covered: true, fee: Number(zone.fee) || 0, reason: "zone", matched: { zone } };
  }

  // 4) Cidade coberta — taxa padrão
  const cc = settings.covered_city;
  if (cc && city && uf) {
    if (normalizeName(cc.city) === normalizeName(city) && cc.uf?.toUpperCase() === uf.toUpperCase()) {
      return { covered: true, fee: Number(settings.default_delivery_fee) || 0, reason: "city" };
    }
  }

  return { covered: false, fee: null, reason: "none" };
};
