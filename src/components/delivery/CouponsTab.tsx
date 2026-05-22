import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import {
  useDeliveryCoupons,
  useDeleteCoupon,
  useUpdateCoupon,
  DeliveryCoupon,
} from "@/hooks/use-delivery-coupons";
import { useEstablishmentId } from "@/hooks/use-establishment-id";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { buildPublicMenuUrl } from "@/lib/public-menu-link";
import { CouponsKPIs } from "./coupons/CouponsKPIs";
import {
  CouponsFilters,
  StatusFilter,
  TypeFilter,
  SortBy,
} from "./coupons/CouponsFilters";
import { CouponsTable } from "./coupons/CouponsTable";
import { CouponSheet } from "./coupons/CouponSheet";
import { CouponShareDialog } from "./coupons/CouponShareDialog";
import { CouponAnalyticsDialog } from "./coupons/CouponAnalyticsDialog";
import { EmptyCouponsState } from "./coupons/EmptyCouponsState";
import { useCouponsStats } from "@/hooks/use-coupons-stats";

export const CouponsTab = () => {
  const { data: coupons = [] } = useDeliveryCoupons();
  const deleteCoupon = useDeleteCoupon();
  const updateCoupon = useUpdateCoupon();
  const { visibleUserId } = useEstablishmentId();
  const stats = useCouponsStats(coupons);

  const { data: bizSlug } = useQuery({
    queryKey: ["business-slug", visibleUserId],
    queryFn: async () => {
      if (!visibleUserId) return null;
      const { data } = await supabase
        .from("business_settings")
        .select("slug")
        .eq("user_id", visibleUserId)
        .maybeSingle();
      return data?.slug ?? null;
    },
    enabled: !!visibleUserId,
  });

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<DeliveryCoupon | null>(null);
  const [deleting, setDeleting] = useState<DeliveryCoupon | null>(null);
  const [sharing, setSharing] = useState<DeliveryCoupon | null>(null);
  const [analytics, setAnalytics] = useState<DeliveryCoupon | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [type, setType] = useState<TypeFilter>("all");
  const [sort, setSort] = useState<SortBy>("created");

  const filtered = useMemo(() => {
    const now = new Date();
    let arr = coupons.filter((c) => {
      if (search && !c.code.toLowerCase().includes(search.toLowerCase()))
        return false;
      if (type !== "all" && c.type !== type) return false;
      const expired = new Date(c.valid_until) < now;
      if (status === "active" && (!c.is_active || expired)) return false;
      if (status === "inactive" && c.is_active) return false;
      if (status === "expired" && !expired) return false;
      return true;
    });
    arr = [...arr].sort((a, b) => {
      if (sort === "most_used") return b.usage_count - a.usage_count;
      if (sort === "valid_until")
        return (
          new Date(a.valid_until).getTime() - new Date(b.valid_until).getTime()
        );
      return (
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    });
    return arr;
  }, [coupons, search, status, type, sort]);

  const buildShareUrl = (code: string) => {
    if (!visibleUserId) return "";
    const base = buildPublicMenuUrl({ userId: visibleUserId, slug: bizSlug });
    return `${base}?cupom=${code}`;
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success("Código copiado!");
  };
  const handleCopyLink = (code: string) => {
    const url = buildShareUrl(code);
    if (!url) return;
    navigator.clipboard.writeText(url);
    toast.success("Link copiado!");
  };

  const handleToggleActive = (c: DeliveryCoupon) => {
    updateCoupon.mutate({ id: c.id, updates: { is_active: !c.is_active } });
  };

  const handleEdit = (c: DeliveryCoupon) => {
    setEditing(c);
    setSheetOpen(true);
  };
  const handleCreate = () => {
    setEditing(null);
    setSheetOpen(true);
  };
  const handleSheetClose = (open: boolean) => {
    setSheetOpen(open);
    if (!open) setEditing(null);
  };

  const handleDelete = () => {
    if (!deleting) return;
    deleteCoupon.mutate(deleting.id, {
      onSuccess: () => setDeleting(null),
    });
  };

  const showEmptyState = coupons.length === 0;

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row gap-3 justify-between sm:items-center">
          <div>
            <h2 className="text-2xl font-bold">Cupons de Desconto</h2>
            <p className="text-sm text-muted-foreground">
              Crie e gerencie cupons promocionais do seu delivery
            </p>
          </div>
          <Button onClick={handleCreate}>
            <Plus className="w-4 h-4 mr-2" /> Criar cupom
          </Button>
        </div>

        <CouponsKPIs stats={stats} />

        {showEmptyState ? (
          <EmptyCouponsState onCreate={handleCreate} />
        ) : (
          <>
            <CouponsFilters
              search={search}
              onSearchChange={setSearch}
              status={status}
              onStatusChange={setStatus}
              type={type}
              onTypeChange={setType}
              sort={sort}
              onSortChange={setSort}
            />

            <CouponsTable
              coupons={filtered}
              expandedId={expandedId}
              onToggleExpand={(id) =>
                setExpandedId((curr) => (curr === id ? null : id))
              }
              onToggleActive={handleToggleActive}
              onEdit={handleEdit}
              onCopyCode={handleCopyCode}
              onCopyLink={handleCopyLink}
              onShareQR={(c) => setSharing(c)}
              onDelete={(c) => setDeleting(c)}
              onOpenAnalytics={(c) => setAnalytics(c)}
            />
          </>
        )}
      </div>

      <CouponSheet
        open={sheetOpen}
        onOpenChange={handleSheetClose}
        coupon={editing}
      />

      {sharing && (
        <CouponShareDialog
          open={!!sharing}
          onOpenChange={(o) => !o && setSharing(null)}
          code={sharing.code}
          url={buildShareUrl(sharing.code)}
        />
      )}

      <AlertDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cupom</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o cupom "{deleting?.code}"? Esta
              ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
