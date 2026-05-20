import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Percent, DollarSign, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import {
  DeliveryCoupon,
  useCreateCoupon,
  useUpdateCoupon,
} from "@/hooks/use-delivery-coupons";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishmentId } from "@/hooks/use-establishment-id";
import { cn } from "@/lib/utils";
import { z } from "zod";
import { toast } from "sonner";
import { formatBRL } from "@/lib/format";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  coupon?: DeliveryCoupon | null;
}

const schema = z
  .object({
    code: z
      .string()
      .trim()
      .min(3, "Mínimo 3 caracteres")
      .max(20, "Máximo 20 caracteres")
      .regex(/^[A-Z0-9]+$/, "Use apenas letras e números"),
    type: z.enum(["percentage", "fixed"]),
    value: z.number().positive("Informe um valor maior que zero"),
    min_order_value: z.number().min(0),
    max_discount: z.number().nullable(),
    usage_limit: z.number().int().min(1, "Mínimo 1"),
    per_customer_limit: z.number().int().min(0),
    first_order_only: z.boolean(),
    valid_from: z.string().min(1),
    valid_until: z.string().min(1),
    internal_notes: z.string().max(500).nullable(),
  })
  .refine((d) => new Date(d.valid_from) <= new Date(d.valid_until), {
    message: "Validade final deve ser depois do início",
    path: ["valid_until"],
  })
  .refine((d) => d.type !== "percentage" || d.value <= 100, {
    message: "Percentual deve ser até 100%",
    path: ["value"],
  });

function genCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 8 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join("");
}

