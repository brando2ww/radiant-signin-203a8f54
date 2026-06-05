import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { StoredSession } from "@/hooks/use-public-loyalty-session";

interface Props {
  slug: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onAuthenticated: (s: StoredSession) => void;
}

const formatPhone = (value: string) => {
  const numbers = value.replace(/\D/g, "");
  if (numbers.length <= 11) {
    return numbers
      .replace(/^(\d{2})(\d)/g, "($1) $2")
      .replace(/(\d)(\d{4})$/, "$1-$2");
  }
  return value;
};

export function LoyaltyIdentifyDialog({ slug, open, onOpenChange, onAuthenticated }: Props) {
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const reset = () => {
    setStep("phone");
    setPhone("");
    setCode("");
  };

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = phone.replace(/\D/g, "");
    if (clean.length < 10) return;
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("loyalty-send-otp", {
        body: { slug, phone: clean },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success("Código enviado pelo WhatsApp!");
      setStep("code");
    } catch (err: any) {
      toast.error(err?.message || "Erro ao enviar código");
    } finally {
      setSending(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length < 4) return;
    setVerifying(true);
    try {
      const clean = phone.replace(/\D/g, "");
      const { data, error } = await supabase.functions.invoke("loyalty-verify-otp", {
        body: { slug, phone: clean, code },
      });
      if (error) throw error;
      const d = data as any;
      if (d?.error || !d?.session_token) throw new Error(d?.error || "Código inválido");
      onAuthenticated({
        slug,
        user_id: "",
        customer_id: d.customer_id,
        phone: clean,
        session_token: d.session_token,
        session_expires_at: d.session_expires_at,
      });
      onOpenChange(false);
      reset();
    } catch (err: any) {
      toast.error(err?.message || "Código inválido");
    } finally {
      setVerifying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{step === "phone" ? "Identifique-se" : "Confirme o código"}</DialogTitle>
          <DialogDescription>
            {step === "phone"
              ? "Vamos enviar um código por WhatsApp para liberar seus pontos."
              : `Digite o código de 6 dígitos enviado para ${phone}.`}
          </DialogDescription>
        </DialogHeader>

        {step === "phone" ? (
          <form onSubmit={handleSendCode} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="loyalty-phone">Telefone (WhatsApp)</Label>
              <Input
                id="loyalty-phone"
                type="tel"
                autoFocus
                value={phone}
                onChange={(e) => setPhone(formatPhone(e.target.value))}
                placeholder="(00) 00000-0000"
                maxLength={15}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={phone.replace(/\D/g, "").length < 10 || sending}>
              {sending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Enviar código
            </Button>
          </form>
        ) : (
          <form onSubmit={handleVerify} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="loyalty-code">Código</Label>
              <Input
                id="loyalty-code"
                type="text"
                inputMode="numeric"
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                maxLength={6}
                required
              />
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setStep("phone")} disabled={verifying}>
                Voltar
              </Button>
              <Button type="submit" className="flex-1" disabled={code.length < 4 || verifying}>
                {verifying && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Confirmar
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
