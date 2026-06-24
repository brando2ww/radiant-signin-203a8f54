import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, Clock } from "lucide-react";
import { SettingsSaveBar } from "./SettingsSaveBar";
import { BusinessHoursEditor } from "@/components/shared/BusinessHoursEditor";
import { serializeBusinessHours } from "@/lib/business-hours";

const generalSchema = z.object({
  business_name: z.string().optional(),
  business_phone: z.string().optional(),
  business_address: z.string().optional(),
  business_cnpj: z.string().optional(),
  state_registration: z.string().optional(),
  tax_regime: z.string().optional(),
  business_hours: z.any().optional(),
});

type GeneralFormValues = z.infer<typeof generalSchema>;

interface GeneralTabProps {
  defaultValues?: Partial<GeneralFormValues>;
  onSave: (values: Partial<GeneralFormValues>) => void;
  isSubmitting?: boolean;
}

export function GeneralTab({ defaultValues, onSave, isSubmitting }: GeneralTabProps) {
  const form = useForm<GeneralFormValues>({
    resolver: zodResolver(generalSchema),
    defaultValues: {
      tax_regime: "simples_nacional",
      ...defaultValues,
    },
  });
  const [hoursHaveErrors, setHoursHaveErrors] = useState(false);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSave)} className="space-y-6">
        <Card id="section-dados" className="scroll-mt-24">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Dados do Estabelecimento
            </CardTitle>
            <CardDescription>
              Informações básicas sobre seu negócio
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="business_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome do Estabelecimento *</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex: Restaurante do João" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="business_phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Telefone</FormLabel>
                    <FormControl>
                      <Input placeholder="(11) 98765-4321" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="business_cnpj"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>CNPJ</FormLabel>
                    <FormControl>
                      <Input placeholder="00.000.000/0000-00" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="business_address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Endereço</FormLabel>
                  <FormControl>
                    <Input placeholder="Rua, número, bairro, cidade - UF" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="state_registration"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Inscrição Estadual</FormLabel>
                    <FormControl>
                      <Input placeholder="000.000.000.000" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="tax_regime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Regime Tributário</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="simples_nacional">Simples Nacional</SelectItem>
                        <SelectItem value="lucro_presumido">Lucro Presumido</SelectItem>
                        <SelectItem value="lucro_real">Lucro Real</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        <Card id="section-horarios" className="scroll-mt-24">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Horários de Funcionamento
            </CardTitle>
            <CardDescription>
              Configure os horários de abertura e fechamento. Você pode adicionar até 3 turnos por dia.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <BusinessHoursEditor
              value={form.watch("business_hours")}
              onChange={(next) =>
                form.setValue("business_hours", serializeBusinessHours(next) as any, { shouldDirty: true })
              }
              onValidityChange={setHoursHaveErrors}
            />
          </CardContent>
        </Card>

        <SettingsSaveBar
          isDirty={form.formState.isDirty}
          isSubmitting={isSubmitting || hoursHaveErrors}
          onCancel={() => form.reset()}
        />
      </form>
    </Form>
  );
}
