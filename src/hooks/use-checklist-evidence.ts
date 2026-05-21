import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEstablishmentId } from "@/hooks/use-establishment-id";
import type { Database } from "@/integrations/supabase/types";

type ReviewStatus = Database["public"]["Enums"]["evidence_review_status"];
type ItemType = Database["public"]["Enums"]["checklist_item_type"];

export interface EvidenceItem {
  executionItemId: string;
  photoUrl: string;
  itemTitle: string;
  checklistName: string;
  checklistId: string;
  operatorName: string;
  operatorId: string;
  sector: string;
  executionDate: string;
  completedAt: string | null;
  reviewStatus: ReviewStatus | null;
  reviewComment: string | null;
  reviewedAt: string | null;
  reviewerId: string | null;
  itemType: ItemType;
  isCritical: boolean;
  isCompliant: boolean | null;
}

export interface EvidenceFilters {
  date?: string; // compat: equivalent to dateFrom=dateTo
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  sector?: string;
  operatorId?: string;
  checklistId?: string;
  status?: ReviewStatus | "all";
  itemType?: ItemType | "all";
}


export function useEvidenceGallery(filters: EvidenceFilters) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["evidence-gallery", user?.id, filters],
    queryFn: async (): Promise<EvidenceItem[]> => {
      if (!user?.id) return [];

      let query = supabase
        .from("checklist_execution_items")
        .select(`
          id, photo_url, completed_at, is_compliant,
          checklist_items(title, checklist_id, item_type, is_critical, checklists(name, sector)),
          checklist_executions!inner(id, execution_date, operator_id, user_id, checklist_id, checklist_operators(name))
        `)
        .not("photo_url", "is", null)
        .eq("checklist_executions.user_id", user.id);

      const from = filters.dateFrom || filters.date;
      const to = filters.dateTo || filters.date;
      if (from) {
        query = query.gte("checklist_executions.execution_date", from);
      }
      if (to) {
        query = query.lte("checklist_executions.execution_date", to);
      }
      if (filters.operatorId) {
        query = query.eq("checklist_executions.operator_id", filters.operatorId);
      }
      if (filters.checklistId) {
        query = query.eq("checklist_executions.checklist_id", filters.checklistId);
      }

      const { data, error } = await query.order("id", { ascending: false }).limit(500);
      if (error) throw error;


      const itemIds = (data || []).map((d: any) => d.id);
      let reviews: Record<string, { status: ReviewStatus; comment: string | null; created_at: string; reviewer_id: string | null }> = {};
      if (itemIds.length > 0) {
        const { data: revs } = await supabase
          .from("checklist_evidence_reviews")
          .select("execution_item_id, status, comment, created_at, reviewer_id")
          .in("execution_item_id", itemIds);
        (revs || []).forEach((r: any) => {
          reviews[r.execution_item_id] = { status: r.status, comment: r.comment, created_at: r.created_at, reviewer_id: r.reviewer_id };
        });
      }

      let results = (data || []).map((d: any) => {
        const sector = d.checklist_items?.checklists?.sector || "";
        const itemType = d.checklist_items?.item_type || "checkbox";
        const isCritical = d.checklist_items?.is_critical || false;

        if (filters.sector && filters.sector !== "all" && sector !== filters.sector) return null;
        if (filters.itemType && filters.itemType !== "all" && itemType !== filters.itemType) return null;

        const review = reviews[d.id];
        const reviewStatus = review?.status || null;

        if (filters.status && filters.status !== "all") {
          if (filters.status === "pendente" && reviewStatus !== null && reviewStatus !== "pendente") return null;
          if (filters.status === "aprovado" && reviewStatus !== "aprovado") return null;
          if (filters.status === "reprovado" && reviewStatus !== "reprovado") return null;
        }

        return {
          executionItemId: d.id,
          photoUrl: d.photo_url,
          itemTitle: d.checklist_items?.title || "",
          checklistName: d.checklist_items?.checklists?.name || "",
          checklistId: d.checklist_items?.checklist_id || "",
          operatorName: d.checklist_executions?.checklist_operators?.name || "",
          operatorId: d.checklist_executions?.operator_id || "",
          sector,
          executionDate: d.checklist_executions?.execution_date || "",
          completedAt: d.completed_at || null,
          reviewStatus,
          reviewComment: review?.comment || null,
          reviewedAt: review?.created_at || null,
          reviewerId: review?.reviewer_id || null,
          itemType,
          isCritical,
          isCompliant: d.is_compliant,
        };
      }).filter(Boolean) as EvidenceItem[];

      return results;
    },
    enabled: !!user?.id,
  });
}

export function useReviewEvidence() {
  const { user } = useAuth();
  const { visibleUserId } = useEstablishmentId();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ executionItemIds, status, comment }: { executionItemIds: string | string[]; status: ReviewStatus; comment?: string }) => {
      const ownerId = visibleUserId || user?.id;
      if (!ownerId) throw new Error("No user");
      const ids = Array.isArray(executionItemIds) ? executionItemIds : [executionItemIds];

      // Try to map current auth user to a checklist_operator (for reviewer_id)
      let reviewerId: string | null = null;
      if (user?.id) {
        const { data: op } = await supabase
          .from("checklist_operators")
          .select("id")
          .eq("user_id", user.id)
          .eq("is_active", true)
          .maybeSingle();
        reviewerId = op?.id ?? null;
      }

      for (const id of ids) {
        const payload: Record<string, any> = {
          execution_item_id: id,
          status,
          comment: comment || null,
          user_id: ownerId,
        };
        if (reviewerId) payload.reviewer_id = reviewerId;
        const { error } = await supabase
          .from("checklist_evidence_reviews")
          .upsert(payload as any, { onConflict: "execution_item_id" });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["evidence-gallery"] }),
  });
}

export function useEvidenceOperators() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["evidence-operators", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data } = await supabase
        .from("checklist_operators")
        .select("id, name")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .order("name");
      return data || [];
    },
    enabled: !!user?.id,
  });
}

export function useEvidenceChecklists() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["evidence-checklists", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data } = await supabase
        .from("checklists")
        .select("id, name")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .order("name");
      return data || [];
    },
    enabled: !!user?.id,
  });
}
