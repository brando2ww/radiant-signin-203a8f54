import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Switch } from "@/components/ui/switch";
import { DollarSign, CreditCard, Gift } from "lucide-react";
import { SettingsSaveBar } from "./SettingsSaveBar";
import { PaymentMethodFeesManager } from "./PaymentMethodFeesManager";

const financialSchema = z.object({
  enable_service_fee: z.boolean().optional(),
  service_fee_percentage: z.number().min(0).max(100).optional(),
  delivery_fee: z.number().min(0).optional(),
  enable_multiple_payments: z.boolean().optional(),
  accepted_payment_methods: z.any().optional(),
  cashback_ativo: z.boolean().optional(),
  cashback_percentual: z.number().gt(0, "Informe o percentual").max(100).optional(),
  cashback_validade_dias: z.number().int().min(1, "Mínimo 1 dia").max(365, "Máximo 365 dias").optional(),
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
      cashback_ativo: false,
      cashback_percentual: 10,
      cashback_validade_dias: 30,
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
  const cashbackAtivo = form.watch("cashback_ativo");

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

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gift className="h-5 w-5" />
              Cashback no salão
            </CardTitle>
            <CardDescription>
              Quem abre a mesa com telefone ganha um percentual do consumo de volta para usar na próxima visita. Mesa
              só com nome não gera cashback. O valor é calculado sobre o consumo, sem a taxa de serviço.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="cashback_ativo"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel>Ativar cashback</FormLabel>
                    <FormDescription>
                      No caixa, quem cobra vê o saldo do cliente e ele escolhe se usa ou não.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={!!field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />

            {cashbackAtivo && (
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="cashback_percentual"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Percentual de cashback</FormLabel>
                      <FormControl>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min="0.5"
                            max="100"
                            step="0.5"
                            {...field}
                            onChange={(e) => field.onChange(parseFloat(e.target.value))}
                          />
                          <span className="text-muted-foreground">%</span>
                        </div>
                      </FormControl>
                      <FormDescription>Ex.: 10% de uma conta de R$ 200 = R$ 20 de cashback.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="cashback_validade_dias"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Validade</FormLabel>
                      <FormControl>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min="1"
                            max="365"
                            step="1"
                            {...field}
                            onChange={(e) => field.onChange(parseInt(e.target.value, 10))}
                          />
                          <span className="text-muted-foreground">dias</span>
                        </div>
                      </FormControl>
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {[30, 40, 50, 60].map((d) => (
                          <button
                            key={d}
                            type="button"
                            onClick={() => form.setValue("cashback_validade_dias", d, { shouldDirty: true })}
                            className="rounded-full border px-2.5 py-0.5 text-xs hover:bg-muted"
                          >
                            {d} dias
                          </button>
                        ))}
                      </div>
                      <FormDescription>Contados a partir do dia em que a conta foi paga.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}
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
