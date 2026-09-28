import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Clock, Delete, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { baterComSelfie, traduzErroPonto } from "@/hooks/use-ponto";
import { CameraSelfie } from "@/components/ponto/CameraSelfie";

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/**
 * Tablet do salão.
 *
 * É o caminho de quem não tem celular, de quem está na cozinha sem sinal e do
 * iPhone que pede permissão de câmera a cada visita. O aparelho é do
 * restaurante e fica sempre nesta tela; quem se identifica é a pessoa, com um
 * PIN de quatro dígitos.
 *
 * Nada fica guardado entre uma batida e outra: sem sessão pendurada, o próximo
 * da fila não consegue bater no lugar de quem acabou de sair.
 */
export default function PontoQuiosque() {
  const { token: bruto = "" } = useParams<{ token: string }>();
  const token = UUID_RE.exec(decodeURIComponent(bruto))?.[0] ?? bruto;

  const [pin, setPin] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [camera, setCamera] = useState(false);
  const [resultado, setResultado] = useState<{ nome: string; hora: string; nsr: number } | null>(null);
  const [erro, setErro] = useState("");
  const [agora, setAgora] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // A confirmação some sozinha: a tela precisa estar pronta para o próximo.
  useEffect(() => {
    if (!resultado) return;
    const t = setTimeout(() => setResultado(null), 6000);
    return () => clearTimeout(t);
  }, [resultado]);

  const posicao = (): Promise<GeolocationPosition | null> =>
    new Promise((r) => {
      if (!navigator.geolocation) return r(null);
      navigator.geolocation.getCurrentPosition((p) => r(p), () => r(null), { timeout: 6000, maximumAge: 600_000 });
    });

  const registrar = async (imagem: string | null) => {
    setOcupado(true);
    setErro("");
    const p = await posicao();
    try {
      const r = await baterComSelfie({
        quiosqueToken: token,
        pin,
        imagem,
        latitude: p?.coords.latitude ?? null,
        longitude: p?.coords.longitude ?? null,
        accuracy: p?.coords.accuracy ?? null,
      });
      setResultado({
        nome: (r as any).colaborador_nome ?? r.colaborador,
        hora: new Date(r.marcado_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
        nsr: r.nsr,
      });
      setPin("");
    } catch (e: any) {
      setErro(e?.message === "pin_invalido" ? "Senha não confere." : traduzErroPonto(e?.message));
      setPin("");
    } finally {
      setOcupado(false);
    }
  };

  const confirmar = () => {
    if (pin.length < 4) return;
    setCamera(true);
  };

  const tecla = (v: string) => {
    if (ocupado) return;
    setErro("");
    if (v === "apagar") return setPin(pin.slice(0, -1));
    if (pin.length >= 6) return;
    setPin(pin + v);
  };

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-background p-8">
      <CameraSelfie
        aberto={camera}
        onCancelar={() => setCamera(false)}
        onCapturar={(img) => {
          setCamera(false);
          registrar(img);
        }}
      />

      <div className="text-center">
        <p className="font-mono text-7xl font-semibold tabular-nums">
          {agora.toLocaleTimeString("pt-BR", { hour12: false })}
        </p>
        <p className="mt-1 text-muted-foreground">
          {agora.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}
        </p>
      </div>

      {resultado ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-50 px-10 py-8 text-center dark:bg-emerald-950/30">
          <CheckCircle2 className="h-10 w-10 text-emerald-600" />
          <p className="text-2xl font-semibold">{resultado.nome}</p>
          <p className="text-muted-foreground">
            Ponto registrado às {resultado.hora} · comprovante nº {resultado.nsr}
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3">
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                className={cn(
                  "h-4 w-4 rounded-full border-2",
                  pin.length > i ? "border-primary bg-primary" : "border-muted-foreground/40",
                )}
              />
            ))}
          </div>

          <div className="grid grid-cols-3 gap-3">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((n) => (
              <Button key={n} variant="outline" className="h-20 w-20 text-2xl" onClick={() => tecla(n)}>
                {n}
              </Button>
            ))}
            <Button variant="ghost" className="h-20 w-20" onClick={() => tecla("apagar")}>
              <Delete className="h-6 w-6" />
            </Button>
            <Button variant="outline" className="h-20 w-20 text-2xl" onClick={() => tecla("0")}>
              0
            </Button>
            <Button className="h-20 w-20" disabled={pin.length < 4 || ocupado} onClick={confirmar}>
              {ocupado ? <Loader2 className="h-6 w-6 animate-spin" /> : <Clock className="h-6 w-6" />}
            </Button>
          </div>

          {erro && <p className="text-destructive">{erro}</p>}
          <p className="text-sm text-muted-foreground">Digite sua senha de quatro dígitos</p>
        </>
      )}
    </div>
  );
}
