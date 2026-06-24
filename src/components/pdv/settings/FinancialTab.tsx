import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Switch } from "@/components/ui/switch";
import { DollarSign, CreditCard } from "lucide-react";
import { SettingsSaveBar } from "./SettingsSaveBar";
import { PaymentMethodFeesManager } from "./PaymentMethodFeesManager";

const financialSchema = z.object({
  enable_service_fee: z.boolean().optional(),
  service_fee_percentage: z.number().min(0).max(100).optional(),
  delivery_fee: z.number().min(0).optional(),
  enable_multiple_payments: z.boolean().optional(),
  accepted_payment_methods: z.any().optional(),
});

type FinancialFormValues = z.infer<typeof financialSchema>;

interface FinancialTabProps {
  defaultValues?: Partial<FinancialFormValues>;
  onSave: (values: Partial<FinancialFormValues>) => void;
  isSubmitting?: boolean;
}


export function FinancialTab({ defaultValues, onSave, isSubmitting }: FinancialTabProps) {
  const form = useForm<FinancialFormValues>({
    resolver: zodResolver(financialSchema),
    defaultValues: {
      enable_service_fee: false,
      service_fee_percentage: 10,
      delivery_fee: 0,
      enable_multiple_payments: true,
      accepted_payment_methods: [
        { method: "cash", enabled: true, fee_percentage: 0 },
        { method: "credit", enabled: true, fee_percentage: 0 },
        { method: "debit", enabled: true, fee_percentage: 0 },
        { method: "pix", enabled: true, fee_percentage: 0 },
      ],
      ...defaultValues,
    },
  });

  const enableServiceFee = form.watch("enable_service_fee");

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSave)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Taxas e Valores
            </CardTitle>
            <CardDescription>
              Configure as taxas aplicadas nos pedidos
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="enable_service_fee"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel>Taxa de Serviço</FormLabel>
                    <FormDescription>
                      Adicionar taxa de serviço automaticamente nos pedidos
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />

            {enableServiceFee && (
              <FormField
                control={form.control}
                name="service_fee_percentage"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Percentual da Taxa de Serviço</FormLabel>
                    <FormControl>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          {...field}
                          onChange={(e) => field.onChange(parseFloat(e.target.value))}
                        />
                        <span className="text-muted-foreground">%</span>
                      </div>
                    </FormControl>
                    <FormDescription>
                      Percentual aplicado sobre o subtotal do pedido
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="delivery_fee"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Taxa de Entrega Padrão</FormLabel>
                  <FormControl>
                    <CurrencyInput
                      value={field.value || ''}
                      onChange={(v) => field.onChange(v ? parseFloat(v) : 0)}
                    />
                  </FormControl>
                  <FormDescription>
                    Valor cobrado para entregas (pode ser personalizado por pedido)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Formas de Pagamento
            </CardTitle>
            <CardDescription>
              Gerencie os métodos de pagamento aceitos
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="enable_multiple_payments"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel>Permitir Múltiplas Formas de Pagamento</FormLabel>
                    <FormDescription>
                      Cliente pode pagar com mais de uma forma de pagamento
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />

          </CardContent>
        </Card>

        <PaymentMethodFeesManager />

        <SettingsSaveBar
          isDirty={form.formState.isDirty}
          isSubmitting={isSubmitting ?? false}
          onCancel={() => form.reset()}
        />
      </form>
    </Form>
  );
}
