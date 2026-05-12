import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEstablishmentId } from "@/hooks/use-establishment-id";
import { resolveProductionCenterId } from "@/utils/resolveProductionCenter";
import { expandComposition } from "@/utils/expandComposition";
import { toast } from "sonner";
import { logActivityDirect } from "@/hooks/use-activity-logs";

export type ComandaStatus =
  | "aberta"
  | "aguardando_pagamento"
  | "em_cobranca"
  | "fechada"
  | "cancelada";
export type KitchenStatus = "pendente" | "preparando" | "pronto" | "entregue";

export interface Comanda {
  id: string;
  user_id: string;
  order_id: string | null;
  comanda_number: string;
  customer_name: string | null;
  person_number: number | null;
  status: ComandaStatus;
  subtotal: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  closed_by_waiter_at?: string | null;
}

export interface ComandaItem {
  id: string;
  comanda_id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  notes: string | null;
  modifiers: Record<string, unknown> | null;
  kitchen_status: KitchenStatus;
  sent_to_kitchen_at: string | null;
  ready_at: string | null;
  created_at: string;
  production_center_id: string | null;
  paid_quantity?: number;
  charging_session_id?: string | null;
}

export function usePDVComandas() {
  const { user } = useAuth();
  const { visibleUserId } = useEstablishmentId();
  const queryClient = useQueryClient();

  // Fetch all comandas
  const { data: comandas = [], isLoading: isLoadingComandas } = useQuery({
    queryKey: ["pdv-comandas", visibleUserId],
    queryFn: async () => {
      if (!visibleUserId) return [];
      const { data, error } = await supabase
        .from("pdv_comandas")
        .select("*")
        .eq("user_id", visibleUserId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as Comanda[];
    },
    enabled: !!visibleUserId,
  });

  // Fetch comanda items — apenas das comandas ativas para evitar carregar histórico inteiro
  // (que pode ultrapassar o limite default de 1000 linhas do Supabase).
  const activeComandaIds = comandas
    .filter(
      (c) =>
        c.status === "aberta" ||
        c.status === "em_cobranca" ||
        c.status === "aguardando_pagamento",
    )
    .map((c) => c.id);
  const activeComandaIdsKey = activeComandaIds.join(",");
  const { data: comandaItems = [], isLoading: isLoadingItems } = useQuery({
    queryKey: ["pdv-comanda-items", visibleUserId, activeComandaIdsKey],
    queryFn: async () => {
      if (!visibleUserId || activeComandaIds.length === 0) return [];
      const { data, error } = await supabase
        .from("pdv_comanda_items")
        .select("*")
        .in("comanda_id", activeComandaIds)
        .order("created_at", { ascending: true })
        .limit(10000);

      if (error) throw error;
      return data as ComandaItem[];
    },
    enabled: !!visibleUserId && activeComandaIds.length > 0,
  });

  // Generate next comanda number
  const generateComandaNumber = async (): Promise<string> => {
    const today = new Date();
    const datePrefix = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;
    const ownerId = visibleUserId || user?.id;

    const { count } = await supabase
      .from("pdv_comandas")
      .select("*", { count: "exact", head: true })
      .eq("user_id", ownerId)
      .gte("created_at", today.toISOString().split("T")[0]);

    const nextNumber = (count || 0) + 1;
    return `${datePrefix}-${String(nextNumber).padStart(3, "0")}`;
  };

  // Create comanda
  const createComandaMutation = useMutation({
    mutationFn: async (data: {
      orderId?: string | null;
      customerName?: string;
      personNumber?: number;
      notes?: string;
    }) => {
      if (!user) throw new Error("Usuário não autenticado");
      const ownerId = visibleUserId || user.id;

      // Comanda avulsa (sem orderId): atrelar internamente à mesa virtual "Balcão"
      let effectiveOrderId = data.orderId || null;
      if (!effectiveOrderId) {
        // 1. Localiza mesa virtual do owner
        const { data: virtualTable } = await supabase
          .from("pdv_tables")
          .select("id, current_order_id, table_number")
          .eq("user_id", ownerId)
          .eq("is_virtual", true)
          .maybeSingle();

        if (virtualTable) {
          // 2. Reusa order aberto se existir; senão cria
          if (virtualTable.current_order_id) {
            effectiveOrderId = virtualTable.current_order_id;
          } else {
            const orderNumber = `ORD-${new Date()
              .toISOString()
              .replace(/[-:.TZ]/g, "")
              .slice(0, 14)}`;
            const { data: newOrder, error: orderErr } = await supabase
              .from("pdv_orders")
              .insert({
                user_id: ownerId,
                table_id: virtualTable.id,
                source: "salao",
                status: "aberto",
                order_number: orderNumber,
                opened_by: user.id,
                opened_at: new Date().toISOString(),
              })
              .select("id")
              .single();
            if (!orderErr && newOrder) {
              effectiveOrderId = newOrder.id;
              await supabase
                .from("pdv_tables")
                .update({
                  current_order_id: newOrder.id,
                  status: "ocupada",
                })
                .eq("id", virtualTable.id);
            }
          }
        }
      }

      // Reserva número sequencial do turno (caixa aberto)
      if (effectiveOrderId) {
        await supabase.rpc("pdv_assign_order_ticket" as any, { p_order_id: effectiveOrderId });
      }

      // Idempotência: se for comanda padrão (sem customerName) vinculada a um
      // order, e já existir uma comanda padrão aberta, devolve a existente.
      // Evita duplicação por clique repetido / race / dois dispositivos.
      const isDefault = !data.customerName;
      if (effectiveOrderId && isDefault) {
        const { data: existing } = await supabase
          .from("pdv_comandas")
          .select("*")
          .eq("order_id", effectiveOrderId)
          .eq("status", "aberta")
          .is("customer_name", null)
          .maybeSingle();
        if (existing) return existing as Comanda;
      }

      const comandaNumber = await generateComandaNumber();

      const { data: newComanda, error } = await supabase
        .from("pdv_comandas")
        .insert({
          user_id: ownerId,
          order_id: effectiveOrderId,
          comanda_number: comandaNumber,
          customer_name: data.customerName || null,
          person_number: data.personNumber || null,
          notes: data.notes || null,
          status: "aberta",
          subtotal: 0,
        })
        .select()
        .single();

      if (error) throw error;
      return newComanda as Comanda;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pdv-comandas"] });
      toast.success("Comanda criada com sucesso!");
    },
    onError: (error) => {
      toast.error("Erro ao criar comanda: " + error.message);
    },
  });

  // Update comanda
  const updateComandaMutation = useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: Partial<Comanda> & { id: string }) => {
      const { data, error } = await supabase
        .from("pdv_comandas")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data as Comanda;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pdv-comandas"] });
    },
    onError: (error) => {
      toast.error("Erro ao atualizar comanda: " + error.message);
    },
  });

  // Close comanda — envia para a fila de cobrança do caixa.
  // A mesa NÃO é liberada aqui: isso só acontece depois do pagamento.
  const closeComandaMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from("pdv_comandas")
        .update({
          status: "aguardando_pagamento",
          closed_by_waiter_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("status", "aberta")
        .select()
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error("Comanda não pôde ser fechada (já foi enviada ao caixa ou cancelada).");
      return data as Comanda;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pdv-comandas"] });
      queryClient.invalidateQueries({ queryKey: ["pdv-tables"] });
      toast.success("Comanda enviada para o caixa");
    },
    onError: (error) => {
      toast.error("Erro ao fechar comanda: " + error.message);
    },
  });

  // Cancel comanda
  const cancelComandaMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from("pdv_comandas")
        .update({ status: "cancelada", updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data as Comanda;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pdv-comandas"] });
      toast.success("Comanda cancelada!");
    },
    onError: (error) => {
      toast.error("Erro ao cancelar comanda: " + error.message);
    },
  });

  // Add item to comanda
  const addItemMutation = useMutation({
    mutationFn: async (data: {
      comandaId: string;
      productId: string;
      productName: string;
      quantity: number;
      unitPrice: number;
      notes?: string;
    }) => {
      // Bloqueia adicionar item em comanda finalizada/cancelada.
      // Permitido: 'aberta' (garçom) e 'aguardando_pagamento'/'em_cobranca' (correção pelo caixa).
      const { data: existing, error: fetchErr } = await supabase
        .from("pdv_comandas")
        .select("status")
        .eq("id", data.comandaId)
        .maybeSingle();
      if (fetchErr) throw fetchErr;
      const allowedStatuses = ["aberta", "aguardando_pagamento", "em_cobranca"];
      if (existing && !allowedStatuses.includes(existing.status)) {
        throw new Error("Esta comanda já foi finalizada e não pode mais receber itens");
      }

      const subtotal = data.quantity * data.unitPrice;
      const ownerId = visibleUserId || user?.id;
      const production_center_id = ownerId
        ? await resolveProductionCenterId(data.productId, ownerId)
        : null;

      const { data: newItem, error } = await supabase
        .from("pdv_comanda_items")
        .insert([{
          comanda_id: data.comandaId,
          product_id: data.productId,
          product_name: data.productName,
          quantity: data.quantity,
          unit_price: data.unitPrice,
          subtotal,
          notes: data.notes || null,
          kitchen_status: "pendente",
          production_center_id,
        }])
        .select()
        .single();

      if (error) throw error;

      // Expandir produto composto: cria filhos invisíveis para roteamento de cozinha
      if (ownerId) {
        const children = await expandComposition(data.productId, data.quantity, ownerId);
        if (children.length > 0) {
          const missing = children.filter((c) => !c.production_center_id);
          if (missing.length > 0) {
            toast.warning(
              `${missing.length} sub-produto(s) sem centro de produção configurado e não serão impressos.`,
            );
          }
          const childRows = children.map((c) => ({
            comanda_id: data.comandaId,
            product_id: c.product_id,
            product_name: c.product_name,
            quantity: c.quantity,
            unit_price: 0,
            subtotal: 0,
            notes: null,
            kitchen_status: "pendente" as const,
            production_center_id: c.production_center_id,
            parent_item_id: (newItem as ComandaItem).id,
            is_composite_child: true,
          }));
          const { error: childError } = await supabase
            .from("pdv_comanda_items")
            .insert(childRows);
          if (childError) {
            // não bloqueia o pai, mas avisa
            toast.error("Erro ao expandir composição: " + childError.message);
          }
        }
      }

      return newItem as ComandaItem;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pdv-comanda-items"] });
      queryClient.invalidateQueries({ queryKey: ["pdv-comandas"] });
      toast.success("Item adicionado!");
    },
    onError: (error) => {
      toast.error("Erro ao adicionar item: " + error.message);
    },
  });

  // Update item
  const updateItemMutation = useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: Partial<ComandaItem> & { id: string }) => {
      // Recalculate subtotal if quantity or unit_price changed
      const updateData: Record<string, unknown> = { ...updates };
      if (updates.quantity !== undefined || updates.unit_price !== undefined) {
        const item = comandaItems.find((i) => i.id === id);
        if (item) {
          const quantity = updates.quantity ?? item.quantity;
          const unitPrice = updates.unit_price ?? item.unit_price;
          updateData.subtotal = quantity * unitPrice;
        }
      }

      const { data, error } = await supabase
        .from("pdv_comanda_items")
        .update(updateData)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data as ComandaItem;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pdv-comanda-items"] });
      queryClient.invalidateQueries({ queryKey: ["pdv-comandas"] });
    },
    onError: (error) => {
      toast.error("Erro ao atualizar item: " + error.message);
    },
  });

  // Remove item
  const removeItemMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("pdv_comanda_items")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onMutate: async (id: string) => {
      // Atualização otimista: remove o item de todas as queries de items em cache
      // para que a UI reflita a remoção instantaneamente, sem esperar o refetch.
      await queryClient.cancelQueries({ queryKey: ["pdv-comanda-items"] });
      const snapshots = queryClient.getQueriesData<ComandaItem[]>({
        queryKey: ["pdv-comanda-items"],
      });
      snapshots.forEach(([key, data]) => {
        if (Array.isArray(data)) {
          queryClient.setQueryData(
            key,
            data.filter((it) => it.id !== id),
          );
        }
      });
      return { snapshots };
    },
    onError: (error, _id, ctx) => {
      // Rollback: restaura snapshots se o delete falhar no servidor
      ctx?.snapshots?.forEach(([key, data]) => {
        queryClient.setQueryData(key, data);
      });
      toast.error("Erro ao remover item: " + error.message);
    },
    onSuccess: () => {
      toast.success("Item removido!");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["pdv-comanda-items"] });
      queryClient.invalidateQueries({ queryKey: ["pdv-comandas"] });
    },
  });

  // Transfer items to another comanda or table (uses RPC pdv_transfer_items, supports partial qty)
  const transferItemsMutation = useMutation({
    mutationFn: async ({
      itemIds,
      targetKind = "comanda",
      targetId,
      qtyMap,
      reason,
      targetComandaName,
    }: {
      itemIds: string[];
      targetKind?: "comanda" | "table";
      targetId: string;
      qtyMap?: Record<string, number>;
      reason?: string | null;
      targetComandaName?: string | null;
      // backward-compat (callers passing targetComandaId/sourceComandaId)
      targetComandaId?: string;
      sourceComandaId?: string;
    }) => {
      if (!itemIds.length) throw new Error("Nenhum item selecionado");
      const { data, error } = await supabase.rpc("pdv_transfer_items", {
        p_item_ids: itemIds,
        p_qty_map: (qtyMap ?? {}) as any,
        p_target_kind: targetKind,
        p_target_id: targetId,
        p_reason: reason ?? null,
        p_target_comanda_name: targetComandaName ?? null,
      } as any);
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pdv-comanda-items"] });
      queryClient.invalidateQueries({ queryKey: ["pdv-comandas"] });
      queryClient.invalidateQueries({ queryKey: ["pdv-tables"] });
      queryClient.invalidateQueries({ queryKey: ["pdv-orders"] });
    },
    onError: (error) => {
      toast.error("Erro ao transferir item: " + error.message);
    },
  });

  // Send items to kitchen (also includes composite children) + enqueue print jobs
  const sendToKitchenMutation = useMutation({
    mutationFn: async (itemIds: string[]) => {
      if (itemIds.length === 0) return;

      // Inclui filhos pendentes dos itens compostos selecionados
      const { data: childRows } = await supabase
        .from("pdv_comanda_items")
        .select("id")
        .in("parent_item_id", itemIds)
        .is("sent_to_kitchen_at", null);

      const allIds = Array.from(
        new Set([...itemIds, ...((childRows ?? []).map((r: any) => r.id))]),
      );

      const { error } = await supabase
        .from("pdv_comanda_items")
        .update({
          kitchen_status: "pendente",
          sent_to_kitchen_at: new Date().toISOString(),
        })
        .in("id", allIds);

      if (error) throw error;

      // Enfileira jobs de impressão (snapshot via view)
      const ownerId = visibleUserId || user?.id;
      if (!ownerId) return;

      // Nome do garçom (usuário autenticado)
      let waiterName: string | null = null;
      if (user?.id) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", user.id)
          .maybeSingle();
        waiterName = prof?.full_name || user.email || null;
      }

      const { data: viewRows, error: viewError } = await supabase
        .from("vw_print_bridge_comanda_items")
        .select("*")
        .in("id", allIds);

      if (viewError) {
        toast.error("Erro ao montar fila de impressão: " + viewError.message);
        return;
      }

      // Agrupa por (comanda + impressora/centro) para imprimir 1 papel por grupo
      const groups = new Map<string, any[]>();
      (viewRows ?? []).forEach((row: any) => {
        const groupKey = `${row.comanda_id ?? "nocomanda"}::${row.production_center_id ?? "nocenter"}::${row.printer_ip ?? "noip"}::${row.printer_port ?? 9100}`;
        const arr = groups.get(groupKey) || [];
        arr.push(row);
        groups.set(groupKey, arr);
      });

      const jobs = Array.from(groups.values()).map((rows) => {
        const first = rows[0];
        const hasPrinter = !!first.printer_ip;
        return {
          tenant_user_id: ownerId,
          source_kind: "comanda" as const,
          source_item_id: first.id, // representativo (1º item do grupo)
          center_id: first.production_center_id,
          center_name: first.center_name,
          printer_ip: first.printer_ip,
          printer_port: first.printer_port || 9100,
          payload: {
            mesa_numero: first.is_virtual
              ? String(first.table_number || "Balcão")
              : (first.table_number ? String(first.table_number) : "AVULSA"),
            comanda_nome:
              first.customer_name ||
              (first.comanda_number ? `Comanda ${first.comanda_number}` : "Comanda"),
            is_counter: !!first.is_virtual,
            comanda_number: first.comanda_number,
            customer_name: first.customer_name,
            table_number: first.table_number,
            kind: "comanda",
              waiter_name: waiterName,
              ticket_number: first.ticket_number,
              order_number: first.order_number,
            items: rows.map((r: any) => ({
              product_name: r.product_name,
              quantity: r.quantity,
              notes: r.notes,
              modifiers: r.modifiers,
              parent_product_name: r.parent_product_name,
              is_composite_child: r.is_composite_child,
            })),
          },
          status: hasPrinter ? "pending" : "failed",
          error_message: hasPrinter ? null : "sem impressora configurada",
        };
      });

      if (jobs.length > 0) {
        const { error: jobsError } = await supabase
          .from("pdv_print_jobs")
          .insert(jobs);
        if (jobsError) {
          toast.error("Erro ao criar jobs de impressão: " + jobsError.message);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pdv-comanda-items"] });
      toast.success("Itens enviados para cozinha!");
    },
    onError: (error) => {
      toast.error("Erro ao enviar para cozinha: " + error.message);
    },
  });

  // Lock comandas para o caixa atual (transição aberta|aguardando_pagamento -> em_cobranca).
  // Retorna a lista de IDs efetivamente travados.
  const markAsChargingMutation = useMutation({
    mutationFn: async (ids: string[]): Promise<string[]> => {
      if (!ids.length) return [];
      const { data, error } = await supabase
        .from("pdv_comandas")
        .update({ status: "em_cobranca", updated_at: new Date().toISOString() })
        .in("id", ids)
        .in("status", ["aberta", "aguardando_pagamento"])
        .select("id");
      if (error) throw error;
      return ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pdv-comandas"] });
    },
  });

  // Devolver comanda ao garçom (em_cobranca -> aberta) com motivo obrigatório.
  // Usado quando o caixa abriu cobrança mas precisa cancelar (cliente quer
  // mais itens, etc.).
  const returnToWaiterMutation = useMutation({
    mutationFn: async ({ comandaId, reason }: { comandaId: string; reason: string }) => {
      const trimmed = reason.trim();
      if (!trimmed) throw new Error("Motivo obrigatório para devolver ao garçom");

      // Busca notes atual para fazer append
      const { data: current, error: fetchErr } = await supabase
        .from("pdv_comandas")
        .select("notes, status")
        .eq("id", comandaId)
        .maybeSingle();
      if (fetchErr) throw fetchErr;
      if (!current) throw new Error("Comanda não encontrada");
      if (current.status !== "em_cobranca") {
        throw new Error("Esta comanda não está em cobrança");
      }

      const stamp = new Date().toLocaleString("pt-BR");
      const noteLine = `[${stamp}] Devolvida ao garçom: ${trimmed}`;
      const newNotes = current.notes ? `${current.notes}\n${noteLine}` : noteLine;

      const { data, error } = await supabase
        .from("pdv_comandas")
        .update({
          status: "aberta",
          closed_by_waiter_at: null,
          notes: newNotes,
          updated_at: new Date().toISOString(),
        })
        .eq("id", comandaId)
        .eq("status", "em_cobranca")
        .select()
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Comanda não pôde ser devolvida (status mudou)");
      return data as Comanda;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pdv-comandas"] });
      toast.success("Comanda devolvida ao garçom");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Liberar comandas travadas (em_cobranca -> aberta) quando o
  // caixa fecha o dialog sem concluir o pagamento. Garçom volta a poder editar.
  const releaseFromChargingMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      if (!ids.length) return;
      const { error } = await supabase
        .from("pdv_comandas")
        .update({
          status: "aberta",
          updated_at: new Date().toISOString(),
        })
        .in("id", ids)
        .eq("status", "em_cobranca");
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pdv-comandas"] });
    },
  });

  // Lock atômico de itens individuais para o modo "Pagar por produto".
  const lockItemsForChargingMutation = useMutation({
    mutationFn: async ({ itemIds, sessionId }: { itemIds: string[]; sessionId: string }): Promise<string[]> => {
      if (!itemIds.length) return [];
      const { data, error } = await (supabase.rpc as any)("pdv_lock_comanda_items", {
        p_item_ids: itemIds,
        p_session_id: sessionId,
      });
      if (error) throw error;
      return ((data ?? []) as Array<{ locked_id: string }>).map((r) => r.locked_id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pdv-comanda-items"] });
    },
  });

  const unlockItemsForChargingMutation = useMutation({
    mutationFn: async ({ itemIds, sessionId }: { itemIds: string[]; sessionId: string }) => {
      if (!itemIds.length) return;
      const { error } = await (supabase.rpc as any)("pdv_unlock_comanda_items", {
        p_item_ids: itemIds,
        p_session_id: sessionId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pdv-comanda-items"] });
    },
  });

  // Helper to get items for a specific comanda (only visible/parent items)
  const getItemsByComanda = (comandaId: string) => {
    return comandaItems.filter(
      (item) => item.comanda_id === comandaId && !(item as any).is_composite_child,
    );
  };

  // Helper to get comandas for a specific order
  const getComandasByOrder = (orderId: string) => {
    return comandas.filter((c) => c.order_id === orderId);
  };

  // Helper to get standalone comandas (no order) — only "aberta"
  const getStandaloneComandas = () => {
    return comandas.filter((c) => !c.order_id && c.status === "aberta");
  };

  // Helper: comandas elegíveis para a fila do caixa.
  // Inclui:
  //  - 'em_cobranca' (já abertas no caixa)
  //  - 'aberta' que tenham ao menos um item enviado à cozinha
  //    (descarta comandas vazias / só rascunho local).
  // Mantém 'aguardando_pagamento' por compatibilidade com comandas legadas.
  const getPendingPaymentComandas = () => {
    const sentByComanda = new Set<string>();
    comandaItems.forEach((it) => {
      if (it.sent_to_kitchen_at && !(it as any).is_composite_child) {
        sentByComanda.add(it.comanda_id);
      }
    });
    return comandas.filter((c) => {
      if (c.status === "em_cobranca" || c.status === "aguardando_pagamento") return true;
      if (c.status === "aberta" && sentByComanda.has(c.id)) return true;
      return false;
    });
  };

  // Helper: comandas pendentes de pagamento de uma mesa específica
  const getPendingComandasByOrderId = (orderId: string | null | undefined) => {
    if (!orderId) return [];
    const eligible = new Set(getPendingPaymentComandas().map((c) => c.id));
    return comandas.filter((c) => c.order_id === orderId && eligible.has(c.id));
  };

  return {
    comandas,
    comandaItems,
    isLoading: isLoadingComandas || isLoadingItems,

    // Mutations
    createComanda: createComandaMutation.mutateAsync,
    updateComanda: updateComandaMutation.mutate,
    closeComanda: closeComandaMutation.mutate,
    cancelComanda: cancelComandaMutation.mutate,
    addItem: addItemMutation.mutateAsync,
    updateItem: updateItemMutation.mutate,
    removeItem: removeItemMutation.mutate,
    transferItems: transferItemsMutation.mutateAsync,
    isTransferringItems: transferItemsMutation.isPending,
    sendToKitchen: sendToKitchenMutation.mutate,
    sendToKitchenAsync: sendToKitchenMutation.mutateAsync,
    markAsCharging: markAsChargingMutation.mutateAsync,
    releaseFromCharging: releaseFromChargingMutation.mutateAsync,
    lockItemsForCharging: lockItemsForChargingMutation.mutateAsync,
    unlockItemsForCharging: unlockItemsForChargingMutation.mutateAsync,
    returnToWaiter: returnToWaiterMutation.mutateAsync,
    isReturningToWaiter: returnToWaiterMutation.isPending,

    // Pending states
    isCreating: createComandaMutation.isPending,
    isAddingItem: addItemMutation.isPending,
    isRemovingItem: removeItemMutation.isPending,

    // Helpers
    getItemsByComanda,
    getComandasByOrder,
    getStandaloneComandas,
    getPendingPaymentComandas,
    getPendingComandasByOrderId,
  };
}
