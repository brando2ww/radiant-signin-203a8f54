import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Loader2, MapPin, Settings2, Route } from "lucide-react";
import { useState, useEffect } from "react";
import {
  useDeliverySettings,
  useCreateOrUpdateSettings,
  DeliveryZone,
  CoveredCity,
  ExcludedCEP as ExcludedCEPType,
  CepRange,
} from "@/hooks/use-delivery-settings";
import { useIBGEStates, useIBGECities } from "@/hooks/use-ibge-lookup";
import { CurrencyInput } from "@/components/ui/currency-input";
import { CEPInput } from "@/components/ui/cep-input";
import { ExcludedZones, ExcludedCEP } from "./ExcludedZones";
import { NeighborhoodCombobox } from "./NeighborhoodCombobox";
import { NeighborhoodSelectorModal } from "./NeighborhoodSelectorModal";
import { formatBRL } from "@/lib/format";
import { normalizeCEP } from "@/lib/delivery-coverage";
import { toast } from "sonner";

export const DeliverySettings = () => {
  const { data: settings } = useDeliverySettings();
  const updateSettings = useCreateOrUpdateSettings();
  const states = useIBGEStates();

  const [minOrderValue, setMinOrderValue] = useState("30");
  const [defaultDeliveryFee, setDefaultDeliveryFee] = useState("5");
  const [estimatedTime, setEstimatedTime] = useState("45");
  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [newZoneNeighborhood, setNewZoneNeighborhood] = useState("");
  const [newZoneFee, setNewZoneFee] = useState("");

  const [selectedUF, setSelectedUF] = useState("");
  const [selectedCity, setSelectedCity] = useState("");
  const [selectedCityCode, setSelectedCityCode] = useState<number | undefined>();
  const [coveredCity, setCoveredCity] = useState<CoveredCity | null>(null);
  const [excludedCeps, setExcludedCeps] = useState<ExcludedCEP[]>([]);
  const [cepRanges, setCepRanges] = useState<CepRange[]>([]);
  const [newRangeStart, setNewRangeStart] = useState("");
  const [newRangeEnd, setNewRangeEnd] = useState("");
  const [newRangeFee, setNewRangeFee] = useState("");
  const [newRangeLabel, setNewRangeLabel] = useState("");
  const [neighborhoodModalOpen, setNeighborhoodModalOpen] = useState(false);

  const { cities, isLoading: isLoadingCities } = useIBGECities(selectedUF);

  useEffect(() => {
    if (settings) {
      setMinOrderValue(settings.min_order_value?.toString() || "30");
      setDefaultDeliveryFee(settings.default_delivery_fee?.toString() || "5");
      setEstimatedTime(settings.estimated_preparation_time?.toString() || "45");
      setZones(settings.delivery_zones || []);
      setCoveredCity(settings.covered_city || null);
      setExcludedCeps((settings.excluded_ceps as ExcludedCEP[]) || []);
      setCepRanges((settings.cep_ranges as CepRange[]) || []);
      if (settings.covered_city) {
        setSelectedUF(settings.covered_city.uf);
        setSelectedCity(settings.covered_city.city);
        setSelectedCityCode(settings.covered_city.ibge_code);
      }
    }
  }, [settings]);

  const handleSelectUF = (uf: string) => {
    setSelectedUF(uf);
    setSelectedCity("");
    setSelectedCityCode(undefined);
  };

  const handleSelectCity = (cityName: string) => {
    setSelectedCity(cityName);
    const city = cities.find((c) => c.nome === cityName);
    setSelectedCityCode(city?.id);
    setCoveredCity({ uf: selectedUF, city: cityName, ibge_code: city?.id });
    setTimeout(() => setNeighborhoodModalOpen(true), 0);
  };

  const handleNeighborhoodConfirm = (selected: string[]) => {
    const fee = Number(defaultDeliveryFee) || 5;
    const existingMap = new Map(zones.map((z) => [z.neighborhood, z.fee]));
    const newZones = selected.map((name) => ({
      neighborhood: name,
      fee: existingMap.get(name) ?? fee,
    }));
    setZones(newZones);
  };

  const handleRemoveCity = () => {
    setCoveredCity(null);
    setSelectedUF("");
    setSelectedCity("");
    setSelectedCityCode(undefined);
  };

  const handleAddZone = () => {
    if (newZoneNeighborhood && newZoneFee) {
      setZones([
        ...zones,
        { neighborhood: newZoneNeighborhood, fee: Number(newZoneFee) },
      ]);
      setNewZoneNeighborhood("");
      setNewZoneFee("");
    }
  };

  const handleRemoveZone = (index: number) => {
    const updatedZones = zones.filter((_, i) => i !== index);
    setZones(updatedZones);
    updateSettings.mutate({ delivery_zones: updatedZones as any });
  };

  const handleSave = () => {
    updateSettings.mutate({
      min_order_value: Number(minOrderValue),
      default_delivery_fee: Number(defaultDeliveryFee),
      estimated_preparation_time: Number(estimatedTime),
      delivery_zones: zones as any,
      covered_city: coveredCity as any,
      excluded_ceps: excludedCeps as any,
    });
  };

  return (
    <div className="space-y-6">
      {/* Card 1 — Configurações Gerais */}
      <Card>
        <CardHeader>
          <CardTitle>Configurações Gerais</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="minOrderValue">Pedido Mínimo</Label>
              <CurrencyInput
                id="minOrderValue"
                value={minOrderValue}
                onChange={setMinOrderValue}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="defaultDeliveryFee">Taxa Padrão</Label>
              <CurrencyInput
                id="defaultDeliveryFee"
                value={defaultDeliveryFee}
                onChange={setDefaultDeliveryFee}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="estimatedTime">Tempo de Preparo (min)</Label>
              <Input
                id="estimatedTime"
                type="number"
                min="1"
                value={estimatedTime}
                onChange={(e) => setEstimatedTime(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Card 2 — Área de Cobertura */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Área de Cobertura
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* City selector */}
          {!coveredCity ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Estado (UF)</Label>
                <Select value={selectedUF} onValueChange={handleSelectUF}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o estado" />
                  </SelectTrigger>
                  <SelectContent>
                    {states.map((s) => (
                      <SelectItem key={s.sigla} value={s.sigla}>
                        {s.sigla} — {s.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Cidade</Label>
                <Select
                  value={selectedCity}
                  onValueChange={handleSelectCity}
                  disabled={!selectedUF || isLoadingCities}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        isLoadingCities ? "Carregando..." : "Selecione a cidade"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {cities.map((c) => (
                      <SelectItem key={c.id} value={c.nome}>
                        {c.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="secondary" className="text-sm py-1 px-3">
                📍 {coveredCity.city}/{coveredCity.uf}
              </Badge>
              <Button size="sm" variant="outline" onClick={() => setNeighborhoodModalOpen(true)}>
                <Settings2 className="h-4 w-4 mr-1" />
                Gerenciar bairros
              </Button>
              <Button size="sm" variant="ghost" onClick={handleRemoveCity}>
                Alterar cidade
              </Button>
            </div>
          )}

          {/* Neighborhoods with fees */}
          <div className="space-y-3">
            <Label>Bairros atendidos com taxa de entrega</Label>
            {zones.length > 0 && (
              <div className="space-y-2">
                {zones.map((zone, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 border rounded-md"
                  >
                    <div>
                      <p className="font-medium">{zone.neighborhood}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatBRL(Number(zone.fee))}
                      </p>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => handleRemoveZone(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <NeighborhoodCombobox
                value={newZoneNeighborhood}
                onChange={setNewZoneNeighborhood}
                uf={coveredCity?.uf || selectedUF}
                city={coveredCity?.city || selectedCity}
                className="flex-1"
              />
              <CurrencyInput
                value={newZoneFee}
                onChange={setNewZoneFee}
                className="w-32"
              />
              <Button
                onClick={handleAddZone}
                disabled={!newZoneNeighborhood || !newZoneFee}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Configure taxas de entrega específicas por bairro
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Card 3 — Exclusões */}
      <ExcludedZones
        excludedCeps={excludedCeps}
        onUpdate={setExcludedCeps}
        coveredUF={coveredCity?.uf || selectedUF}
        coveredCity={coveredCity?.city || selectedCity}
      />

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={updateSettings.isPending}>
          {updateSettings.isPending && (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          )}
          Salvar Configurações
        </Button>
      </div>

      <NeighborhoodSelectorModal
        open={neighborhoodModalOpen}
        onOpenChange={setNeighborhoodModalOpen}
        uf={coveredCity?.uf || selectedUF}
        city={coveredCity?.city || selectedCity}
        existingNeighborhoods={zones.map((z) => z.neighborhood)}
        onConfirm={handleNeighborhoodConfirm}
      />
    </div>
  );
};
