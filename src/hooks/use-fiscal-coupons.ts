import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishmentId } from "@/hooks/use-establishment-id";
import { notasFiscais } from "@/lib/fiscal-db";

// Fonte dos cupons: `notas_fiscais`, que é onde TODAS as edge functions da
// FocusNFE gravam (emitir / consultar / cancelar / webhook).
//
// Esta tela lia `pdv_nfce_emissions`, herdada da integração antiga com a Nuvem
// Fiscal — uma tabela em que nenhum código escreve. Por isso a tela ficava
// sempre vazia, mesmo com nota autorizada. A interface `FiscalCoupon` foi
// mantida e os campos são mapeados aqui, para não reescrever os componentes.

export type FiscalCouponStatus = "autorizada" | "pendente" | "rejeitada" | "cancelada";

export interface FiscalCouponItem {
  product_id?: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  ncm?: string | null;
  cfop?: string | null;
  cest?: string | null;
  ean?: string | null;
  unidade?: string | null;
  origem?: number | null;
}

export interface FiscalCoupon {
  id: string;
  user_id: string;
  /** Referência usada pela FocusNFE — é ela que as edges de cancelar/consultar esperam. */
  referencia_focusnfe: string;
  status: FiscalCouponStatus | string;
  ambiente: string;
  serie: string | null;
  numero: number | null;
  chave_acesso: string | null;
  protocolo_autorizacao: string | null;
  data_emissao: string;
  data_autorizacao: string | null;
  valor_total: number;
  valor_desconto: number;
  valor_servico: number;
  forma_pagamento: string | null;
  parcelas: number | null;
  customer_cpf: string | null;
  customer_email: string | null;
  customer_name: string | null;
  comanda_id: string | null;
  table_id: string | null;
  order_id: string | null;
  cashier_session_id: string | null;
  rejection_reason: string | null;
  cancellation_reason: string | null;
  cancellation_protocol: string | null;
  cancelled_at: string | null;
  last_status_check_at: string | null;
  parent_emission_id: string | null;

  qrcode: string | null;
  url_consulta: string | null;
  danfe_pdf_url: string | null;
  danfe_html_url: string | null;
  xml_url: string | null;
  items_snapshot: FiscalCouponItem[] | null;
  created_at: string;
  updated_at: string;
}

export interface FiscalCouponsFilter {
  startDate?: Date;
  endDate?: Date;
  status?: string;
  ambiente?: string;
  paymentMethod?: string;
  search?: string;
}

/** Códigos da tabela do SEFAZ de volta para rótulos que o operador reconhece. */
const FORMA_PAGAMENTO_LABEL: Record<string, string> = {
  "01": "dinheiro",
  "02": "cheque",
  "03": "cartao_credito",
  "04": "cartao_debito",
  "10": "vale_refeicao",
  "11": "vale_alimentacao",
  "15": "boleto",
  "17": "pix",
  "99": "outros",
};

/** `processando` é o estado inicial da Focus; para o operador é "pendente". */
function mapStatus(status: string): string {
  return status === "processando" || status === "erro" ? "pendente" : status;
}

function toNumber(v: unknown): number {
  const n = Number(v);
  return isFinite(n) ? n : 0;
}

