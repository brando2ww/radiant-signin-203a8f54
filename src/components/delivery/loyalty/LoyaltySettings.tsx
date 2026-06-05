import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useLoyaltySettings, useUpsertLoyaltySettings } from "@/hooks/use-delivery-loyalty";

interface FormValues {
  points_per_real: number;
  min_points_redeem: number;
  cashback_value_per_point: number;
  is_active: boolean;
  points_expire_days: number;
}

export function LoyaltySettings() {
  const { data: settings, isLoading } = useLoyaltySettings();
  const upsert = useUpsertLoyaltySettings();
  const { register, handleSubmit, setValue, watch, reset } = useForm<FormValues>({
    defaultValues: {
      points_per_real: 1,
      min_points_redeem: 50,
      cashback_value_per_point: 0.1,
      is_active: true,
      points_expire_days: 0,
    },
  });

  useEffect(() => {
    if (settings) {
      reset({
        points_per_real: Number(settings.points_per_real),
        min_points_redeem: settings.min_points_redeem,
        cashback_value_per_point: Number(settings.cashback_value_per_point),
        is_active: settings.is_active,
        points_expire_days: (settings as any).points_expire_days ?? 0,
      });
    }
  }, [settings, reset]);


  const isActive = watch("is_active");

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <form onSubmit={handleSubmit((v) => upsert.mutate(v))}>
      <Card>
        <CardHeader>
          <CardTitle>Configurações do Programa</CardTitle>
          <CardDescription>Defina as regras de acúmulo e resgate de pontos</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <Label>Programa ativo</Label>
              <p className="text-sm text-muted-foreground">Ative ou desative o programa de fidelidade</p>
            </div>
            <Switch checked={isActive} onCheckedChange={(v) => setValue("is_active", v)} />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>Pontos por R$ 1,00</Label>
              <Input type="number" step="0.1" min="0.1" {...register("points_per_real", { valueAsNumber: true })} />
              <p className="text-xs text-muted-foreground">Ex: 1 = cada R$1 gasto vale 1 ponto</p>
            </div>

            <div className="space-y-2">
              <Label>Mínimo para resgate</Label>
              <Input type="number" min="1" {...register("min_points_redeem", { valueAsNumber: true })} />
              <p className="text-xs text-muted-foreground">Quantidade mínima de pontos para resgatar</p>
            </div>

            <div className="space-y-2">
              <Label>Valor do cashback por ponto (R$)</Label>
              <Input type="number" step="0.01" min="0.01" {...register("cashback_value_per_point", { valueAsNumber: true })} />
              <p className="text-xs text-muted-foreground">Ex: 0.10 = cada ponto vale R$0,10 de desconto</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">

            <div className="space-y-2">
              <Label>Pontos expiram após (dias)</Label>
              <Input type="number" min="0" {...register("points_expire_days", { valueAsNumber: true })} />
              <p className="text-xs text-muted-foreground">0 = pontos nunca expiram. Recomendado: 180.</p>
            </div>
          </div>


          <Button type="submit" disabled={upsert.isPending}>
            {upsert.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Salvar Configurações
          </Button>
        </CardContent>
      </Card>
    </form>
  );
}
