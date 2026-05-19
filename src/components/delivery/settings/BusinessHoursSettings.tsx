import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { useDeliverySettings, useCreateOrUpdateSettings } from "@/hooks/use-delivery-settings";
import { Loader2 } from "lucide-react";
import { BusinessHoursEditor } from "@/components/shared/BusinessHoursEditor";
import {
  BusinessHoursNormalized,
  normalizeBusinessHours,
  serializeBusinessHours,
} from "@/lib/business-hours";

export const BusinessHoursSettings = () => {
  const { data: settings } = useDeliverySettings();
  const updateSettings = useCreateOrUpdateSettings();
  const [hours, setHours] = useState<BusinessHoursNormalized>(() => normalizeBusinessHours(null));
  const [hasErrors, setHasErrors] = useState(false);

  useEffect(() => {
    if (settings?.business_hours) {
      setHours(normalizeBusinessHours(settings.business_hours));
    }
  }, [settings]);

  const handleSave = () => {
    if (hasErrors) return;
    updateSettings.mutate({ business_hours: serializeBusinessHours(hours) as any });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Horário de Funcionamento</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <BusinessHoursEditor value={hours} onChange={setHours} onValidityChange={setHasErrors} />

        <div className="flex justify-end pt-4">
          <Button onClick={handleSave} disabled={updateSettings.isPending || hasErrors}>
            {updateSettings.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Salvar Horários
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
