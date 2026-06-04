import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info } from "lucide-react";
import { useIFoodIntegration } from "@/hooks/use-ifood-integration";

interface IFoodConnectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function IFoodConnectionDialog({ open, onOpenChange }: IFoodConnectionDialogProps) {
  const [authCode, setAuthCode] = useState("");
  const { connectIFood } = useIFoodIntegration();

  useEffect(() => {
    if (open) setAuthCode("");
  }, [open]);

  const handleConnect = async () => {
    if (!authCode) return;
    await connectIFood.mutateAsync({ code: authCode });
    onOpenChange(false);
    setAuthCode("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Conectar iFood</DialogTitle>
          <DialogDescription>
            Cole o código de autorização gerado no Portal do Desenvolvedor iFood
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription className="text-sm">
              <strong>Como obter o código:</strong>
              <ol className="list-decimal ml-4 mt-2 space-y-1">
                <li>Acesse o Portal do Desenvolvedor iFood e gere um código de autorização</li>
                <li>Cole o código abaixo e clique em "Conectar"</li>
              </ol>
              <p className="mt-2 text-xs text-muted-foreground">
                As credenciais (Client ID e Client Secret) são gerenciadas pelo administrador
                do sistema — você só precisa do código retornado pelo iFood.
              </p>
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <Label htmlFor="authCode">Código de Autorização *</Label>
            <Input
              id="authCode"
              type="text"
              value={authCode}
              onChange={(e) => setAuthCode(e.target.value)}
              placeholder="Cole aqui o código retornado pelo iFood"
            />
          </div>

          <div className="flex gap-2 justify-end pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleConnect}
              disabled={!authCode || connectIFood.isPending}
            >
              {connectIFood.isPending ? "Conectando..." : "Conectar"}
            </Button>
          </div>

          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription className="text-xs">
              <strong>Precisa de ajuda?</strong> Acesse o{" "}
              <a
                href="https://developer.ifood.com.br"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                Portal do Desenvolvedor iFood
              </a>{" "}
              para gerar o código de autorização.
            </AlertDescription>
          </Alert>
        </div>
      </DialogContent>
    </Dialog>
  );
}
