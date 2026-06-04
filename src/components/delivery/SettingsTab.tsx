import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Clock, Truck, CreditCard, Bell, Smartphone, TrendingUp, FileText } from "lucide-react";
import { BusinessHoursSettings } from "./settings/BusinessHoursSettings";
import { DeliverySettings } from "./settings/DeliverySettings";
import { PaymentSettings } from "./settings/PaymentSettings";
import { NotificationPreferences } from "./settings/NotificationPreferences";
import { PublicMenuLink } from "./settings/PublicMenuLink";
import { AppInstallGuide } from "./settings/AppInstallGuide";
import { MarketingSettings } from "./settings/MarketingSettings";
import { DeliveryFiscalSettings } from "./settings/DeliveryFiscalSettings";
import { useState } from "react";

export const SettingsTab = () => {
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [whatsappEnabled, setWhatsappEnabled] = useState(true);

  return (
    <div className="space-y-6">

      <Tabs defaultValue="hours" className="w-full">
        <TabsList className="grid w-full max-w-4xl grid-cols-7">
          <TabsTrigger value="hours" className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            <span className="hidden sm:inline">Horários</span>
          </TabsTrigger>
          <TabsTrigger value="delivery" className="flex items-center gap-2">
            <Truck className="h-4 w-4" />
            <span className="hidden sm:inline">Entrega</span>
          </TabsTrigger>
          <TabsTrigger value="payment" className="flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            <span className="hidden sm:inline">Pagamento</span>
          </TabsTrigger>
          <TabsTrigger value="notifications" className="flex items-center gap-2">
            <Bell className="h-4 w-4" />
            <span className="hidden sm:inline">Notificações</span>
          </TabsTrigger>
          <TabsTrigger value="app" className="flex items-center gap-2">
            <Smartphone className="h-4 w-4" />
            <span className="hidden sm:inline">App Mobile</span>
          </TabsTrigger>
          <TabsTrigger value="marketing" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            <span className="hidden sm:inline">Marketing</span>
          </TabsTrigger>
          <TabsTrigger value="fiscal" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Fiscal</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="hours" className="mt-6">
          <BusinessHoursSettings />
        </TabsContent>

        <TabsContent value="delivery" className="mt-6">
          <DeliverySettings />
        </TabsContent>

        <TabsContent value="payment" className="mt-6">
          <PaymentSettings />
        </TabsContent>

        <TabsContent value="notifications" className="mt-6">
          <NotificationPreferences
            soundEnabled={soundEnabled}
            onSoundToggle={setSoundEnabled}
            emailEnabled={emailEnabled}
            onEmailToggle={setEmailEnabled}
            whatsappEnabled={whatsappEnabled}
            onWhatsappToggle={setWhatsappEnabled}
          />
        </TabsContent>

        <TabsContent value="app" className="mt-6">
          <Tabs defaultValue="link" className="w-full">
            <TabsList>
              <TabsTrigger value="link">Link Público</TabsTrigger>
              <TabsTrigger value="install">Instalação App</TabsTrigger>
            </TabsList>
            <TabsContent value="link" className="mt-6">
              <PublicMenuLink />
            </TabsContent>
            <TabsContent value="install" className="mt-6">
              <AppInstallGuide />
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="marketing" className="mt-6">
          <MarketingSettings />
        </TabsContent>

        <TabsContent value="fiscal" className="mt-6">
          <DeliveryFiscalSettings />
        </TabsContent>
      </Tabs>
    </div>
  );
};
