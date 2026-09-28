import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Camera, Loader2 } from "lucide-react";

/**
 * Captura a selfie da batida.
 *
 * Usa getUserMedia e desenha o quadro num canvas, de propósito. O padrão
 * `input type=file` com `capture`, que já existe em outra tela deste projeto,
 * aceita foto da GALERIA: seria uma prova que qualquer um fabrica.
 *
 * Se a câmera não abrir, o componente avisa e deixa bater sem foto. Ficar sem
 * registro de jornada é pior que ficar sem foto, e a portaria veda restringir
 * a marcação.
 */
interface Props {
  aberto: boolean;
  onCapturar: (dataUrl: string | null) => void;
  onCancelar: () => void;
}

export function CameraSelfie({ aberto, onCapturar, onCancelar }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [pronta, setPronta] = useState(false);
  const [erro, setErro] = useState("");

  const parar = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setPronta(false);
  }, []);

  useEffect(() => {
    if (!aberto) {
      parar();
      return;
    }
    let cancelado = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
        if (cancelado) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setPronta(true);
        }
      } catch {
        setErro("Não consegui abrir a câmera. Você pode bater sem foto.");
      }
    })();
    return () => {
      cancelado = true;
      parar();
    };
  }, [aberto, parar]);

  const capturar = () => {
    const v = videoRef.current;
    if (!v) return onCapturar(null);
    const canvas = document.createElement("canvas");
    // 480x640 com qualidade 0,6 dá uma foto de ~60 KB: o suficiente para
    // reconhecer a pessoa e leve para o 4G ruim da cozinha.
    canvas.width = 480;
    canvas.height = 640;
    const ctx = canvas.getContext("2d");
    if (!ctx) return onCapturar(null);
    const escala = Math.max(canvas.width / v.videoWidth, canvas.height / v.videoHeight);
    const larg = v.videoWidth * escala;
    const alt = v.videoHeight * escala;
    ctx.drawImage(v, (canvas.width - larg) / 2, (canvas.height - alt) / 2, larg, alt);
    onCapturar(canvas.toDataURL("image/jpeg", 0.6));
    parar();
  };

  if (!aberto) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="relative flex-1 overflow-hidden">
        <video
          ref={videoRef}
          playsInline
          muted
          className="h-full w-full object-cover"
          style={{ transform: "scaleX(-1)" }}
        />
        {!pronta && !erro && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-white" />
          </div>
        )}
        {erro && (
          <div className="absolute inset-0 flex items-center justify-center p-8 text-center text-sm text-white">
            {erro}
          </div>
        )}
      </div>
      <div className="flex items-center justify-between gap-3 bg-black p-5">
        <Button variant="ghost" className="text-white hover:text-white" onClick={() => { parar(); onCancelar(); }}>
          Cancelar
        </Button>
        {erro ? (
          <Button onClick={() => onCapturar(null)}>Bater sem foto</Button>
        ) : (
          <Button size="lg" className="h-16 w-16 rounded-full" disabled={!pronta} onClick={capturar}>
            <Camera className="h-6 w-6" />
          </Button>
        )}
        <span className="w-16" />
      </div>
    </div>
  );
}
