// Roteamento de ações de pedido para a plataforma de origem.
//
// Existe porque a tela de delivery é agnóstica de origem: OrderCard,
// OrderDetailDialog e SalonQueuePanel chamam o mesmo `useUpdateOrderStatus`
// para qualquer pedido. Escrever o status direto no banco funciona para
// pedido próprio e é errado para pedido de marketplace: o PDV passaria a
// mostrar "em preparo" enquanto a plataforma segue esperando a confirmação, e
// em poucos minutos o pedido é cancelado e a loja é penalizada.
//
// Cada plataforma tem seu vocabulário de ação, então a tradução mora aqui e
// não espalhada pelos componentes.

export type OrderSource = "own" | "ifood" | "deliverymuch";

/** Rótulo para mensagens de erro e para o selo de origem na tela. */
export const SOURCE_LABEL: Record<OrderSource, string> = {
  own: "Próprio",
  ifood: "iFood",
  deliverymuch: "DeliveryMuch",
};

/** Edge function que fala com cada plataforma. */
export const SOURCE_FUNCTION: Record<Exclude<OrderSource, "own">, string> = {
  ifood: "ifood-orders",
  deliverymuch: "deliverymuch-orders",
};

export function isMarketplace(source: string | null | undefined): boolean {
  return (source ?? "own") !== "own";
}

/**
 * Traduz o avanço de status da tela na ação que a plataforma entende.
 * `null` significa que aquela transição não é empurrada para a plataforma.
 *
 * Notas por plataforma:
 * - iFood: "pronto" só existe como ação para pedido de RETIRADA
 *   (`readyToPickup`). Para entrega, o que a plataforma espera é o despacho.
 * - `completed` nunca é ação local em pedido externo: a conclusão chega pelo
 *   evento da plataforma. Marcar concluído por conta própria cria divergência.
 * - `cancelled` não passa por aqui: cancelamento exige motivo e tem fluxo
 *   próprio em `useCancelOrder`.
 */
export function marketplaceAction(
  source: string,
  status: string,
  orderType: string | null | undefined,
): string | null {
  const isPickup = orderType === "pickup";

  if (source === "ifood") {
    switch (status) {
      case "confirmed":
      case "preparing":
        return "confirm";
      case "ready":
        return isPickup ? "ready_to_pickup" : null;
      case "delivering":
        return "dispatch";
      default:
        return null;
    }
  }

  if (source === "deliverymuch") {
    switch (status) {
      case "confirmed":
      case "preparing":
        return "accept";
      case "ready":
        return "ready";
      default:
        return null;
    }
  }

  return null;
}

/** Mensagem honesta quando a transição não existe do lado da plataforma. */
export function unsupportedTransitionMessage(source: string, status: string): string {
  const label = SOURCE_LABEL[source as OrderSource] ?? source;
  if (status === "completed") {
    return `Pedido do ${label} é concluído pela própria plataforma, não pelo PDV.`;
  }
  if (status === "ready") {
    return `No ${label}, pedido de entrega vai direto para o despacho — "pronto" só se aplica a retirada.`;
  }
  return `Esta mudança de status não se aplica a pedido do ${label}.`;
}

/**
 * Próximo passo que a TELA deve oferecer, já respeitando o vocabulário da
 * plataforma de origem.
 *
 * Existe porque o fluxo do PDV (preparo → pronto → saiu para entrega) não é o
 * do iFood: lá, pedido de ENTREGA vai de preparo direto para o despacho, e
 * "pronto" só existe para retirada. Oferecer o botão errado e explicar o erro
 * depois é o pior dos dois mundos — o operador clica, toma um aviso vermelho e
 * fica sem saber o que fazer.
 *
 * Também não se oferece "concluir" em pedido de marketplace: quem conclui é a
 * plataforma, e o estado chega pelo evento.
 */
export function nextOrderStep(
  source: string | null | undefined,
  status: string,
  orderType: string | null | undefined,
): { status: string; label: string } | null {
  const src = source ?? "own";

  if (src === "ifood") {
    const isPickup = orderType === "pickup";
    switch (status) {
      case "pending":
        return { status: "preparing", label: "Confirmar pedido" };
      case "confirmed":
        return { status: "preparing", label: "Iniciar preparo" };
      case "preparing":
        return isPickup
          ? { status: "ready", label: "Pronto para retirada" }
          : { status: "delivering", label: "Despachar" };
      default:
        // ready (retirada), delivering e completed são concluídos pelo iFood
        return null;
    }
  }

  if (src === "deliverymuch") {
    switch (status) {
      case "pending":
        return { status: "preparing", label: "Aceitar pedido" };
      case "confirmed":
        return { status: "preparing", label: "Iniciar preparo" };
      case "preparing":
        return { status: "ready", label: "Marcar como pronto" };
      default:
        return null;
    }
  }

  const own: Record<string, { status: string; label: string }> = {
    pending: { status: "preparing", label: "Confirmar" },
    confirmed: { status: "preparing", label: "Iniciar Preparo" },
    preparing: { status: "ready", label: "Marcar como Pronto" },
    ready: { status: "delivering", label: "Saiu para Entrega" },
    delivering: { status: "completed", label: "Concluir Entrega" },
  };
  return own[status] ?? null;
}
