import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CEPInput } from "@/components/ui/cep-input";
import { Loader2, Plus, Search, Trash2, X, Ban } from "lucide-react";
import { useState } from "react";
import { useCEPLookup } from "@/hooks/use-cep-lookup";
import { searchStreetByName, ViaCEPStreetResult } from "@/hooks/use-ibge-lookup";
import { CepRangeSweepPanel } from "./CepRangeSweepPanel";
import type { SweepEntry } from "@/hooks/use-cep-range-sweep";

export interface ExcludedCEP {
  cep: string;
  street: string;
  neighborhood: string;
  reason?: string;
}

interface ExcludedZonesProps {
  excludedCeps: ExcludedCEP[];
  onUpdate: (ceps: ExcludedCEP[]) => void;
  coveredUF: string;
  coveredCity: string;
}

export const ExcludedZones = ({
  excludedCeps,
  onUpdate,
  coveredUF,
  coveredCity,
}: ExcludedZonesProps) => {
  const [cepValue, setCepValue] = useState("");
  const [cepResult, setCepResult] = useState<{
    cep: string;
    street: string;
    neighborhood: string;
  } | null>(null);
  const [reason, setReason] = useState("");

  const [streetSearch, setStreetSearch] = useState("");
  const [streetResults, setStreetResults] = useState<ViaCEPStreetResult[]>([]);
  const [isSearchingStreet, setIsSearchingStreet] = useState(false);

  const { lookupCEP, isLoading: isLoadingCEP } = useCEPLookup();

  const handleCEPChange = async (value: string) => {
    setCepValue(value);
    setCepResult(null);
    const clean = value.replace(/\D/g, "");
    if (clean.length === 8) {
      const data = await lookupCEP(value);
      if (data) {
        setCepResult({
          cep: data.cep,
          street: data.logradouro || "",
          neighborhood: data.bairro || "",
        });
      }
    }
  };

  const handleAddCEP = () => {
    if (!cepResult) return;
    const exists = excludedCeps.some((e) => e.cep === cepResult.cep);
    if (exists) return;
    onUpdate([
      ...excludedCeps,
      {
        cep: cepResult.cep,
        street: cepResult.street,
        neighborhood: cepResult.neighborhood,
        reason: reason || undefined,
      },
    ]);
    setCepValue("");
    setCepResult(null);
    setReason("");
  };

  const handleSearchStreet = async () => {
    if (!coveredUF || !coveredCity || streetSearch.length < 3) return;
    setIsSearchingStreet(true);
    const results = await searchStreetByName(coveredUF, coveredCity, streetSearch);
    setStreetResults(results);
    setIsSearchingStreet(false);
  };

  const handleAddStreet = (result: ViaCEPStreetResult) => {
    const exists = excludedCeps.some((e) => e.cep === result.cep);
    if (exists) return;
    onUpdate([
      ...excludedCeps,
      {
        cep: result.cep,
        street: result.logradouro,
        neighborhood: result.bairro,
      },
    ]);
  };

  const handleAddAllStreetResults = () => {
    const newExclusions = streetResults
      .filter((r) => !excludedCeps.some((e) => e.cep === r.cep))
      .map((r) => ({
        cep: r.cep,
        street: r.logradouro,
        neighborhood: r.bairro,
      }));
    if (newExclusions.length > 0) {
      onUpdate([...excludedCeps, ...newExclusions]);
    }
    setStreetResults([]);
    setStreetSearch("");
  };

  const handleRemove = (index: number) => {
    onUpdate(excludedCeps.filter((_, i) => i !== index));
  };

  const handleAddSweepEntries = (entries: SweepEntry[]) => {
    const existing = new Set(excludedCeps.map((e) => e.cep));
    const additions = entries
      .filter((e) => !existing.has(e.cep))
      .map((e) => ({
        cep: e.cep,
        street: e.street,
        neighborhood: e.neighborhood,
      }));
    if (additions.length > 0) onUpdate([...excludedCeps, ...additions]);
  };

  const blockedCepsSet = new Set(excludedCeps.map((e) => e.cep));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Ban className="h-5 w-5" />
          Exclusões de Entrega
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs defaultValue="cep" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="cep">Por CEP</TabsTrigger>
            <TabsTrigger value="street" disabled={!coveredUF || !coveredCity}>
              Por Rua
            </TabsTrigger>
            <TabsTrigger value="range" disabled={!coveredUF || !coveredCity}>
              Por Faixa
            </TabsTrigger>
          </TabsList>

          <TabsContent value="cep" className="space-y-3 mt-3">
            <div className="space-y-2">
              <Label>Digite o CEP para bloquear</Label>
              <div className="relative">
                <CEPInput value={cepValue} onChange={handleCEPChange} />
                {isLoadingCEP && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                )}
              </div>
              {cepResult && (
                <div className="p-3 border rounded-md bg-muted/50 space-y-2">
                  <p className="text-sm">
                    <strong>{cepResult.cep}</strong> — {cepResult.street}
                    {cepResult.neighborhood && `, ${cepResult.neighborhood}`}
                  </p>
                  <Input
                    placeholder="Motivo (opcional)"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="text-sm"
                  />
                  <Button size="sm" onClick={handleAddCEP}>
                    <Plus className="h-4 w-4 mr-1" /> Bloquear CEP
                  </Button>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="street" className="space-y-3 mt-3">
            <div className="space-y-2">
              <Label>Buscar rua em {coveredCity}/{coveredUF}</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Nome da rua..."
                  value={streetSearch}
                  onChange={(e) => setStreetSearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearchStreet()}
                />
                <Button
                  onClick={handleSearchStreet}
                  disabled={isSearchingStreet || streetSearch.length < 3}
                  size="icon"
                >
                  {isSearchingStreet ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            {streetResults.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    {streetResults.length} resultado(s)
                  </p>
                  <Button size="sm" variant="outline" onClick={handleAddAllStreetResults}>
                    Bloquear todos
                  </Button>
                </div>
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {streetResults.map((result, idx) => {
                    const alreadyBlocked = excludedCeps.some((e) => e.cep === result.cep);
                    return (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-2 border rounded text-sm"
                      >
                        <div>
                          <span className="font-mono text-xs">{result.cep}</span>{" "}
                          {result.logradouro} — {result.bairro}
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleAddStreet(result)}
                          disabled={alreadyBlocked}
                        >
                          {alreadyBlocked ? "Bloqueado" : <Plus className="h-3 w-3" />}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>

        {excludedCeps.length > 0 && (
          <div className="space-y-2">
            <Label>CEPs/Ruas bloqueados ({excludedCeps.length})</Label>
            <div className="flex flex-wrap gap-2">
              {excludedCeps.map((item, index) => (
                <Badge
                  key={index}
                  variant="destructive"
                  className="flex items-center gap-1 py-1 px-2"
                >
                  <span className="font-mono text-xs">{item.cep}</span>
                  {item.street && (
                    <span className="text-xs truncate max-w-[150px]">
                      — {item.street}
                    </span>
                  )}
                  <button
                    onClick={() => handleRemove(index)}
                    className="ml-1 hover:bg-destructive-foreground/20 rounded-full p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>
        )}

        {excludedCeps.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            Nenhum CEP ou rua bloqueado. Adicione exclusões acima.
          </p>
        )}
      </CardContent>
    </Card>
  );
};
