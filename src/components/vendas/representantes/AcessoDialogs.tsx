import { useEffect, useState } from "react";
import { Copy, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { VendasRepresentante } from "@/lib/vendas/types";
import { senhaProvisoria } from "./use-representantes";

export type Credenciais = { nome: string; email: string; senha: string };

const enderecoApp = () => `${window.location.origin}/representante`;

/** Mostra o login recém-criado (ou a senha nova) uma única vez, para copiar e mandar ao representante. */
export function CredenciaisDialog({ dados, onClose }: { dados: Credenciais | null; onClose: () => void }) {
  const copiar = () => {
    if (!dados) return;
    const texto = [
      `Olá, ${dados.nome.split(" ")[0]}! Este é o seu acesso ao app de vendas:`,
      `Endereço: ${enderecoApp()}`,
      `E-mail: ${dados.email}`,
      `Senha: ${dados.senha}`,
    ].join("\n");
    navigator.clipboard.writeText(texto).then(
      () => toast.success("Acesso copiado. Cole no WhatsApp ou e-mail do representante."),
      () => toast.error("Não deu para copiar. Selecione e copie à mão."),
    );
  };

  return (
    <Dialog open={!!dados} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Acesso de {dados?.nome}</DialogTitle>
          <DialogDescription>Mande estes dados ao representante. Ele entra pelo celular, no navegador.</DialogDescription>
        </DialogHeader>
        {dados && (
          <div className="space-y-3">
            <div className="space-y-1 rounded-lg border bg-muted/40 p-3 text-sm">
              <p className="flex flex-wrap gap-x-2">
                <span className="text-muted-foreground">Endereço</span>
                <span className="break-all font-medium">{enderecoApp()}</span>
              </p>
              <p className="flex flex-wrap gap-x-2">
                <span className="text-muted-foreground">E-mail</span>
                <span className="break-all font-medium">{dados.email}</span>
              </p>
              <p className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-muted-foreground">Senha</span>
                <span className="font-mono text-lg font-semibold tracking-wider">{dados.senha}</span>
              </p>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Anote ou copie agora: a senha não fica guardada em texto. Se ele esquecer, é só gerar outra aqui.
            </p>
          </div>
        )}
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
          <Button onClick={copiar} className="gap-2">
            <Copy className="h-4 w-4" />
            Copiar acesso
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface SenhaProps {
  /** "senha" = redefinir a senha de quem já tem login; "acesso" = criar o login de quem foi cadastrado sem. */
  modo: "senha" | "acesso";
  rep: VendasRepresentante | null;
  salvando: boolean;
  onClose: () => void;
  onConfirmar: (dados: { email: string; senha: string }) => void;
}

export function SenhaDialog({ modo, rep, salvando, onClose, onConfirmar }: SenhaProps) {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");

  useEffect(() => {
    if (!rep) return;
    setEmail(rep.email ?? "");
    setSenha(senhaProvisoria());
  }, [rep]);

  const emailOk = modo === "senha" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const senhaOk = senha.trim().length >= 6;

  return (
    <Dialog open={!!rep} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{modo === "senha" ? `Nova senha de ${rep?.name}` : `Liberar o app para ${rep?.name}`}</DialogTitle>
          <DialogDescription>
            {modo === "senha"
              ? "A senha atual deixa de valer. Ele entra com a nova a partir do próximo login."
              : "Cria o login do representante. Ele entra pelo celular e vê só a carteira dele."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {modo === "acesso" && (
            <div className="space-y-1.5">
              <Label htmlFor="acesso-email">E-mail (login) *</Label>
              <Input
                id="acesso-email"
                type="email"
                autoComplete="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              {email.trim() && !emailOk && <p className="text-xs text-destructive">E-mail inválido.</p>}
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="acesso-senha">{modo === "senha" ? "Nova senha *" : "Senha provisória *"}</Label>
            <div className="flex gap-2">
              <Input
                id="acesso-senha"
                value={senha}
                autoComplete="new-password"
                onChange={(e) => setSenha(e.target.value)}
                className="font-mono"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setSenha(senhaProvisoria())}
                title="Gerar outra senha"
                aria-label="Gerar outra senha"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
            {!senhaOk && <p className="text-xs text-destructive">Mínimo de 6 caracteres.</p>}
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} disabled={salvando}>
            Cancelar
          </Button>
          <Button
            onClick={() => onConfirmar({ email: email.trim().toLowerCase(), senha: senha.trim() })}
            disabled={salvando || !emailOk || !senhaOk}
          >
            {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {modo === "senha" ? "Trocar senha" : "Criar acesso"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
