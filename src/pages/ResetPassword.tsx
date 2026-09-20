// Página que o link do e-mail de recuperação abre.
//
// Antes o link apontava para /reset-password, que não existia no roteador e
// caía na página de erro. O link do Supabase chega com a sessão no hash da URL,
// o cliente consome sozinho, e aqui só resta escolher a senha nova.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CheckCircle2, KeyRound } from "lucide-react";
import { toast } from "sonner";

const MINIMO = 6;

export default function ResetPassword() {
  const navigate = useNavigate();
  // Lido antes de o cliente do Supabase limpar o hash.
  const [veioDoEmail] = useState(
    () =>
      typeof window !== "undefined" &&
      (window.location.hash.includes("type=recovery") ||
        new URLSearchParams(window.location.search).has("code")),
  );
  const [erroDoLink] = useState(() => {
    if (typeof window === "undefined") return null;
    const h = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    return h.get("error_description");
  });

  const [verificando, setVerificando] = useState(true);
  const [temSessao, setTemSessao] = useState(false);
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    let ativo = true;
    const { data: assinatura } = supabase.auth.onAuthStateChange((_evento, sessao) => {
      if (!ativo) return;
      if (sessao) {
        setTemSessao(true);
        setVerificando(false);
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      if (!ativo) return;
      setTemSessao(!!data.session);
      setVerificando(false);
    });
    return () => {
      ativo = false;
      assinatura.subscription.unsubscribe();
    };
  }, []);

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (senha.length < MINIMO) {
      toast.error(`A senha precisa de pelo menos ${MINIMO} caracteres`);
      return;
    }
    if (senha !== confirmacao) {
      toast.error("As duas senhas não são iguais");
      return;
    }
    setSalvando(true);
    const { error } = await supabase.auth.updateUser({ password: senha });
    setSalvando(false);
    if (error) {
      toast.error("Não foi possível salvar: " + error.message);
      return;
    }
    setPronto(true);
  };

  const moldura = (conteudo: React.ReactNode) => (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">{conteudo}</Card>
    </div>
  );

  if (verificando) {
    return moldura(
      <CardContent className="py-16 flex justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </CardContent>,
    );
  }

  if (pronto) {
    return moldura(
      <>
        <CardHeader className="text-center">
          <CheckCircle2 className="h-10 w-10 text-emerald-600 mx-auto mb-2" />
          <CardTitle>Senha alterada</CardTitle>
          <CardDescription>Pode entrar com a senha nova.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button className="w-full" onClick={() => navigate("/")}>
            Ir para a entrada
          </Button>
        </CardContent>
      </>,
    );
  }

  if (!temSessao) {
    return moldura(
      <>
        <CardHeader className="text-center">
          <KeyRound className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
          <CardTitle>Link expirado</CardTitle>
          <CardDescription>
            {erroDoLink
              ? "Este link não vale mais."
              : veioDoEmail
                ? "Este link já foi usado ou passou de 1 hora."
                : "Abra esta página pelo link que enviamos no seu e-mail."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" className="w-full" onClick={() => navigate("/")}>
            Pedir um link novo
          </Button>
        </CardContent>
      </>,
    );
  }

  return moldura(
    <>
      <CardHeader>
        <CardTitle>Criar nova senha</CardTitle>
        <CardDescription>Escolha uma senha de pelo menos {MINIMO} caracteres.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={salvar} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="senha">Nova senha</Label>
            <Input
              id="senha"
              type="password"
              autoComplete="new-password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmacao">Repita a senha</Label>
            <Input
              id="confirmacao"
              type="password"
              autoComplete="new-password"
              value={confirmacao}
              onChange={(e) => setConfirmacao(e.target.value)}
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={salvando}>
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar senha"}
          </Button>
        </form>
      </CardContent>
    </>,
  );
}
