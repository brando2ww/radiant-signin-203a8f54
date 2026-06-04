import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ExternalLink, Ban, FileEdit } from "lucide-react";
import { NotaFiscal, useFiscalNotas, useCartasCorrecao } from "@/hooks/use-fiscal-notas";
import { useNFeEmission } from "@/hooks/use-nfe-emission";
import { formatBRL } from "@/lib/format";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Props {
  nota: NotaFiscal;
  open: boolean;
  onClose: () => void;
}

export function NotaDetailDialog({ nota, open, onClose }: Props) {
  const { cancelar, isCancelling } = useFiscalNotas();
  const { cartaCorrecao, isSendingCCe } = useNFeEmission();
  const cces = useCartasCorrecao(nota.id);

  const [showCancel, setShowCancel] = useState(false);
  const [justificativa, setJustificativa] = useState("");

  const [showCCe, setShowCCe] = useState(false);
  const [correcao, setCorrecao] = useState("");

  const podeCancelar = nota.status === "autorizada";
  const podeCCe = nota.tipo === "nfe" && nota.status === "autorizada";

  const handleCancel = async () => {
    if (justificativa.length < 15) return;
    await cancelar({ ref: nota.referencia_focusnfe, tipo: nota.tipo, justificativa });
    setShowCancel(false);
    setJustificativa("");
    onClose();
  };

  const handleCCe = async () => {
    if (correcao.length < 15) return;
    await cartaCorrecao({ ref: nota.referencia_focusnfe, correcao });
    setShowCCe(false);
    setCorrecao("");
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {nota.tipo.toUpperCase()} {nota.numero ? `nº ${nota.numero}` : ""}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="flex gap-2">
            <Badge variant="secondary">{nota.status}</Badge>
            <Badge variant="outline">{nota.ambiente}</Badge>
          </div>

          {nota.chave_acesso && (
            <div>
              <div className="text-muted-foreground text-xs">Chave de acesso</div>
              <div className="font-mono break-all">{nota.chave_acesso}</div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-muted-foreground text-xs">Valor total</div>
              <div className="font-semibold">{formatBRL(nota.valor_total)}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">Emissão</div>
              <div>{nota.emitida_em && format(new Date(nota.emitida_em), "dd/MM/yyyy HH:mm", { locale: ptBR })}</div>
            </div>
          </div>

          {nota.destinatario_nome && (
            <div>
              <div className="text-muted-foreground text-xs">Destinatário</div>
              <div>{nota.destinatario_nome} {nota.destinatario_documento && `(${nota.destinatario_documento})`}</div>
            </div>
          )}

          {nota.mensagem_sefaz && (
            <div className="rounded-md bg-muted p-3">
              <div className="text-muted-foreground text-xs">Mensagem SEFAZ</div>
              <div>{nota.mensagem_sefaz}</div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {nota.caminho_xml && (
              <Button asChild size="sm" variant="outline">
                <a href={nota.caminho_xml} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 mr-1" />XML
                </a>
              </Button>
            )}
            {nota.caminho_danfe && (
              <Button asChild size="sm" variant="outline">
                <a href={nota.caminho_danfe} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 mr-1" />DANFE
                </a>
              </Button>
            )}
            {podeCancelar && (
              <Button size="sm" variant="destructive" onClick={() => setShowCancel((s) => !s)}>
                <Ban className="h-4 w-4 mr-1" />Cancelar
              </Button>
            )}
            {podeCCe && (
              <Button size="sm" variant="outline" onClick={() => setShowCCe((s) => !s)}>
                <FileEdit className="h-4 w-4 mr-1" />Carta de Correção
              </Button>
            )}
          </div>

          {showCancel && (
            <div className="space-y-2 rounded-md border p-3">
              <div className="text-sm font-medium">Justificativa de cancelamento (mín. 15 caracteres)</div>
              <Textarea
                value={justificativa}
                onChange={(e) => setJustificativa(e.target.value)}
                rows={3}
                maxLength={255}
              />
              <div className="text-xs text-muted-foreground">{justificativa.length}/15</div>
              <Button
                size="sm"
                variant="destructive"
                disabled={justificativa.length < 15 || isCancelling}
                onClick={handleCancel}
              >
                Confirmar cancelamento
              </Button>
            </div>
          )}

          {showCCe && (
            <div className="space-y-2 rounded-md border p-3">
              <div className="text-sm font-medium">Texto da correção (mín. 15 caracteres)</div>
              <Textarea
                value={correcao}
                onChange={(e) => setCorrecao(e.target.value)}
                rows={3}
                maxLength={1000}
              />
              <div className="text-xs text-muted-foreground">{correcao.length}/15</div>
              <Button
                size="sm"
                disabled={correcao.length < 15 || isSendingCCe}
                onClick={handleCCe}
              >
                Enviar CC-e
              </Button>
            </div>
          )}

          {cces.data && cces.data.length > 0 && (
            <>
              <Separator />
              <div className="space-y-2">
                <div className="text-sm font-medium">Cartas de Correção</div>
                {(cces.data as any[]).map((c) => (
                  <div key={c.id} className="rounded-md border p-2 text-sm">
                    <div className="flex justify-between">
                      <strong>CC-e #{c.sequencia}</strong>
                      <Badge variant="outline">{c.status}</Badge>
                    </div>
                    <div className="text-muted-foreground text-xs mt-1">{c.correcao}</div>
                    {c.xml_url && (
                      <a className="text-xs underline" href={c.xml_url} target="_blank" rel="noopener noreferrer">
                        Baixar XML
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
