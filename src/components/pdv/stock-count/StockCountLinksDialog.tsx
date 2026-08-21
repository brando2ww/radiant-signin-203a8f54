import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Copy, KeyRound, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { useStockCountLinks, useResetStockCountLink } from "@/hooks/use-stock-count";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  countId?: string;
}

const SHARE_ORIGIN = "https://pdv.velaraia.app";
const senhaSugerida = () => String(Math.floor(1000 + Math.random() * 9000));

/**
 * Links de uma contagem já aberta.
 *
 * A senha some da tela depois de criada — o hash não volta atrás, de propósito.
 * Então o que este diálogo oferece não é "ver a senha", é reenviar o link e,
 * quando ela se perdeu, trocar por uma nova sem descartar o que já foi contado.
 */
export function StockCountLinksDialog({ open, onOpenChange, countId }: Props) {
  const { data: links = [], isLoading } = useStockCountLinks(countId);
  const reset = useResetStockCountLink();
  const [novas, setNovas] = useState<Record<string, string>>({});

  const url = (token: string) => `${SHARE_ORIGIN}/contagem/${token}`;

  const trocar = (linkId: string) => {
    const senha = novas[linkId]?.trim() || senhaSugerida();
    reset.mutate(
      { linkId, password: senha },
      {
        onSuccess: () => setNovas((v) => ({ ...v, [linkId]: senha })),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Links desta contagem</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : links.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Esta contagem não tem links.
          </p>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              A senha não fica guardada em texto · só o hash. Se ninguém anotou, gere uma
              nova aqui: o link continua o mesmo e a contagem não se perde.
            </p>

            {links.map((l) => {
              const expirado = new Date(l.expires_at) <= new Date();
              return (
                <div key={l.id} className="space-y-2 rounded-md border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{l.label}</span>
                    <div className="flex items-center gap-2">
                      {l.locked_until && new Date(l.locked_until) > new Date() && (
                        <Badge variant="destructive">bloqueado</Badge>
                      )}
                      <Badge variant={expirado ? "destructive" : "secondary"}>
                        {expirado ? "expirado" : `até ${format(new Date(l.expires_at), "dd/MM HH:mm", { locale: ptBR })}`}
                      </Badge>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Input readOnly value={url(l.token)} className="font-mono text-xs" />
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={() => {
                        const senha = novas[l.id];
                        navigator.clipboard.writeText(
                          senha ? `${url(l.token)}\nSenha: ${senha}` : url(l.token),
                        );
                        toast.success(senha ? "Link e senha copiados" : "Link copiado");
                      }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      value={novas[l.id] ?? ""}
                      onChange={(e) => setNovas((v) => ({ ...v, [l.id]: e.target.value }))}
                      placeholder="Nova senha (em branco = sorteia)"
                      className="h-9 max-w-[240px]"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={reset.isPending}
                      onClick={() => trocar(l.id)}
                    >
                      <KeyRound className="mr-2 h-4 w-4" />
                      {expirado ? "Reativar com nova senha" : "Trocar senha"}
                    </Button>
                    {novas[l.id] && (
                      <span className="text-sm">
                        Senha: <strong className="font-mono">{novas[l.id]}</strong>
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
