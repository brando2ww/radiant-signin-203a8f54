import { useEffect, useState } from "react";
import { Gift } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { usePDVCashbackSettings } from "@/hooks/use-pdv-cashback-settings";

export function CashbackSettingsCard() {
  const { data, isLoading, error, refetch, save } = usePDVCashbackSettings();
  const [ativo, setAtivo] = useState(false);
  const [percentual, setPercentual] = useState("10");
  const [validade, setValidade] = useState("30");
  useEffect(() => {
    if (!data) return;
    setAtivo(data.ativo);
    setPercentual(String(data.percentual));
    setValidade(String(data.validade_dias));
  }, [data]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Gift className="h-5 w-5" />Cashback no salão</CardTitle>
        <CardDescription>
          Clientes com nome e telefone na comanda ganham crédito após pagar a conta.
          O crédito fica disponível em até dois minutos, para a próxima visita.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? <p>Carregando configuração…</p> : error ? (
          <div role="alert" className="space-y-2">
            <p>Não foi possível consultar a configuração.</p>
            <Button variant="outline" onClick={() => refetch()}>Tentar novamente</Button>
          </div>
        ) : data && (
          <form className="space-y-4" onSubmit={(event) => {
            event.preventDefault();
            save.mutate({ ativo, percentual: Number(percentual), validade_dias: Number(validade) });
          }}>
            <fieldset disabled={!data.pode_configurar || save.isPending} className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="cashback-enabled">Ativar cashback no salão</Label>
                <Switch id="cashback-enabled" checked={ativo} onCheckedChange={setAtivo} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="cashback-percentage">Percentual do consumo (%)</Label>
                  <Input id="cashback-percentage" type="number" min="0.01" max="100" step="0.01" required value={percentual} onChange={(event) => setPercentual(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cashback-validity">Validade (dias)</Label>
                  <Input id="cashback-validity" type="number" min="1" max="365" step="1" required value={validade} onChange={(event) => setValidade(event.target.value)} />
                </div>
              </div>
              {data.pode_configurar && <Button type="submit" disabled={save.isPending}>{save.isPending ? "Salvando…" : "Salvar cashback"}</Button>}
            </fieldset>
            {!data.pode_configurar && <p className="text-sm text-muted-foreground">O proprietário ou gerente pode alterar esta configuração.</p>}
            <p className="text-sm text-muted-foreground">
              O cálculo considera o consumo sem taxa de serviço e desconta o cashback usado.
              A ativação vale para contas pagas a partir dela. Créditos existentes mantêm seu vencimento.
              A fidelidade do delivery é configurada separadamente.
            </p>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
