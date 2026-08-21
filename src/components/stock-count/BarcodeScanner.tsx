import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, ScanLine } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDetect: (code: string) => void;
}

/** Formatos que aparecem em embalagem de alimento. */
const FORMATOS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "itf"];

/**
 * Leitor de código de barras pela câmera.
 *
 * Usa a API nativa do navegador (BarcodeDetector) em vez de uma biblioteca:
 * são centenas de KB a menos num app que o operador abre pelo celular, muitas
 * vezes no 4G do depósito. Onde a API não existe — Safari e Firefox, hoje — a
 * tela cai para digitação do código, que é o que a pessoa faria de qualquer
 * jeito sem leitor.
 */
export function BarcodeScanner({ open, onOpenChange, onDetect }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [suportado, setSuportado] = useState<boolean | null>(null);
  const [erro, setErro] = useState("");
  const [manual, setManual] = useState("");

  useEffect(() => {
    if (!open) return;

    const Detector = (globalThis as any).BarcodeDetector;
    if (!Detector) {
      setSuportado(false);
      return;
    }
    setSuportado(true);

    let parar = false;
    let detector: any;

    const iniciar = async () => {
      try {
        detector = new Detector({ formats: FORMATOS });
        const stream = await navigator.mediaDevices.getUserMedia({
          // A traseira é a que enxerga a prateleira.
          video: { facingMode: { ideal: "environment" } },
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        const varrer = async () => {
          if (parar || !videoRef.current) return;
          try {
            const achados = await detector.detect(videoRef.current);
            const codigo = achados?.[0]?.rawValue;
            if (codigo) {
              // Vibra para confirmar sem precisar olhar a tela.
              navigator.vibrate?.(60);
              onDetect(String(codigo));
              onOpenChange(false);
              return;
            }
          } catch {
            /* quadro ruim; o próximo resolve */
          }
          requestAnimationFrame(varrer);
        };
        requestAnimationFrame(varrer);
      } catch (e: any) {
        setErro(
          e?.name === "NotAllowedError"
            ? "Permissão de câmera negada. Libere nas configurações do navegador."
            : "Não foi possível abrir a câmera.",
        );
      }
    };

    void iniciar();

    return () => {
      parar = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [open, onDetect, onOpenChange]);

  const confirmarManual = () => {
    const c = manual.trim();
    if (!c) return;
    onDetect(c);
    setManual("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ler código de barras</DialogTitle>
        </DialogHeader>

        {suportado === null && (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        )}

        {suportado && !erro && (
          <div className="space-y-3">
            <div className="relative overflow-hidden rounded-lg bg-black">
              <video ref={videoRef} playsInline muted className="h-64 w-full object-cover" />
              {/* Mira: dá à pessoa onde encostar o código. */}
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="h-24 w-4/5 rounded-lg border-2 border-white/80" />
              </div>
            </div>
            <p className="text-center text-sm text-muted-foreground">
              Aponte para o código da embalagem
            </p>
          </div>
        )}

        {(suportado === false || erro) && (
          <div className="space-y-3">
            <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
              <ScanLine className="mx-auto mb-2 h-6 w-6 opacity-50" />
              {erro || "Este navegador não lê código de barras pela câmera."}
              <p className="mt-1">Digite o código que está na embalagem.</p>
            </div>
            <div className="flex gap-2">
              <Input
                autoFocus
                inputMode="numeric"
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && confirmarManual()}
                placeholder="7891234567890"
                className="h-11"
              />
              <Button className="h-11" onClick={confirmarManual} disabled={!manual.trim()}>
                Buscar
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
