import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEstablishmentId } from "@/hooks/use-establishment-id";
import { buildPaymentSnapshot } from "@/lib/financial/build-payment-snapshot";
import { toast } from "sonner";

export type PaymentMethod =
  | "dinheiro"
  | "credito"
  | "debito"
  | "pix"
  | "vale_refeicao"
  // Retrocompat: aceito como entrada e mapeado para "credito".
  | "cartao";

interface RegisterPaymentParams {
  comandaId: string;
  orderId?: string | null;
  amount: number;
  paymentMethod: PaymentMethod;
  cashReceived?: number;
  changeAmount?: number;
  installments?: number;
  notes?: string;
  discountAmount?: number;
  discountReason?: string;
  discountAuthorizedBy?: string;
}

export interface PartialPaymentItem {
  itemId: string;
  quantityPaid: number;
  unitPrice: number;
}

interface RegisterPartialPaymentParams {
  comandaId: string;
  orderId?: string | null;
  amount: number;
  paymentMethod: PaymentMethod;
  cashReceived?: number;
  changeAmount?: number;
  installments?: number;
  discountAmount?: number;
  discountReason?: string;
  discountAuthorizedBy?: string;
  partialItems: PartialPaymentItem[];
  chargingSessionId: string;
}

/**
 * Normaliza "cartao" (legado) para "credito" e devolve o método final
 * usado tanto na coluna `payment_method` do movimento quanto na
 * atualização dos totais da sessão.
 */
function normalizeMethod(m: PaymentMethod): Exclude<PaymentMethod, "cartao"> {
  return m === "cartao" ? "credito" : m;
}

// Totais da sessão são recomputados via RPC `pdv_recompute_session_totals`
// a partir de pdv_cashier_movements (fonte única de verdade — sem race condition).

