import { useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/ui/phone-input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { VendasRepresentante } from "@/lib/vendas/types";
import { senhaProvisoria, type RepFormValues } from "./use-representantes";

/** Percentuais ficam como texto enquanto se digita ("7," ou "7." não podem virar 7 no meio da digitação). */
type FormState = Omit<RepFormValues, "commission_percent" | "max_discount_percent"> & {
  commission_percent: string;
  max_discount_percent: string;
};

const VAZIO: FormState = {
  name: "",
  email: "",
  phone: "",
  document: "",
  region: "",
  commission_percent: "",
  max_discount_percent: "",
  notes: "",
};

/** CPF (até 11 dígitos) ou CNPJ: o representante pode ser pessoa física ou ter empresa. */
function mascaraDocumento(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 14);
  if (d.length <= 11) {
    return d.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  }
  return d
    .replace(/(\d{2})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}

const emailValido = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
const percentual = (v: string) => {
  const n = Number(v.trim().replace(",", "."));
  if (!Number.isFinite(n)) return NaN;
  return Math.round(n * 100) / 100;
};
const percentualOk = (v: string) => {
  if (!v.trim()) return true;
  const n = percentual(v);
  return Number.isFinite(n) && n >= 0 && n <= 100;
};
const soPercentual = (v: string) => v.replace(/[^\d.,]/g, "").slice(0, 6);

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = novo representante. */
  rep: VendasRepresentante | null;
  /** Só o dono pode criar o login (a function de usuário grava quem chama como dono). */
  podeCriarAcesso: boolean;
  salvando: boolean;
  onSalvar: (valores: RepFormValues, senha: string | null) => void;
}

