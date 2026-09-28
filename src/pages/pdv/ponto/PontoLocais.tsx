import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Crosshair, Loader2, MapPin, Plus } from "lucide-react";
import { toast } from "sonner";
import { usePontoLocais, type PontoLocal } from "@/hooks/use-ponto";

export default function PontoLocais() {
  const { locais, isLoading, salvar } = usePontoLocais();
  const [aberto, setAberto] = useState(false);
  const [edicao, setEdicao] = useState<Partial<PontoLocal>>({});
  const [capturando, setCapturando] = useState(false);

  const abrirNovo = () => {
    setEdicao({ nome: "", raio_m: 150, ativo: true });
    setAberto(true);
  };

  /**
   * O jeito mais simples de cadastrar o local é o gerente abrir esta tela
   * DENTRO do restaurante e tocar em "usar minha posição". Mapa interativo é
   * bonito e desnecessário para um endereço fixo.
   */
  const capturar = () => {
    if (!navigator.geolocation) {
      toast.error("Este aparelho não informa a localização.");
      return;
    }
    setCapturando(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setEdicao((e) => ({ ...e, latitude: p.coords.latitude, longitude: p.coords.longitude }));
        setCapturando(false);
        toast.success(`Posição capturada com precisão de ${Math.round(p.coords.accuracy)} m`);
      },
      () => {
        setCapturando(false);
        toast.error("Não consegui pegar a localização. Autorize o acesso no navegador.");
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  const gravar = async () => {
    if (!edicao.nome?.trim()) return;
    await salvar.mutateAsync({ ...edicao, nome: edicao.nome.trim() } as any);
    setAberto(false);
    toast.success("Local salvo");
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Locais de trabalho</h1>
          <p className="text-sm text-muted-foreground">
            A área onde o ponto é batido. Quem bater fora dela é registrado do mesmo jeito, com aviso.
          </p>
        </div>
        <Button onClick={abrirNovo}>
          <Plus className="mr-2 h-4 w-4" /> Novo local
        </Button>
      </div>

      {isLoading ? (
        <div className="py-16 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div>
      ) : locais.length === 0 ? (
        <Card className="py-16 text-center">
          <MapPin className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="font-medium">Nenhum local cadastrado</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Sem local, o ponto funciona e registra a coordenada, mas ninguém sabe se a pessoa estava
            no restaurante. Cadastre estando dentro dele.
          </p>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {locais.map((l) => (
            <Card
              key={l.id}
              className="cursor-pointer p-4 transition hover:border-primary/40"
              onClick={() => { setEdicao(l); setAberto(true); }}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium">{l.nome}</p>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    {l.latitude != null ? `${l.latitude.toFixed(5)}, ${l.longitude?.toFixed(5)}` : "sem posição"}
                  </p>
                </div>
                <Badge variant="secondary">{l.raio_m} m</Badge>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{edicao.id ? "Editar local" : "Novo local"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Nome</Label>
              <Input
                placeholder="Salão, cozinha, unidade centro"
                value={edicao.nome ?? ""}
                onChange={(e) => setEdicao({ ...edicao, nome: e.target.value })}
              />
            </div>

            <Button variant="outline" className="w-full" onClick={capturar} disabled={capturando}>
              {capturando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Crosshair className="mr-2 h-4 w-4" />}
              Usar minha posição agora
            </Button>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Latitude</Label>
                <Input
                  className="font-mono text-xs"
                  value={edicao.latitude ?? ""}
                  onChange={(e) => setEdicao({ ...edicao, latitude: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Longitude</Label>
                <Input
                  className="font-mono text-xs"
                  value={edicao.longitude ?? ""}
                  onChange={(e) => setEdicao({ ...edicao, longitude: Number(e.target.value) })}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Raio aceito: {edicao.raio_m ?? 150} metros</Label>
              <Input
                type="range"
                min={50}
                max={1000}
                step={10}
                value={edicao.raio_m ?? 150}
                onChange={(e) => setEdicao({ ...edicao, raio_m: Number(e.target.value) })}
              />
              <p className="text-[11px] text-muted-foreground">
                Abaixo de 100 m o aviso de "fora da área" aparece sem motivo: dentro de prédio, com
                coifa e câmara fria, o GPS erra mais de 16 metros com facilidade.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(false)}>Cancelar</Button>
            <Button onClick={gravar} disabled={!edicao.nome?.trim() || salvar.isPending}>
              {salvar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
