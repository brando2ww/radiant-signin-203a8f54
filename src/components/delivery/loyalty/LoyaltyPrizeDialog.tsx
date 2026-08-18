import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Check, ChevronsUpDown, Loader2, Package, Percent } from "lucide-react";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/format";
import { computePrizeDiscount, type PrizeDiscountType, type PrizeKind } from "@/lib/loyalty-prize";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useCreateLoyaltyPrize, useUpdateLoyaltyPrize } from "@/hooks/use-delivery-loyalty";
import { toast } from "sonner";

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
  kind: PrizeKind;
  discount_type: PrizeDiscountType;
  discount_value: string;
  discount_max: string;
  min_order_value: string;
}

const VAZIO: FormValues = {
  name: "", description: "", points_cost: 50, is_active: true, max_quantity: "",
  delivery_product_id: "", kind: "product", discount_type: "fixed",
  discount_value: "", discount_max: "", min_order_value: "",
};

/** Campo numérico em texto → número. Vírgula decimal é o que o lojista digita. */
const parseNum = (v: string): number => {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

export function LoyaltyPrizeDialog({ open, onOpenChange, prize }: Props) {
  const create = useCreateLoyaltyPrize();
  const update = useUpdateLoyaltyPrize();
  const { user } = useAuth();
  const [productOpen, setProductOpen] = useState(false);
  const { register, handleSubmit, reset, setValue, watch } = useForm<FormValues>({
    defaultValues: VAZIO,
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

  const kind = watch("kind");
  const discountType = watch("discount_type");
  const discountValue = watch("discount_value");
  const discountMax = watch("discount_max");
  const productId = watch("delivery_product_id");
  const selectedProduct = useMemo(
    () => products.find((p) => p.id === productId),
    [products, productId],
  );

  // Percentual é abstrato para quem cadastra. Mostrar quanto dá num pedido de
  // R$ 100 evita o clássico "10%" que na prática vira R$ 6.
  const previa = useMemo(() => {
    if (kind !== "discount") return null;
    return computePrizeDiscount(
      {
        discount_type: discountType,
        discount_value: parseNum(discountValue),
        discount_max: discountMax ? parseNum(discountMax) : null,
      },
      100,
    );
  }, [kind, discountType, discountValue, discountMax]);

  useEffect(() => {
    if (prize) {
      reset({
        name: prize.name,
        description: prize.description || "",
        points_cost: prize.points_cost,
        is_active: prize.is_active,
        max_quantity: prize.max_quantity?.toString() || "",
        delivery_product_id: prize.delivery_product_id || "",
        kind: (prize.kind as PrizeKind) || "product",
        discount_type: (prize.discount_type as PrizeDiscountType) || "fixed",
        discount_value: prize.discount_value != null ? String(prize.discount_value) : "",
        discount_max: prize.discount_max != null ? String(prize.discount_max) : "",
        min_order_value: prize.min_order_value ? String(prize.min_order_value) : "",
      });
    } else {
      reset(VAZIO);
    }
  }, [prize, open, reset]);

  const isActive = watch("is_active");
  const isPending = create.isPending || update.isPending;

  const onSubmit = (values: FormValues) => {
    const ehDesconto = values.kind === "discount";
    const valor = parseNum(values.discount_value);

    if (ehDesconto) {
      if (valor <= 0) {
        toast.error("Informe o valor do desconto.");
        return;
      }
      if (values.discount_type === "percentage" && valor > 100) {
        toast.error("Desconto percentual não pode passar de 100%.");
        return;
      }
    }

    const payload = {
      name: values.name,
      description: values.description || undefined,
      points_cost: values.points_cost,
      is_active: values.is_active,
      max_quantity: values.max_quantity ? parseInt(values.max_quantity) : null,
      kind: values.kind,
      min_order_value: values.min_order_value ? parseNum(values.min_order_value) : 0,
      // Os campos do outro tipo são zerados de propósito: prêmio que já foi
      // produto e virou desconto não pode continuar arrastando um produto
      // vinculado, senão o resgate entrega as duas coisas.
      delivery_product_id: ehDesconto ? null : values.delivery_product_id || null,
      discount_type: ehDesconto ? values.discount_type : null,
      discount_value: ehDesconto ? valor : null,
      discount_max:
        ehDesconto && values.discount_type === "percentage" && values.discount_max
          ? parseNum(values.discount_max)
          : null,
    };

    if (prize) {
      update.mutate({ id: prize.id, ...payload }, { onSuccess: () => onOpenChange(false) });
    } else {
      create.mutate(payload, { onSuccess: () => onOpenChange(false) });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{prize ? "Editar Prêmio" : "Novo Prêmio"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div className="space-y-2">
            <Label>Nome *</Label>
            <Input {...register("name", { required: true })} placeholder="Ex: Sobremesa grátis" />
          </div>
          <div className="space-y-2">
            <Label>Descrição</Label>
            <Textarea {...register("description")} placeholder="Descrição do prêmio" rows={2} className="resize-none" />
          </div>

          <div className="space-y-2">
            <Label>O que o cliente ganha *</Label>
            <div className="grid grid-cols-2 gap-2">
              {([
                { v: "product" as const, icon: Package, titulo: "Um produto" },
                { v: "discount" as const, icon: Percent, titulo: "Desconto" },
              ]).map((opt) => {
                const ativo = kind === opt.v;
                const Icone = opt.icon;
                return (
                  <button
                    key={opt.v}
                    type="button"
                    onClick={() => setValue("kind", opt.v)}
                    className={cn(
                      "flex items-center justify-center gap-2 rounded-md border py-2 text-sm font-medium transition-colors",
                      ativo ? "border-primary bg-primary/5" : "hover:bg-muted/50",
                    )}
                  >
                    <Icone className="h-4 w-4" /> {opt.titulo}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              {kind === "discount"
                ? "Abate valor no carrinho do cliente."
                : "Entra no pedido como item a R$ 0,00."}
            </p>
          </div>

          {kind === "product" ? (
            <div className="space-y-2">
              <Label>Produto entregue no resgate</Label>
              <Button
                type="button"
                variant="outline"
                className="w-full justify-between font-normal"
                onClick={() => setProductOpen(true)}
              >
                <span className="truncate">
                  {selectedProduct
                    ? `${selectedProduct.name}${selectedProduct.base_price != null ? ` · ${formatBRL(Number(selectedProduct.base_price))}` : ""}`
                    : "Nenhum produto vinculado"}
                </span>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>

              {/* Diálogo empilhado. Um Popover aqui dentro não abre: o Radix
                  mantém o foco preso no diálogo do prêmio. */}
              <Dialog open={productOpen} onOpenChange={setProductOpen}>
                <DialogContent className="p-0 sm:max-w-md">
                  <DialogHeader className="px-4 pt-4">
                    <DialogTitle>Escolher produto</DialogTitle>
                  </DialogHeader>
                  <Command>
                    <CommandInput placeholder="Buscar produto..." className="h-10" />
                    <CommandList className="max-h-[50vh]">
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
                </DialogContent>
              </Dialog>
              <p className="text-xs text-muted-foreground">
                Sem vínculo, alguém precisa honrar o resgate na mão.
              </p>
            </div>
          ) : (
            <div className="rounded-md border p-3 space-y-2">
              <div className={cn("grid gap-3", discountType === "percentage" ? "grid-cols-3" : "grid-cols-2")}>
                <div className="space-y-1.5">
                  <Label>Tipo *</Label>
                  <Select
                    value={discountType}
                    onValueChange={(v) => setValue("discount_type", v as PrizeDiscountType)}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fixed">Valor fixo (R$)</SelectItem>
                      <SelectItem value="percentage">Percentual (%)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>{discountType === "percentage" ? "Percentual *" : "Valor (R$) *"}</Label>
                  <Input
                    inputMode="decimal"
                    placeholder={discountType === "percentage" ? "10" : "20,00"}
                    {...register("discount_value")}
                  />
                </div>
                {discountType === "percentage" && (
                  <div className="space-y-1.5">
                    <Label>Teto (R$)</Label>
                    {/* Sem teto, 10% num pedido de R$ 800 vira R$ 80. */}
                    <Input inputMode="decimal" placeholder="Sem teto" {...register("discount_max")} />
                  </div>
                )}
              </div>
              {previa != null && previa > 0 && (
                <p className="text-xs text-muted-foreground">
                  Num pedido de {formatBRL(100)}, abate{" "}
                  <span className="font-medium text-foreground">{formatBRL(previa)}</span>.
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Pontos *</Label>
              <Input type="number" min="1" {...register("points_cost", { valueAsNumber: true, required: true })} />
            </div>
            <div className="space-y-1.5">
              <Label>Pedido mín. (R$)</Label>
              <Input inputMode="decimal" placeholder="Sem mínimo" {...register("min_order_value")} />
            </div>
            <div className="space-y-1.5">
              <Label>Qtd. máxima</Label>
              <Input type="number" min="1" {...register("max_quantity")} placeholder="Ilimitado" />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <Label className="cursor-pointer">Ativo</Label>
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