export function RepresentanteFormDialog({ open, onOpenChange, rep, podeCriarAcesso, salvando, onSalvar }: Props) {
  const [v, setV] = useState<FormState>(VAZIO);
  const [comAcesso, setComAcesso] = useState(true);
  const [senha, setSenha] = useState("");
  const [tentou, setTentou] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTentou(false);
    if (rep) {
      setV({
        name: rep.name,
        email: rep.email ?? "",
        phone: rep.phone ?? "",
        document: rep.document ?? "",
        region: rep.region ?? "",
        commission_percent: String(Number(rep.commission_percent) || 0).replace(".", ","),
        max_discount_percent: String(Number(rep.max_discount_percent) || 0).replace(".", ","),
        notes: rep.notes ?? "",
      });
    } else {
      setV(VAZIO);
      setComAcesso(podeCriarAcesso);
      setSenha(senhaProvisoria());
    }
  }, [open, rep, podeCriarAcesso]);

  const novo = !rep;
  const criaAcesso = novo && comAcesso && podeCriarAcesso;
  const emailTravado = !!rep?.rep_user_id;

  const erros = {
    name: v.name.trim().length < 2 ? "Informe o nome." : null,
    email:
      criaAcesso && !v.email.trim()
        ? "O e-mail é o login do representante."
        : v.email.trim() && !emailValido(v.email)
        ? "E-mail inválido."
        : null,
    senha: criaAcesso && senha.trim().length < 6 ? "Mínimo de 6 caracteres." : null,
    commission_percent: percentualOk(v.commission_percent) ? null : "Entre 0 e 100.",
    max_discount_percent: percentualOk(v.max_discount_percent) ? null : "Entre 0 e 100.",
  };
  const temErro = Object.values(erros).some(Boolean);

  const enviar = () => {
    setTentou(true);
    if (temErro) return;
    onSalvar(
      {
        ...v,
        commission_percent: percentual(v.commission_percent) || 0,
        max_discount_percent: percentual(v.max_discount_percent) || 0,
      },
      criaAcesso ? senha.trim() : null,
    );
  };

  const set = <K extends keyof FormState>(k: K, valor: FormState[K]) => setV((s) => ({ ...s, [k]: valor }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{novo ? "Novo representante" : `Editar ${rep?.name}`}</DialogTitle>
          <DialogDescription>
            {novo
              ? "Quem vende para os seus clientes B2B. Ele entra pelo celular e vê só a carteira dele."
              : "Dados, comissão e limite de desconto do representante."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="rep-nome">Nome *</Label>
            <Input id="rep-nome" value={v.name} onChange={(e) => set("name", e.target.value)} placeholder="Nome completo" />
            {tentou && erros.name && <p className="text-xs text-destructive">{erros.name}</p>}
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="rep-email">E-mail{criaAcesso ? " *" : ""}</Label>
            <Input
              id="rep-email"
              type="email"
              autoComplete="off"
              value={v.email}
              onChange={(e) => set("email", e.target.value)}
              placeholder="representante@empresa.com.br"
              disabled={emailTravado}
            />
            {emailTravado && (
              <p className="text-[11px] text-muted-foreground">É o login dele no app: não muda por aqui.</p>
            )}
            {tentou && erros.email && <p className="text-xs text-destructive">{erros.email}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rep-fone">Telefone / WhatsApp</Label>
            <PhoneInput id="rep-fone" value={v.phone} onChange={(x) => set("phone", x)} placeholder="(00) 00000-0000" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rep-doc">CPF ou CNPJ</Label>
            <Input
              id="rep-doc"
              inputMode="numeric"
              value={v.document}
              onChange={(e) => set("document", mascaraDocumento(e.target.value))}
              placeholder="Opcional"
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="rep-regiao">Região de atuação</Label>
            <Input
              id="rep-regiao"
              value={v.region}
              onChange={(e) => set("region", e.target.value)}
              placeholder="Ex.: Serra Gaúcha, Grande Porto Alegre"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rep-comissao">Comissão (%)</Label>
            <div className="relative">
              <Input
                id="rep-comissao"
                inputMode="decimal"
                value={v.commission_percent}
                onChange={(e) => set("commission_percent", soPercentual(e.target.value))}
                placeholder="0"
                className="pr-8"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
            </div>
            {tentou && erros.commission_percent && <p className="text-xs text-destructive">{erros.commission_percent}</p>}
            <p className="text-[11px] text-muted-foreground">
              Sobre o que o cliente pagar. Vale para os próximos pedidos; os já fechados mantêm o percentual da época.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rep-desconto">Desconto máximo (%)</Label>
            <div className="relative">
              <Input
                id="rep-desconto"
                inputMode="decimal"
                value={v.max_discount_percent}
                onChange={(e) => set("max_discount_percent", soPercentual(e.target.value))}
                placeholder="0"
                className="pr-8"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
            </div>
            {tentou && erros.max_discount_percent && <p className="text-xs text-destructive">{erros.max_discount_percent}</p>}
            <p className="text-[11px] text-muted-foreground">O maior desconto que ele pode dar num item da proposta.</p>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="rep-obs">Observações</Label>
            <Textarea
              id="rep-obs"
              rows={2}
              value={v.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Uso interno"
            />
          </div>

          {novo && (
            <div className="space-y-3 rounded-lg border p-3 sm:col-span-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Acesso ao app do representante</p>
                  <p className="text-xs text-muted-foreground">
                    {podeCriarAcesso
                      ? "Cria o login dele agora (e-mail e senha). Ele entra pelo celular e vê só a carteira dele."
                      : "Só o proprietário cria o login do representante. Cadastre agora e peça ao proprietário para liberar o acesso depois."}
                  </p>
                </div>
                <Switch
                  checked={criaAcesso}
                  onCheckedChange={setComAcesso}
                  disabled={!podeCriarAcesso}
                  aria-label="Criar acesso ao app"
                />
              </div>
              {criaAcesso && (
                <div className="space-y-1.5">
                  <Label htmlFor="rep-senha">Senha provisória *</Label>
                  <div className="flex gap-2">
                    <Input
                      id="rep-senha"
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
                  {tentou && erros.senha && <p className="text-xs text-destructive">{erros.senha}</p>}
                  <p className="text-[11px] text-muted-foreground">
                    Você vê a senha de novo ao salvar, para copiar e mandar ao representante.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={salvando}>
            Cancelar
          </Button>
          <Button onClick={enviar} disabled={salvando}>
            {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {novo ? "Cadastrar representante" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