export function CouponSheet({ open, onOpenChange, coupon }: Props) {
  const { visibleUserId } = useEstablishmentId();
  const createCoupon = useCreateCoupon();
  const updateCoupon = useUpdateCoupon();

  const [code, setCode] = useState("");
  const [type, setType] = useState<"percentage" | "fixed">("percentage");
  const [value, setValue] = useState("");
  const [minOrderValue, setMinOrderValue] = useState("0");
  const [maxDiscount, setMaxDiscount] = useState("");
  const [usageLimit, setUsageLimit] = useState("100");
  const [perCustomerLimit, setPerCustomerLimit] = useState("0");
  const [firstOrderOnly, setFirstOrderOnly] = useState(false);
  const [validFrom, setValidFrom] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [codeExists, setCodeExists] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    if (coupon) {
      setCode(coupon.code);
      setType(coupon.type);
      setValue(coupon.value.toString());
      setMinOrderValue(coupon.min_order_value.toString());
      setMaxDiscount(coupon.max_discount?.toString() || "");
      setUsageLimit(coupon.usage_limit.toString());
      setPerCustomerLimit((coupon.per_customer_limit ?? 0).toString());
      setFirstOrderOnly(!!coupon.first_order_only);
      setValidFrom(coupon.valid_from.split("T")[0]);
      setValidUntil(coupon.valid_until.split("T")[0]);
      setInternalNotes(coupon.internal_notes ?? "");
    } else {
      setCode("");
      setType("percentage");
      setValue("");
      setMinOrderValue("0");
      setMaxDiscount("");
      setUsageLimit("100");
      setPerCustomerLimit("0");
      setFirstOrderOnly(false);
      const today = new Date().toISOString().split("T")[0];
      setValidFrom(today);
      const next = new Date();
      next.setMonth(next.getMonth() + 1);
      setValidUntil(next.toISOString().split("T")[0]);
      setInternalNotes("");
    }
    setErrors({});
    setCodeExists(false);
  }, [open, coupon]);

  // Debounced duplicate check
  useEffect(() => {
    if (!open || !code || !visibleUserId) {
      setCodeExists(false);
      return;
    }
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("delivery_coupons")
        .select("id")
        .eq("user_id", visibleUserId)
        .eq("code", code.toUpperCase())
        .maybeSingle();
      if (data && data.id !== coupon?.id) setCodeExists(true);
      else setCodeExists(false);
    }, 400);
    return () => clearTimeout(t);
  }, [code, visibleUserId, coupon?.id, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (codeExists) {
      toast.error("Já existe um cupom com este código");
      return;
    }
    const payload = {
      code: code.toUpperCase(),
      type,
      value: Number(value),
      min_order_value: Number(minOrderValue || 0),
      max_discount: maxDiscount ? Number(maxDiscount) : null,
      usage_limit: Number(usageLimit),
      per_customer_limit: Number(perCustomerLimit || 0),
      first_order_only: firstOrderOnly,
      valid_from: new Date(validFrom).toISOString(),
      valid_until: new Date(validUntil + "T23:59:59").toISOString(),
      internal_notes: internalNotes.trim() || null,
      is_active: coupon?.is_active ?? true,
    };

    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      parsed.error.issues.forEach((i) => {
        errs[i.path.join(".")] = i.message;
      });
      setErrors(errs);
      return;
    }
    setErrors({});

    if (coupon) {
      updateCoupon.mutate(
        { id: coupon.id, updates: payload },
        { onSuccess: () => onOpenChange(false) }
      );
    } else {
      createCoupon.mutate(payload, {
        onSuccess: () => onOpenChange(false),
      });
    }
  };

  const previewValue =
    type === "percentage"
      ? `${value || 0}% OFF`
      : `${formatBRL(Number(value || 0))} OFF`;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto p-0">
        <form onSubmit={handleSubmit} className="flex flex-col h-full">
          <SheetHeader className="p-6 border-b">
            <SheetTitle>{coupon ? "Editar cupom" : "Novo cupom"}</SheetTitle>
            <SheetDescription>
              Configure as regras do cupom promocional
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 p-6 space-y-5">
            {/* Code */}
            <div className="space-y-2">
              <Label>Código do cupom *</Label>
              <div className="flex gap-2">
                <Input
                  value={code}
                  onChange={(e) =>
                    setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))
                  }
                  placeholder="Ex: PRIMEIRACOMPRA"
                  maxLength={20}
                  className="font-mono"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCode(genCode())}
                >
                  <Sparkles className="w-4 h-4 mr-2" /> Gerar
                </Button>
              </div>
              {codeExists && (
                <p className="text-xs text-destructive">
                  Já existe um cupom com este código
                </p>
              )}
              {errors.code && (
                <p className="text-xs text-destructive">{errors.code}</p>
              )}
            </div>

            {/* Type */}
            <div className="space-y-2">
              <Label>Tipo de desconto *</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setType("percentage")}
                  className={cn(
                    "p-4 border rounded-md flex flex-col items-center gap-2 transition-colors",
                    type === "percentage"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted"
                  )}
                >
                  <Percent className="w-5 h-5" />
                  <span className="text-sm font-medium">Percentual</span>
                  <span className="text-xs text-muted-foreground">Ex: 10%</span>
                </button>
                <button
                  type="button"
                  onClick={() => setType("fixed")}
                  className={cn(
                    "p-4 border rounded-md flex flex-col items-center gap-2 transition-colors",
                    type === "fixed"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted"
                  )}
                >
                  <DollarSign className="w-5 h-5" />
                  <span className="text-sm font-medium">Valor fixo</span>
                  <span className="text-xs text-muted-foreground">Ex: R$ 10,00</span>
                </button>
              </div>
            </div>

            {/* Value */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Valor do desconto *{type === "percentage" ? " (%)" : ""}</Label>
                {type === "fixed" ? (
                  <CurrencyInput value={value} onChange={setValue} />
                ) : (
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step="1"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                  />
                )}
                {errors.value && (
                  <p className="text-xs text-destructive">{errors.value}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Pedido mínimo</Label>
                <CurrencyInput value={minOrderValue} onChange={setMinOrderValue} />
              </div>
            </div>

            {type === "percentage" && (
              <div className="space-y-2">
                <Label>Desconto máximo (R$)</Label>
                <CurrencyInput value={maxDiscount} onChange={setMaxDiscount} />
                <p className="text-xs text-muted-foreground">
                  Limite o valor máximo do desconto aplicado
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Limite total de uso *</Label>
                <Input
                  type="number"
                  min={1}
                  value={usageLimit}
                  onChange={(e) => setUsageLimit(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Limite por cliente</Label>
                <Input
                  type="number"
                  min={0}
                  value={perCustomerLimit}
                  onChange={(e) => setPerCustomerLimit(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">0 = ilimitado</p>
              </div>
            </div>

            <div className="flex items-center justify-between border rounded-md p-3">
              <div>
                <Label className="cursor-pointer">Válido apenas na primeira compra</Label>
                <p className="text-xs text-muted-foreground">
                  O cupom só pode ser usado em pedidos de clientes novos
                </p>
              </div>
              <Switch checked={firstOrderOnly} onCheckedChange={setFirstOrderOnly} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Válido a partir de *</Label>
                <Input
                  type="date"
                  value={validFrom}
                  onChange={(e) => setValidFrom(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Válido até *</Label>
                <Input
                  type="date"
                  value={validUntil}
                  onChange={(e) => setValidUntil(e.target.value)}
                />
                {errors.valid_until && (
                  <p className="text-xs text-destructive">{errors.valid_until}</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Descrição interna</Label>
              <Textarea
                value={internalNotes}
                onChange={(e) => setInternalNotes(e.target.value)}
                placeholder="Anotação para sua equipe. Não aparece para o cliente."
                rows={3}
                maxLength={500}
              />
            </div>

            {/* Preview */}
            <div className="border rounded-md p-4 bg-muted/40">
              <div className="text-xs text-muted-foreground mb-1">Pré-visualização</div>
              <div className="flex items-center justify-between">
                <span className="font-mono font-bold text-lg">
                  {code || "CODIGO"}
                </span>
                <span className="text-lg font-semibold text-primary">
                  {previewValue}
                </span>
              </div>
              {Number(minOrderValue) > 0 && (
                <div className="text-xs text-muted-foreground mt-1">
                  Pedido mínimo: {formatBRL(Number(minOrderValue))}
                </div>
              )}
            </div>
          </div>

          <SheetFooter className="p-6 border-t flex-row justify-between gap-2 sm:justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={createCoupon.isPending || updateCoupon.isPending || codeExists}
            >
              {coupon ? "Salvar alterações" : "Criar cupom"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
