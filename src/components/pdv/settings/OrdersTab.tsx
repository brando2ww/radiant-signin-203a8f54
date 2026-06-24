import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Switch } from "@/components/ui/switch";
import { ShoppingBag } from "lucide-react";
import { SettingsSaveBar } from "./SettingsSaveBar";

const ordersSchema = z.object({
  default_preparation_time: z.number().min(1).optional(),
  accept_tips: z.boolean().optional(),
  min_order_value: z.number().min(0).optional(),
  max_tables_per_order: z.number().min(1).optional(),
  auto_print_to_kitchen: z.boolean().optional(),
  require_customer_identification: z.boolean().optional(),
});

type OrdersFormValues = z.infer<typeof ordersSchema>;

interface OrdersTabProps {
  defaultValues?: Partial<OrdersFormValues>;
  onSave: (values: Partial<OrdersFormValues>) => void;
  isSubmitting?: boolean;
}

export function OrdersTab({ defaultValues, onSave, isSubmitting }: OrdersTabProps) {
  const form = useForm<OrdersFormValues>({
    resolver: zodResolver(ordersSchema),
    defaultValues: {
      default_preparation_time: 30,
      accept_tips: true,
      min_order_value: 0,
      max_tables_per_order: 10,
      auto_print_to_kitchen: false,
      require_customer_identification: false,
      ...defaultValues,
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSave)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShoppingBag className="h-5 w-5" />
              Configurações de Pedidos
            </CardTitle>
            <CardDescription>
              Defina as regras e comportamentos dos pedidos
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="default_preparation_time"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tempo Médio de Preparo (minutos)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="1"
                      {...field}
                      onChange={(e) => field.onChange(parseInt(e.target.value))}
                    />
                  </FormControl>
                  <FormDescription>
                    Tempo estimado para preparar os pedidos
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="min_order_value"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Valor Mínimo do Pedido</FormLabel>
                  <FormControl>
                    <CurrencyInput
                      value={field.value || ''}
                      onChange={(v) => field.onChange(v ? parseFloat(v) : 0)}
                    />
                  </FormControl>
                  <FormDescription>
                    Valor mínimo necessário para aceitar o pedido
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="max_tables_per_order"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Máximo de Mesas por Pedido</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="1"
                      {...field}
                      onChange={(e) => field.onChange(parseInt(e.target.value))}
                    />
                  </FormControl>
                  <FormDescription>
                    Quantidade máxima de mesas que podem ser unificadas em um pedido
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="accept_tips"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel>Aceitar Gorjetas</FormLabel>
                    <FormDescription>
                      Permitir que clientes adicionem gorjetas aos pedidos
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="auto_print_to_kitchen"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel>Impressão Automática na Cozinha</FormLabel>
                    <FormDescription>
                      Enviar automaticamente pedidos para a impressora da cozinha
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="require_customer_identification"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel>Exigir Identificação do Cliente</FormLabel>
                    <FormDescription>
                      Obrigar informações do cliente ao criar pedidos
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

        <SettingsSaveBar
          isDirty={form.formState.isDirty}
          isSubmitting={isSubmitting ?? false}
          onCancel={() => form.reset()}
        />
      </form>
    </Form>
  );
}
