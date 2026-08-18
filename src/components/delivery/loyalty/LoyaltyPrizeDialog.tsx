import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useCreateLoyaltyPrize, useUpdateLoyaltyPrize } from "@/hooks/use-delivery-loyalty";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prize?: any;
}

interface FormValues {
  name: string;
  description: string;
  points_cost: number;
  is_active: boolean;
  max_quantity: string;
  delivery_product_id: string;
}

export function LoyaltyPrizeDialog({ open, onOpenChange, prize }: Props) {
  const create = useCreateLoyaltyPrize();
  const update = useUpdateLoyaltyPrize();
  const { user } = useAuth();
  const [productOpen, setProductOpen] = useState(false);
  const { register, handleSubmit, reset, setValue, watch } = useForm<FormValues>({
    defaultValues: {
      name: "", description: "", points_cost: 50, is_active: true, max_quantity: "",
      delivery_product_id: "",
    },
  });

  // Produtos do cardápio: é o que o resgate vai entregar, e é a tabela que o
  // carrinho conhece.
  const { data: products = [] } = useQuery({
    queryKey: ["loyalty-prize-products", user?.id],
    enabled: !!user?.id && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("delivery_products")
        .select("id, name, base_price, is_available")
        .eq("user_id", user!.id)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string; base_price: number | null; is_available: boolean | null }>;
    },
  });

  const productId = watch("delivery_product_id");
  const selectedProduct = useMemo(
    () => products.find((p) => p.id === productId),
    [products, productId],
  );

  useEffect(() => {
    if (prize) {
      reset({
        name: prize.name,
        description: prize.description || "",
        points_cost: prize.points_cost,
        is_active: prize.is_active,
        max_quantity: prize.max_quantity?.toString() || "",
        delivery_product_id: prize.delivery_product_id || "",
      });
    } else {
      reset({
        name: "", description: "", points_cost: 50, is_active: true, max_quantity: "",
        delivery_product_id: "",
      });
    }
  }, [prize, open, reset]);

  const isActive = watch("is_active");
  const isPending = create.isPending || update.isPending;

  const onSubmit = (values: FormValues) => {
    const payload = {
      name: values.name,
      description: values.description || undefined,
      points_cost: values.points_cost,
      is_active: values.is_active,
      max_quantity: values.max_quantity ? parseInt(values.max_quantity) : null,
      delivery_product_id: values.delivery_product_id || null,
    };

    if (prize) {
      update.mutate({ id: prize.id, ...payload }, { onSuccess: () => onOpenChange(false) });
    } else {
      create.mutate(payload, { onSuccess: () => onOpenChange(false) });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{prize ? "Editar Prêmio" : "Novo Prêmio"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label>Nome *</Label>
            <Input {...register("name", { required: true })} placeholder="Ex: Sobremesa grátis" />
          </div>
          <div className="space-y-2">
            <Label>Descrição</Label>
            <Textarea {...register("description")} placeholder="Descrição do prêmio" rows={2} />
          </div>
          <div className="space-y-2">
            <Label>Produto entregue no resgate</Label>
            <Popover open={productOpen} onOpenChange={setProductOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  className="w-full justify-between font-normal"
                >
                  <span className="truncate">
                    {selectedProduct
                      ? `${selectedProduct.name}${selectedProduct.base_price != null ? ` · ${formatBRL(Number(selectedProduct.base_price))}` : ""}`
                      : "Nenhum produto vinculado"}
                  </span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Buscar produto..." className="h-9" />
                  <CommandList>
                    <CommandEmpty>Nenhum produto encontrado.</CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        value="Nenhum produto vinculado"
                        onSelect={() => {
                          setValue("delivery_product_id", "");
                          setProductOpen(false);
                        }}
                      >
                        <Check className={cn("mr-2 h-4 w-4", !productId ? "opacity-100" : "opacity-0")} />
                        Nenhum produto vinculado
                      </CommandItem>
                      {products.map((p) => (
                        <CommandItem
                          key={p.id}
                          // O Command filtra pelo value: o nome é o que faz a
                          // busca por texto funcionar (o id seria inútil).
                          value={p.name}
                          onSelect={() => {
                            setValue("delivery_product_id", p.id);
                            setProductOpen(false);
                          }}
                        >
                          <Check className={cn("mr-2 h-4 w-4", productId === p.id ? "opacity-100" : "opacity-0")} />
                          <span className="truncate">{p.name}</span>
                          {p.base_price != null && (
                            <span className="ml-auto pl-2 text-xs text-muted-foreground">
                              {formatBRL(Number(p.base_price))}
                            </span>
                          )}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <p className="text-xs text-muted-foreground">
              Sem produto vinculado, o resgate continua valendo mas alguém precisa honrar na mão.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Custo em pontos *</Label>
              <Input type="number" min="1" {...register("points_cost", { valueAsNumber: true, required: true })} />
            </div>
            <div className="space-y-2">
              <Label>Qtd. máxima (opcional)</Label>
              <Input type="number" min="1" {...register("max_quantity")} placeholder="Ilimitado" />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <Label>Ativo</Label>
            <Switch checked={isActive} onCheckedChange={(v) => setValue("is_active", v)} />
          </div>
          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {prize ? "Salvar" : "Criar Prêmio"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
