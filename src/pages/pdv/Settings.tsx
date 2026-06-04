import { usePDVSettings } from "@/hooks/use-pdv-settings";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Settings as SettingsIcon } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GeneralTab } from "@/components/pdv/settings/GeneralTab";
import { VisualTab } from "@/components/pdv/settings/VisualTab";
import { FinancialTab } from "@/components/pdv/settings/FinancialTab";
import { OrdersTab } from "@/components/pdv/settings/OrdersTab";
import { NotificationsTab } from "@/components/pdv/settings/NotificationsTab";
import { IntegrationsTab } from "@/components/pdv/settings/IntegrationsTab";
import { PermissionsTab } from "@/components/pdv/settings/PermissionsTab";
import { FiscalTab } from "@/components/pdv/settings/FiscalTab";

export default function PDVSettings() {
  const { settings, isLoading, updateSettings, isUpdating } = usePDVSettings();

  const handleSubmit = (values: any) => {
    updateSettings(values);
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <Skeleton className="h-9 w-48" />
        <div className="space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <Skeleton className="h-[200px] w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <SettingsIcon className="h-8 w-8" />
          Configurações do PDV
        </h1>
        <p className="text-muted-foreground">
          Gerencie as configurações do seu ponto de venda
        </p>
      </div>

      <Tabs defaultValue="general" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 lg:grid-cols-8">
          <TabsTrigger value="general">Geral</TabsTrigger>
          <TabsTrigger value="visual">Visual</TabsTrigger>
          <TabsTrigger value="financial">Financeiro</TabsTrigger>
          <TabsTrigger value="orders">Pedidos</TabsTrigger>
          <TabsTrigger value="notifications">Notificações</TabsTrigger>
          <TabsTrigger value="fiscal">Fiscal</TabsTrigger>
          <TabsTrigger value="integrations">Integrações</TabsTrigger>
          <TabsTrigger value="permissions">Permissões</TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <GeneralTab
            defaultValues={settings || {}}
            onSave={handleSubmit}
            isSubmitting={isUpdating}
          />
        </TabsContent>

        <TabsContent value="visual">
          <VisualTab />
        </TabsContent>

        <TabsContent value="financial">
          <FinancialTab
            defaultValues={settings || {}}
            onSave={handleSubmit}
            isSubmitting={isUpdating}
          />
        </TabsContent>

        <TabsContent value="orders">
          <OrdersTab
            defaultValues={settings || {}}
            onSave={handleSubmit}
            isSubmitting={isUpdating}
          />
        </TabsContent>

        <TabsContent value="notifications">
          <NotificationsTab
            defaultValues={settings || {}}
            onSave={handleSubmit}
            isSubmitting={isUpdating}
          />
        </TabsContent>

        <TabsContent value="integrations">
          <IntegrationsTab />
        </TabsContent>

        <TabsContent value="permissions">
          <PermissionsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