function mapNota(row: any): FiscalCoupon {
  const payload = row.payload_enviado ?? {};
  const formas: any[] = Array.isArray(payload.formas_pagamento) ? payload.formas_pagamento : [];
  const primeiraForma = formas[0]?.forma_pagamento ?? null;

  // O vínculo com a venda fica em origem_tipo/origem_id; a interface antiga
  // expunha três colunas separadas.
  const origemId = row.origem_id ?? null;
  const origemTipo = row.origem_tipo ?? null;

  const items: FiscalCouponItem[] = Array.isArray(payload.items)
    ? payload.items.map((i: any) => ({
      product_id: i.codigo_produto ?? null,
      product_name: i.descricao ?? "",
      quantity: toNumber(i.quantidade_comercial),
      unit_price: toNumber(i.valor_unitario_comercial),
      subtotal: toNumber(i.valor_bruto) - toNumber(i.valor_desconto),
      ncm: i.codigo_ncm ?? null,
      cfop: i.cfop ?? null,
      cest: i.cest ?? null,
      ean: i.codigo_ean ?? null,
      unidade: i.unidade_comercial ?? null,
      origem: i.origem ?? null,
    }))
    : [];

  const status = mapStatus(row.status);

  return {
    id: row.id,
    user_id: row.user_id,
    referencia_focusnfe: row.referencia_focusnfe,
    status,
    ambiente: row.ambiente,
    serie: row.serie ?? null,
    numero: row.numero ? Number(row.numero) : null,
    chave_acesso: row.chave_acesso ?? null,
    protocolo_autorizacao: row.protocolo ?? null,
    data_emissao: row.emitida_em ?? row.created_at,
    // A janela de cancelamento (30 min) conta a partir da autorização.
    data_autorizacao: row.status === "autorizada" ? (row.emitida_em ?? row.created_at) : null,
    valor_total: toNumber(row.valor_total),
    valor_desconto: toNumber(payload.valor_desconto),
    valor_servico: toNumber(payload.valor_outras_despesas),
    forma_pagamento: primeiraForma
      ? (FORMA_PAGAMENTO_LABEL[primeiraForma] ?? primeiraForma)
      : null,
    parcelas: formas[0]?.numero_parcelas ?? null,
    customer_cpf: row.destinatario_documento ?? null,
    customer_email: row.destinatario_email ?? null,
    customer_name: row.destinatario_nome ?? null,
    comanda_id: origemTipo === "comanda" ? origemId : null,
    table_id: origemTipo === "table" ? origemId : null,
    order_id: origemTipo === "delivery_order" || origemTipo === "order" ? origemId : null,
    cashier_session_id: null,
    rejection_reason: row.status === "rejeitada" || row.status === "denegada"
      ? (row.mensagem_sefaz ?? null)
      : null,
    cancellation_reason: row.cancelamento_justificativa ?? null,
    cancellation_protocol: row.resposta_api?.protocolo ?? null,
    cancelled_at: row.cancelada_em ?? null,
    last_status_check_at: row.updated_at ?? null,
    parent_emission_id: null,
    qrcode: row.qrcode ?? null,
    url_consulta: row.url_consulta ?? null,
    danfe_pdf_url: row.caminho_danfe ?? null,
    danfe_html_url: null,
    xml_url: row.caminho_xml ?? null,
    items_snapshot: items.length ? items : null,
    created_at: row.created_at,
    updated_at: row.updated_at ?? row.created_at,
  };
}

export function useFiscalCoupons(filter: FiscalCouponsFilter = {}) {
  const { visibleUserId } = useEstablishmentId();

  return useQuery({
    queryKey: ["fiscal-coupons", visibleUserId, filter],
    enabled: !!visibleUserId,
    queryFn: async (): Promise<FiscalCoupon[]> => {
      let q = notasFiscais()
        .select("*")
        .eq("user_id", visibleUserId!)
        .eq("tipo", "nfce")
        .order("created_at", { ascending: false })
        .limit(500);

      if (filter.startDate) q = q.gte("created_at", filter.startDate.toISOString());
      if (filter.endDate) q = q.lte("created_at", filter.endDate.toISOString());
      if (filter.ambiente && filter.ambiente !== "all") q = q.eq("ambiente", filter.ambiente);

      const { data, error } = await q;
      if (error) throw error;

      let rows = (data ?? []).map(mapNota);

      // Status e forma de pagamento são derivados no mapeamento (o primeiro
      // agrupa `processando`/`erro` em "pendente", o segundo mora dentro do
      // payload), então os dois filtram aqui e não na query.
      if (filter.status && filter.status !== "all") {
        rows = rows.filter((r) => r.status === filter.status);
      }
      if (filter.paymentMethod && filter.paymentMethod !== "all") {
        rows = rows.filter((r) => r.forma_pagamento === filter.paymentMethod);
      }

      const term = filter.search?.trim().toLowerCase();
      if (!term) return rows;
      return rows.filter((r) =>
        [
          String(r.numero ?? ""),
          r.chave_acesso ?? "",
          r.customer_cpf ?? "",
          r.customer_name ?? "",
        ].some((v) => v.toLowerCase().includes(term))
      );
    },
  });
}