export function usePDVPayments() {
  const { user } = useAuth();
  const { visibleUserId } = useEstablishmentId();
  const queryClient = useQueryClient();

  // Register payment and close comanda
  const registerPayment = useMutation({
    mutationFn: async ({
      comandaId,
      orderId,
      amount,
      paymentMethod,
      cashReceived,
      changeAmount,
      installments,
      discountAmount,
      discountReason,
      discountAuthorizedBy,
    }: RegisterPaymentParams) => {
      if (!user?.id) throw new Error("Usuário não autenticado");
      const method = normalizeMethod(paymentMethod);

      // 1. Close the comanda (only if still open OR awaiting payment from waiter)
      const { data: updatedComandas, error: comandaError } = await supabase
        .from("pdv_comandas")
        .update({
          status: "fechada",
          updated_at: new Date().toISOString(),
        })
        .eq("id", comandaId)
        .in("status", ["aberta", "aguardando_pagamento", "em_cobranca"])
        .select();

      if (comandaError) throw comandaError;
      if (!updatedComandas || updatedComandas.length === 0) {
        throw new Error("Comanda já finalizada");
      }

      // If table comanda, free the table when this was the last open one
      if (orderId) {
        const { count } = await supabase
          .from("pdv_comandas")
          .select("*", { count: "exact", head: true })
          .eq("order_id", orderId)
          .in("status", ["aberta", "aguardando_pagamento", "em_cobranca"]);

        if ((count ?? 0) === 0) {
          await supabase
            .from("pdv_orders")
            .update({ status: "fechada", updated_at: new Date().toISOString() })
            .eq("id", orderId);

          await supabase
            .from("pdv_tables")
            .update({
              status: "livre",
              current_order_id: null,
              updated_at: new Date().toISOString(),
            })
            .eq("current_order_id", orderId);
        }
      }

      // 2. If there's an order_id, insert payment record (com snapshot da taxa)
      const ownerForFees = visibleUserId || user.id;
      if (orderId) {
        const { columns: feeColumns } = await buildPaymentSnapshot(
          ownerForFees,
          method,
          amount,
        );
        const { error: paymentError } = await supabase
          .from("pdv_payments")
          .insert({
            order_id: orderId,
            payment_method: method,
            amount,
            cash_received: cashReceived || null,
            change_amount: changeAmount || null,
            installments: installments || 1,
            ...feeColumns,
          });

        if (paymentError) {
          console.error("Payment insert error:", paymentError);
          // Don't throw - comanda was already closed
        }
      }

      // 3. Register sale in cashier (if cashier is open)
      const ownerId = visibleUserId || user.id;
      const { data: activeSession } = await supabase
        .from("pdv_cashier_sessions")
        .select("*")
        .eq("user_id", ownerId)
        .is("closed_at", null)
        .maybeSingle();

      if (activeSession) {
        const movementData: any = {
          cashier_session_id: activeSession.id,
          type: "venda",
          amount,
          payment_method: method,
          description: `Comanda #${comandaId.slice(0, 8)}`,
        };

        if (discountReason) movementData.discount_reason = discountReason;
        if (discountAuthorizedBy) movementData.discount_authorized_by = discountAuthorizedBy;

        await supabase.from("pdv_cashier_movements").insert(movementData);

        await supabase.rpc("pdv_recompute_session_totals", { p_session_id: activeSession.id });

        if (orderId && discountAmount && discountAmount > 0) {
          await supabase
            .from("pdv_orders")
            .update({ discount: discountAmount, cashier_session_id: activeSession.id })
            .eq("id", orderId);
        }
      }

      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pdv-comandas"] });
      queryClient.invalidateQueries({ queryKey: ["pdv-comanda-items"] });
      queryClient.invalidateQueries({ queryKey: ["pdv-cashier-active"] });
      queryClient.invalidateQueries({ queryKey: ["pdv-cashier-movements"] });
      queryClient.invalidateQueries({ queryKey: ["pdv-tables"] });
      toast.success("Pagamento registrado com sucesso!");
    },
    onError: (error) => {
      console.error("Erro ao registrar pagamento:", error);
      toast.error("Erro ao registrar pagamento");
    },
  });

  // Pagar TODAS as comandas de uma mesa de uma só vez (mesmo método)
  const registerTablePayment = useMutation({
    mutationFn: async ({
      tableId,
      comandaIds,
      amount,
      paymentMethod,
      cashReceived,
      changeAmount,
      installments,
      discountReason,
      discountAuthorizedBy,
    }: {
      tableId: string;
      comandaIds: string[];
      amount: number;
      paymentMethod: PaymentMethod;
      cashReceived?: number;
      changeAmount?: number;
      installments?: number;
      discountAmount?: number;
      discountReason?: string;
      discountAuthorizedBy?: string;
    }) => {
      if (!user?.id) throw new Error("Usuário não autenticado");
      const method = normalizeMethod(paymentMethod);

      // 1. Close all comandas
      const { data: updatedComandas, error: comandaError } = await supabase
        .from("pdv_comandas")
        .update({ status: "fechada", updated_at: new Date().toISOString() })
        .in("id", comandaIds)
        .in("status", ["aberta", "aguardando_pagamento", "em_cobranca"])
        .select();

      if (comandaError) throw comandaError;
      if (!updatedComandas || updatedComandas.length === 0) {
        throw new Error("Comandas já finalizadas");
      }

      // 2. Free the table and close the order
      const { error: tableError } = await supabase
        .from("pdv_tables")
        .update({
          status: "livre",
          current_order_id: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", tableId);

      if (tableError) throw tableError;

      const orderIds = Array.from(
        new Set(updatedComandas.map((c: any) => c.order_id).filter(Boolean)),
      ) as string[];
      if (orderIds.length > 0) {
        await supabase
          .from("pdv_orders")
          .update({ status: "fechada", updated_at: new Date().toISOString() })
          .in("id", orderIds);
      }

      // 3. Register sale in cashier
      const ownerId = visibleUserId || user.id;
      const { data: activeSession } = await supabase
        .from("pdv_cashier_sessions")
        .select("*")
        .eq("user_id", ownerId)
        .is("closed_at", null)
        .maybeSingle();

      if (activeSession) {
        const movementData: any = {
          cashier_session_id: activeSession.id,
          type: "venda",
          amount,
          payment_method: method,
          description: `Mesa #${tableId.slice(0, 8)}`,
        };

        if (discountReason) movementData.discount_reason = discountReason;
        if (discountAuthorizedBy) movementData.discount_authorized_by = discountAuthorizedBy;

        await supabase.from("pdv_cashier_movements").insert(movementData);

        await supabase.rpc("pdv_recompute_session_totals", { p_session_id: activeSession.id });
      }

      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pdv-comandas"] });
      queryClient.invalidateQueries({ queryKey: ["pdv-comanda-items"] });
      queryClient.invalidateQueries({ queryKey: ["pdv-cashier-active"] });
      queryClient.invalidateQueries({ queryKey: ["pdv-cashier-movements"] });
      queryClient.invalidateQueries({ queryKey: ["pdv-tables"] });
      toast.success("Pagamento da mesa registrado!");
    },
    onError: (error) => {
      console.error("Erro ao registrar pagamento:", error);
      toast.error("Erro ao registrar pagamento");
    },
  });

  // Register PARTIAL payment: pay only selected items, keep comanda open if any pending remain
  const registerPartialPayment = useMutation({
    mutationFn: async ({
      comandaId,
      orderId,
      amount,
      paymentMethod,
      cashReceived,
      changeAmount,
      installments,
      discountReason,
      discountAuthorizedBy,
      partialItems,
      chargingSessionId,
    }: RegisterPartialPaymentParams) => {
      if (!user?.id) throw new Error("Usuário não autenticado");
      const method = normalizeMethod(paymentMethod);

      // 1. Buscar quantidades pagas atuais (para incremento atômico no client)
      const itemIds = partialItems.map((p) => p.itemId);
      const { data: currentItems, error: itemsErr } = await supabase
        .from("pdv_comanda_items")
        .select("id, quantity, paid_quantity")
        .in("id", itemIds);
      if (itemsErr) throw itemsErr;

      // 2. Atualizar paid_quantity de cada item e coletar os que ficaram 100% pagos
      const fullyPaidItemIds: string[] = [];
      for (const p of partialItems) {
        const cur = (currentItems || []).find((i: any) => i.id === p.itemId);
        if (!cur) continue;
        const newPaid = Math.min(
          Number(cur.quantity) || 0,
          (Number(cur.paid_quantity) || 0) + p.quantityPaid,
        );
        await supabase
          .from("pdv_comanda_items")
          .update({
            paid_quantity: newPaid,
            charging_session_id: null,
          })
          .eq("id", p.itemId);

        if (newPaid >= (Number(cur.quantity) || 0)) {
          fullyPaidItemIds.push(p.itemId);
        }
      }

      // 2.1 Baixa automática de estoque para itens 100% pagos (idempotente no servidor)
      if (fullyPaidItemIds.length > 0) {
        const { error: consumeErr } = await supabase.rpc(
          "consume_ingredients_for_comanda_items",
          { p_item_ids: fullyPaidItemIds },
        );
        if (consumeErr) {
          console.error("Erro ao baixar estoque:", consumeErr);
        }
      }

      // 3. Inserir registro em pdv_payments (se houver order_id) — com snapshot da taxa
      if (orderId) {
        const { columns: feeColumns } = await buildPaymentSnapshot(
          visibleUserId || user.id,
          method,
          amount,
        );
        await supabase.from("pdv_payments").insert({
          order_id: orderId,
          payment_method: method,
          amount,
          cash_received: cashReceived || null,
          change_amount: changeAmount || null,
          installments: installments || 1,
          ...feeColumns,
        });
      }

      // 4. Liberar locks remanescentes desta sessão de cobrança
      await supabase
        .from("pdv_comanda_items")
        .update({ charging_session_id: null })
        .eq("comanda_id", comandaId)
        .eq("charging_session_id", chargingSessionId);

      // 5. Há itens pendentes ainda?
      const { data: remainingItems } = await supabase
        .from("pdv_comanda_items")
        .select("id, quantity, paid_quantity")
        .eq("comanda_id", comandaId);

      const stillPending = (remainingItems || []).some(
        (r: any) => (r.quantity - (r.paid_quantity || 0)) > 0,
      );

      if (!stillPending) {
        await supabase
          .from("pdv_comandas")
          .update({ status: "fechada", updated_at: new Date().toISOString() })
          .eq("id", comandaId)
          .in("status", ["aberta", "aguardando_pagamento", "em_cobranca"]);

        if (orderId) {
          const { count } = await supabase
            .from("pdv_comandas")
            .select("*", { count: "exact", head: true })
            .eq("order_id", orderId)
            .in("status", ["aberta", "aguardando_pagamento", "em_cobranca"]);

          if ((count ?? 0) === 0) {
            await supabase
              .from("pdv_orders")
              .update({ status: "fechada", updated_at: new Date().toISOString() })
              .eq("id", orderId);

            await supabase
              .from("pdv_tables")
              .update({
                status: "livre",
                current_order_id: null,
                updated_at: new Date().toISOString(),
              })
              .eq("current_order_id", orderId);
          }
        }
      } else {
        await supabase
          .from("pdv_comandas")
          .update({ status: "aguardando_pagamento", updated_at: new Date().toISOString() })
          .eq("id", comandaId)
          .eq("status", "em_cobranca");
      }

      // 6. Movimento de caixa
      const ownerId = visibleUserId || user.id;
      const { data: activeSession } = await supabase
        .from("pdv_cashier_sessions")
        .select("*")
        .eq("user_id", ownerId)
        .is("closed_at", null)
        .maybeSingle();

      if (activeSession) {
        const movementData: any = {
          cashier_session_id: activeSession.id,
          type: "venda",
          amount,
          payment_method: method,
          description: `Comanda #${comandaId.slice(0, 8)} — pagamento parcial`,
        };
        if (discountReason) movementData.discount_reason = discountReason;
        if (discountAuthorizedBy) movementData.discount_authorized_by = discountAuthorizedBy;
        await supabase.from("pdv_cashier_movements").insert(movementData);

        await supabase.rpc("pdv_recompute_session_totals", { p_session_id: activeSession.id });
      }

      return { success: true, fullyPaid: !stillPending };
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["pdv-comandas"] });
      queryClient.invalidateQueries({ queryKey: ["pdv-comanda-items"] });
      queryClient.invalidateQueries({ queryKey: ["pdv-cashier-active"] });
      queryClient.invalidateQueries({ queryKey: ["pdv-cashier-movements"] });
      queryClient.invalidateQueries({ queryKey: ["pdv-tables"] });
      toast.success(res.fullyPaid ? "Comanda paga e fechada!" : "Pagamento parcial registrado");
    },
    onError: (error: any) => {
      console.error("Erro pagamento parcial:", error);
      toast.error(error?.message || "Erro ao registrar pagamento parcial");
    },
  });

  // Registra apenas uma linha extra de pagamento (split-forms): grava em
  // pdv_payments + movimento de caixa + atualiza totais da sessão.
  // NÃO mexe em comandas/order/mesa (já fechados pela 1ª chamada).
  const registerExtraPaymentLine = useMutation({
    mutationFn: async ({
      orderId,
      comandaId,
      amount,
      paymentMethod,
      cashReceived,
      changeAmount,
      installments,
    }: {
      orderId?: string | null;
      comandaId?: string | null;
      amount: number;
      paymentMethod: PaymentMethod;
      cashReceived?: number;
      changeAmount?: number;
      installments?: number;
    }) => {
      if (!user?.id) throw new Error("Usuário não autenticado");
      const method = normalizeMethod(paymentMethod);
      const ownerId = visibleUserId || user.id;

      if (orderId) {
        const { columns: feeColumns } = await buildPaymentSnapshot(ownerId, method, amount);
        await supabase.from("pdv_payments").insert({
          order_id: orderId,
          payment_method: method,
          amount,
          cash_received: cashReceived || null,
          change_amount: changeAmount || null,
          installments: installments || 1,
          ...feeColumns,
        });
      }

      const { data: activeSession } = await supabase
        .from("pdv_cashier_sessions")
        .select("*")
        .eq("user_id", ownerId)
        .is("closed_at", null)
        .maybeSingle();

      if (activeSession) {
        await supabase.from("pdv_cashier_movements").insert({
          cashier_session_id: activeSession.id,
          type: "venda",
          amount,
          payment_method: method,
          description: comandaId ? `Comanda #${comandaId.slice(0, 8)}` : "Pagamento adicional",
        });
        await supabase.rpc("pdv_recompute_session_totals", { p_session_id: activeSession.id });
      }
      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pdv-cashier-active"] });
      queryClient.invalidateQueries({ queryKey: ["pdv-cashier-movements"] });
    },
    onError: (error) => {
      console.error("Erro ao registrar linha extra de pagamento:", error);
      toast.error("Erro ao registrar forma de pagamento adicional");
    },
  });

  return {
    registerPayment: registerPayment.mutateAsync,
    isRegisteringPayment: registerPayment.isPending,
    registerTablePayment: registerTablePayment.mutateAsync,
    isRegisteringTablePayment: registerTablePayment.isPending,
    registerPartialPayment: registerPartialPayment.mutateAsync,
    isRegisteringPartialPayment: registerPartialPayment.isPending,
    registerExtraPaymentLine: registerExtraPaymentLine.mutateAsync,
    isRegisteringExtraPaymentLine: registerExtraPaymentLine.isPending,
  };
}
