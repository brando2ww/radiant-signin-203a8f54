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
    !po.supplier_viewed_at &&
    !po.supplier_confirmed_at
  );
}
