import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Gift, Pencil, Trash2, Loader2, Package, Percent } from "lucide-react";
import { describePrizeDiscount } from "@/lib/loyalty-prize";
import { formatBRL } from "@/lib/format";
import { useLoyaltyPrizes, useDeleteLoyaltyPrize } from "@/hooks/use-delivery-loyalty";
import { LoyaltyPrizeDialog } from "./LoyaltyPrizeDialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function LoyaltyPrizes() {
  const { data: prizes = [], isLoading } = useLoyaltyPrizes();
  const deletePrize = useDeleteLoyaltyPrize();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPrize, setEditingPrize] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Prêmios Resgatáveis</CardTitle>
          <Button size="sm" onClick={() => { setEditingPrize(null); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" /> Novo Prêmio
          </Button>
        </CardHeader>
        <CardContent>
          {prizes.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Gift className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>Nenhum prêmio cadastrado</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {prizes.map((prize) => (
                <Card key={prize.id} className="relative">
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-semibold">{prize.name}</h4>
                        {/* O que o prêmio entrega vale mais que o nome: dois
                            prêmios podem se chamar igual e pagar diferente. */}
                        <p className="flex items-center gap-1 text-sm text-primary">
                          {(prize as any).kind === "discount" ? (
                            <>
                              <Percent className="h-3.5 w-3.5" />
                              {describePrizeDiscount(prize as any)}
                            </>
                          ) : (
                            <>
                              <Package className="h-3.5 w-3.5" />
                              {(prize as any).delivery_product_id ? "Produto vinculado" : "Sem produto vinculado"}
                            </>
                          )}
                        </p>
                        {prize.description && <p className="text-sm text-muted-foreground">{prize.description}</p>}
                        {Number((prize as any).min_order_value) > 0 && (
                          <p className="text-xs text-muted-foreground">
                            Pedido mínimo de {formatBRL(Number((prize as any).min_order_value))}
                          </p>
                        )}
                      </div>
                      <Badge variant={prize.is_active ? "default" : "secondary"}>
                        {prize.is_active ? "Ativo" : "Inativo"}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-primary">{prize.points_cost} pontos</span>
                      <span className="text-muted-foreground">
                        {prize.redeemed_count} resgates
                        {prize.max_quantity && ` / ${prize.max_quantity} máx`}
                      </span>
                    </div>
                    <div className="flex gap-2 pt-2">
                      <Button size="sm" variant="outline" onClick={() => { setEditingPrize(prize); setDialogOpen(true); }}>
                        <Pencil className="h-3 w-3 mr-1" /> Editar
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => setDeleteId(prize.id)}>
                        <Trash2 className="h-3 w-3 mr-1" /> Excluir
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <LoyaltyPrizeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        prize={editingPrize}
      />

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir prêmio?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deleteId) { deletePrize.mutate(deleteId); setDeleteId(null); } }}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
