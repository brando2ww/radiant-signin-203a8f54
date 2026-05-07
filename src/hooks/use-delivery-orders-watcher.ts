import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { dispatchDeliveryPrintJobs } from "@/lib/delivery-print";

/**
 * Watcher global de novos pedidos de delivery.
 *
 * Deve ser montado uma única vez em nível de layout (PDV) para que a
 * notificação sonora, a impressão na cozinha e o auto-aceite (quando a
 * configuração `auto_accept_orders` estiver ativa e houver caixa aberto)
 * funcionem em qualquer rota — não apenas na tela de pedidos.
 */
export const useDeliveryOrdersWatcher = () => {
  const queryClient = useQueryClient();
  const processedIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    let userId: string | null = null;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    const setup = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      userId = user.id;

      channel = supabase
        .channel("delivery_orders_watcher")
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "delivery_orders",
            filter: `user_id=eq.${userId}`,
          },
          async (payload) => {
            const newOrder: any = payload.new;
            if (!newOrder?.id) return;
            // Aceita 'pending' e 'preparing' (auto-aceite via trigger BEFORE
            // INSERT entrega o pedido já em preparo no payload realtime).
            if (!["pending", "preparing"].includes(newOrder.status)) return;
            if (processedIds.current.has(newOrder.id)) return;
            processedIds.current.add(newOrder.id);
            const alreadyAutoAccepted = newOrder.status === "preparing";

            // Notificação
            try {
              const audio = new Audio("/notification.mp3");
              audio.play().catch(() => {});
            } catch {}
            toast.success("Novo pedido recebido!");

            // Aguarda persistência de itens e adicionais antes de imprimir.
            try {
              let itemIds: string[] = [];
              for (let i = 0; i < 16; i++) {
                const { data: items } = await supabase
                  .from("delivery_order_items")
                  .select("id")
                  .eq("order_id", newOrder.id);
                if (items && items.length > 0) {
                  itemIds = items.map((it: any) => it.id);
                  break;
                }
                await new Promise((r) => setTimeout(r, 250));
              }

              if (itemIds.length > 0) {
                for (let i = 0; i < 6; i++) {
                  const { data: opts } = await supabase
                    .from("delivery_order_item_options")
                    .select("id")
                    .in("order_item_id", itemIds)
                    .limit(1);
                  if (opts && opts.length > 0) break;
                  await new Promise((r) => setTimeout(r, 250));
                }
              }
            } catch (e) {
              console.warn("Falha ao aguardar itens/adicionais:", e);
            }

            // Impressão sempre
            let printed = false;
            try {
              const result = await dispatchDeliveryPrintJobs(newOrder.id);
              printed = true;
              if (result.jobs > 0) {
                toast.success(`${result.jobs} impressão(ões) enviada(s) à cozinha`);
              }
            } catch (e) {
              console.error("Erro ao imprimir pedido novo:", e);
            }

            // Se já veio auto-aceito pelo trigger, apenas consome ingredientes
            // (idempotente) e atualiza a UI.
            if (alreadyAutoAccepted) {
              try {
                await supabase.rpc("consume_ingredients_for_delivery_order", {
                  p_order_id: newOrder.id,
                });
              } catch (e) {
                console.warn("Falha ao consumir ingredientes:", e);
              }
              toast.success(
                printed
                  ? "Pedido auto-confirmado e em preparo"
                  : "Pedido auto-confirmado",
              );
              queryClient.invalidateQueries({ queryKey: ["delivery-orders"] });
              return;
            }

            // Verifica configuração e caixa para auto-aceite
            try {
              const [{ data: settings }, { data: activeSession }] = await Promise.all([
                supabase
                  .from("delivery_settings")
                  .select("auto_accept_orders")
                  .eq("user_id", userId!)
                  .maybeSingle(),
                supabase
                  .from("pdv_cashier_sessions")
                  .select("id")
                  .eq("user_id", userId!)
                  .is("closed_at", null)
                  .order("opened_at", { ascending: false })
                  .maybeSingle(),
              ]);

              if (!settings?.auto_accept_orders) {
                queryClient.invalidateQueries({ queryKey: ["delivery-orders"] });
                return;
              }

              if (!activeSession?.id) {
                toast.warning("Auto-aceite ignorado: caixa fechado");
                queryClient.invalidateQueries({ queryKey: ["delivery-orders"] });
                return;
              }

              const nowIso = new Date().toISOString();
              const { error: updErr } = await supabase
                .from("delivery_orders")
                .update({ status: "preparing", confirmed_at: nowIso })
                .eq("id", newOrder.id);

              if (updErr) throw updErr;

              await supabase.rpc("consume_ingredients_for_delivery_order", {
                p_order_id: newOrder.id,
              });

              toast.success(
                printed
                  ? "Pedido auto-confirmado e em preparo"
                  : "Pedido auto-confirmado",
              );
            } catch (e) {
              console.error("Erro no auto-aceite do pedido:", e);
            } finally {
              queryClient.invalidateQueries({ queryKey: ["delivery-orders"] });
            }
          },
        )
        .subscribe();
    };

    setup();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [queryClient]);
};
