import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Trash2, Copy, Percent, DollarSign, Link2 } from "lucide-react";
import { useState } from "react";
import { useDeliveryCoupons, useDeleteCoupon, useUpdateCoupon } from "@/hooks/use-delivery-coupons";
import { useEstablishmentId } from "@/hooks/use-establishment-id";
import { CouponDialog } from "./CouponDialog";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
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
import { DeliveryCoupon } from "@/hooks/use-delivery-coupons";
import { formatBRL } from "@/lib/format";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { buildPublicMenuUrl } from "@/lib/public-menu-link";

export const CouponsTab = () => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<DeliveryCoupon | null>(null);
  const [deletingCoupon, setDeletingCoupon] = useState<DeliveryCoupon | null>(null);

  const { data: coupons = [] } = useDeliveryCoupons();
  const deleteCoupon = useDeleteCoupon();
  const updateCoupon = useUpdateCoupon();
  const { visibleUserId } = useEstablishmentId();

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success("Código copiado!");
  };

  const handleCopyLink = (code: string) => {
    const url = `${window.location.origin}/cardapio/${visibleUserId}?cupom=${code}`;
    navigator.clipboard.writeText(url);
    toast.success("Link com cupom copiado!");
  };

  const handleToggleActive = (coupon: DeliveryCoupon) => {
    updateCoupon.mutate({
      id: coupon.id,
      updates: { is_active: !coupon.is_active },
    });
  };

  const handleDelete = () => {
    if (deletingCoupon) {
      deleteCoupon.mutate(deletingCoupon.id, {
        onSuccess: () => setDeletingCoupon(null),
      });
    }
  };

  const handleEdit = (coupon: DeliveryCoupon) => {
    setEditingCoupon(coupon);
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingCoupon(null);
  };

  const activeCoupons = coupons.filter(c => c.is_active);
  const inactiveCoupons = coupons.filter(c => !c.is_active);

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
          <div>
            <h2 className="text-2xl font-bold">Cupons de Desconto</h2>
            <p className="text-sm text-muted-foreground">
              Crie e gerencie cupons promocionais
            </p>
          </div>
          <Button onClick={() => setIsDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Criar Cupom
          </Button>
        </div>

        {/* Active Coupons */}
        <div>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            Cupons Ativos
            <Badge variant="secondary">{activeCoupons.length}</Badge>
          </h3>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {activeCoupons.map((coupon) => (
              <Card key={coupon.id}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between text-base">
                    <div className="flex items-center gap-2">
                      {coupon.type === "percentage" ? (
                        <Percent className="h-4 w-4 text-primary" />
                      ) : (
                        <DollarSign className="h-4 w-4 text-primary" />
                      )}
                      <span className="font-mono font-bold">{coupon.code}</span>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => handleCopyCode(coupon.code)}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <p className="text-2xl font-bold text-primary">
                      {coupon.type === "percentage"
                        ? `${coupon.value}% OFF`
                        : `${formatBRL(Number(coupon.value))} OFF`}
                    </p>
                    {coupon.min_order_value > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Pedido mínimo: {formatBRL(Number(coupon.min_order_value))}
                      </p>
                    )}
                    {coupon.max_discount && (
                      <p className="text-xs text-muted-foreground">
                        Desconto máximo: {formatBRL(Number(coupon.max_discount))}
                      </p>
                    )}
                  </div>

                  <div className="text-xs text-muted-foreground space-y-1">
                    <p>
                      Válido até:{" "}
                      {format(new Date(coupon.valid_until), "dd/MM/yyyy", { locale: ptBR })}
                    </p>
                    <p>
                      Usado: {coupon.usage_count}/{coupon.usage_limit} vezes
                    </p>
                  </div>

                  <Button
                    size="sm"
                    variant="secondary"
                    className="w-full mb-2"
                    onClick={() => handleCopyLink(coupon.code)}
                  >
                    <Link2 className="h-3.5 w-3.5 mr-1" />
                    Copiar Link
                  </Button>

                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => handleEdit(coupon)}
                    >
                      <Edit className="h-3.5 w-3.5 mr-1" />
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleToggleActive(coupon)}
                    >
                      Desativar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => setDeletingCoupon(coupon)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
            {activeCoupons.length === 0 && (
              <Card className="col-span-full">
                <CardContent className="text-center text-muted-foreground py-8">
                  Nenhum cupom ativo
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Inactive Coupons */}
        {inactiveCoupons.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              Cupons Inativos
              <Badge variant="outline">{inactiveCoupons.length}</Badge>
            </h3>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {inactiveCoupons.map((coupon) => (
                <Card key={coupon.id} className="opacity-60">
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between text-base">
                      <span className="font-mono font-bold">{coupon.code}</span>
                      <Badge variant="outline">Inativo</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-lg font-bold">
                      {coupon.type === "percentage"
                        ? `${coupon.value}% OFF`
                        : `${formatBRL(Number(coupon.value))} OFF`}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        onClick={() => handleToggleActive(coupon)}
                      >
                        Reativar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => setDeletingCoupon(coupon)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>

      <CouponDialog
        open={isDialogOpen}
        onOpenChange={handleCloseDialog}
        coupon={editingCoupon || undefined}
      />

      <AlertDialog
        open={!!deletingCoupon}
        onOpenChange={(open) => !open && setDeletingCoupon(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Cupom</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o cupom "{deletingCoupon?.code}"? Esta
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
