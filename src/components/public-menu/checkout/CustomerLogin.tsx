import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { DeliveryCustomer } from "@/hooks/use-delivery-customers";
import { customerLoginSchema } from "@/lib/validations/customer-auth";

interface CustomerLoginProps {
  onConfirm: (customer: DeliveryCustomer) => void;
  onBack: () => void;
}

export const CustomerLogin = ({ onConfirm, onBack }: CustomerLoginProps) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = customerLoginSchema.safeParse({ email, password });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setLoading(true);
    try {
      const { data: auth, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
      if (!auth.user) throw new Error("Falha ao autenticar");

      const { data: customer, error: cErr } = await (supabase
        .from("delivery_customers") as any)
        .select("*")
        .eq("auth_user_id", auth.user.id)
        .maybeSingle();
      if (cErr) throw cErr;
      if (!customer) {
        toast.error("Conta não vinculada a um cliente");
        return;
      }
      onConfirm(customer as DeliveryCustomer);
    } catch (err: any) {
      toast.error("Erro ao entrar: " + (err.message || "verifique seus dados"));
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    if (!email) {
      toast.error("Digite seu e-mail primeiro");
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) toast.error("Erro: " + error.message);
    else toast.success("E-mail de recuperação enviado");
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="l-email">E-mail *</Label>
        <Input
          id="l-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoFocus
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="l-password">Senha *</Label>
        <Input
          id="l-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>

      <div className="flex gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onBack} disabled={loading}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
        </Button>
        <Button type="submit" className="flex-1" disabled={loading}>
          {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Entrar
        </Button>
      </div>

      <div className="text-center">
        <button
          type="button"
          onClick={handleReset}
          className="text-sm text-primary hover:underline"
        >
          Esqueci minha senha
        </button>
      </div>
    </form>
  );
};
