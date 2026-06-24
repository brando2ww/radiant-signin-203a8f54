import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bell } from "lucide-react";
import { SettingsSaveBar } from "./SettingsSaveBar";

const notificationsSchema = z.object({
  enable_sound_notifications: z.boolean().optional(),
  new_order_sound: z.string().optional(),
  order_ready_sound: z.string().optional(),
  enable_desktop_notifications: z.boolean().optional(),
});

type NotificationsFormValues = z.infer<typeof notificationsSchema>;

interface NotificationsTabProps {
  defaultValues?: Partial<NotificationsFormValues>;
  onSave: (values: Partial<NotificationsFormValues>) => void;
  isSubmitting?: boolean;
}

const soundOptions = [
  { value: "default", label: "Padrão" },
  { value: "beep", label: "Bip" },
  { value: "chime", label: "Sino" },
  { value: "ding", label: "Ding" },
  { value: "none", label: "Sem som" },
];

export function NotificationsTab({ defaultValues, onSave, isSubmitting }: NotificationsTabProps) {
  const form = useForm<NotificationsFormValues>({
    resolver: zodResolver(notificationsSchema),
    defaultValues: {
      enable_sound_notifications: true,
      new_order_sound: "default",
      order_ready_sound: "default",
      enable_desktop_notifications: true,
      ...defaultValues,
    },
  });

  const soundEnabled = form.watch("enable_sound_notifications");

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSave)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Notificações e Alertas
            </CardTitle>
            <CardDescription>
              Configure como você deseja ser notificado sobre eventos importantes
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="enable_sound_notifications"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel>Notificações Sonoras</FormLabel>
                    <FormDescription>
                      Tocar som quando eventos importantes acontecerem
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />

            {soundEnabled && (
              <>
                <FormField
                  control={form.control}
                  name="new_order_sound"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Som para Novo Pedido</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione um som" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {soundOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Som tocado quando um novo pedido chegar
                      </FormDescription>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="order_ready_sound"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Som para Pedido Pronto</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione um som" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {soundOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Som tocado quando um pedido estiver pronto
                      </FormDescription>
                    </FormItem>
                  )}
                />
              </>
            )}

            <FormField
              control={form.control}
              name="enable_desktop_notifications"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel>Notificações da Área de Trabalho</FormLabel>
                    <FormDescription>
                      Mostrar notificações do navegador para eventos importantes
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
