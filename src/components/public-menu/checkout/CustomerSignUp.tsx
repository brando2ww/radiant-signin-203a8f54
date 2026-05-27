import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { DeliveryCustomer } from "@/hooks/use-delivery-customers";
import { customerSignUpSchema } from "@/lib/validations/customer-auth";

interface CustomerSignUpProps {
  onConfirm: (customer: DeliveryCustomer) => void;
  onBack: () => void;
}

const formatPhone = (value: string) => {
  const n = value.replace(/\D/g, "").slice(0, 11);
  if (n.length <= 10) {
    return n.replace(/^(\d{0,2})(\d{0,4})(\d{0,4}).*/, (_, a, b, c) =>
      [a && `(${a}`, a && a.length === 2 ? ") " : "", b, c && `-${c}`].filter(Boolean).join(""),
    );
  }
  return n.replace(/^(\d{2})(\d{5})(\d{4}).*/, "($1) $2-$3");
};

const formatCpf = (v: string) =>
  v.replace(/\D/g, "").slice(0, 11).replace(/^(\d{3})(\d{3})(\d{3})(\d{0,2}).*/, "$1.$2.$3-$4").replace(/[.-]$/g, "");

export const CustomerSignUp = ({ onConfirm, onBack }: CustomerSignUpProps) => {
  const [form, setForm] = useState({
    name: "",
    cpf: "",
    phone: "",
    birth_date: "",
    email: "",
    password: "",
    password_confirm: "",
  });
  const [loading, setLoading] = useState(false);

  const update = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((s) => ({ ...s, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = customerSignUpSchema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setLoading(true);
    try {
      const cleanPhone = form.phone.replace(/\D/g, "");
      const cleanCpf = form.cpf.replace(/\D/g, "");
      const { data: auth, error } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: {
          emailRedirectTo: window.location.origin,
          data: {
            role: "delivery_customer",
            name: form.name,
            cpf: cleanCpf,
            phone: cleanPhone,
            birth_date: form.birth_date || null,
          },
        },
      });
      if (error) throw error;
      if (!auth.user) throw new Error("Falha ao criar conta");

      // Trigger upserts delivery_customers; fetch it
      const { data: customer } = await (supabase
        .from("delivery_customers") as any)
        .select("*")
        .eq("auth_user_id", auth.user.id)
        .maybeSingle();

      if (customer) {
        toast.success("Cadastro realizado!");
        onConfirm(customer as DeliveryCustomer);
      } else {
        toast.success("Cadastro criado! Verifique seu e-mail para confirmar.");
        onBack();
      }
    } catch (err: any) {
      toast.error("Erro ao cadastrar: " + (err.message || ""));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="s-name">Nome *</Label>
        <Input id="s-name" value={form.name} onChange={update("name")} autoFocus />
      </div>
      <div className="space-y-2">
        <Label htmlFor="s-cpf">CPF *</Label>
        <Input
          id="s-cpf"
          value={form.cpf}
          onChange={(e) => setForm((s) => ({ ...s, cpf: formatCpf(e.target.value) }))}
          maxLength={14}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-2">
          <Label htmlFor="s-phone">Telefone *</Label>
          <Input
            id="s-phone"
            type="tel"
            value={form.phone}
            onChange={(e) => setForm((s) => ({ ...s, phone: formatPhone(e.target.value) }))}
            maxLength={15}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="s-birth">Data nasc.</Label>
          <Input id="s-birth" type="date" value={form.birth_date} onChange={update("birth_date")} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="s-email">E-mail *</Label>
        <Input id="s-email" type="email" value={form.email} onChange={update("email")} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-2">
          <Label htmlFor="s-pass">Senha *</Label>
          <Input id="s-pass" type="password" value={form.password} onChange={update("password")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="s-pass2">Repetir senha *</Label>
          <Input
            id="s-pass2"
            type="password"
            value={form.password_confirm}
            onChange={update("password_confirm")}
          />
        </div>
      </div>

      <div className="flex gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onBack} disabled={loading}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
        </Button>
        <Button type="submit" className="flex-1" disabled={loading}>
          {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Confirmar
        </Button>
      </div>
    </form>
  );
};
