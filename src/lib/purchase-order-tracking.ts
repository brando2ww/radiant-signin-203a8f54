/**
 * Rastro do link do pedido enviado ao fornecedor.
 *
 * O link registra quando o fornecedor abre (supplier_viewed_at) e confirma
 * (supplier_confirmed_at). O que faltava era o contrário: mostrar que ele
 * AINDA NÃO abriu. Sem isso o silêncio passava por normal e o pedido ficava
 * esquecido até faltar mercadoria.
 */
export interface PedidoRastreavel {
  status: string;
  quotation_request_id?: string | null;
  whatsapp_sent_at?: string | null;
  supplier_viewed_at?: string | null;
  supplier_confirmed_at?: string | null;
}

/**
 * Primeiro envio com o link do pedido (08/09/2026, 15h). Antes disso a
 * mensagem não tinha link e "não abriu" seria sempre falso alarme.
 */
const RASTREIO_DESDE = Date.parse("2026-09-08T18:00:00Z");

/** Até quando o silêncio ainda dá tempo de cobrar o fornecedor. */
const DIAS_PARA_COBRAR = 7;

/**
 * Enviado pelo WhatsApp com o link e ainda não aberto.
 *
 * Só vale para pedido nascido de cotação: é o envio que leva o link. O pedido
 * avulso sai em texto, sem link, e nunca teria como marcar "abriu".
 */
export function fornecedorNaoAbriu(po: PedidoRastreavel): boolean {
  return (
    po.status === "sent" &&
    !!po.quotation_request_id &&
    !!po.whatsapp_sent_at &&
    Date.parse(po.whatsapp_sent_at) >= RASTREIO_DESDE &&
    !po.supplier_viewed_at &&
    !po.supplier_confirmed_at
  );
}

/**
 * Não abriu e foi enviado há pouco: é o que merece o alerta da página.
 * Pedido parado há semanas quase sempre já foi resolvido por fora e só
 * esqueceram de dar baixa · alertar sobre ele vira ruído.
 */
export function pedidoParaCobrar(po: PedidoRastreavel): boolean {
  return (
    fornecedorNaoAbriu(po) &&
    Date.now() - Date.parse(po.whatsapp_sent_at!) <= DIAS_PARA_COBRAR * 86400e3
  );
}
