import { useState } from "react";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Operator {
  id: string;
  name: string;
  sector: string;
  access_level: string;
}

interface PinLoginScreenProps {
  userId: string;
  onLogin: (operator: Operator) => void;
}

export function PinLoginScreen({ userId, onLogin }: PinLoginScreenProps) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (pin.length !== 4) return;
    setLoading(true);
    setError("");

    const { data, error: err } = await supabase
      .from("checklist_operators")
      .select("id, name, sector, access_level")
      .eq("user_id", userId)
      .eq("pin", pin)
      .eq("is_active", true)
      .maybeSingle();

    if (err) {
      console.warn("[checklist] PIN validation error:", err);
      setError("Não foi possível validar o PIN agora. Peça ao gestor para ativar pelo menos um checklist.");
      setPin("");
      setLoading(false);
      return;
    }
    if (!data) {
      setError("PIN inválido. Tente novamente.");
      setPin("");
      setLoading(false);
      return;
    }

    // Log access
    await supabase.from("checklist_access_logs").insert({
      user_id: userId,
      operator_id: data.id,
      action: "login",
      details: { method: "pin" },
    });

    setLoading(false);
    onLogin(data as Operator);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Lock className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-xl">Acesso Operacional</CardTitle>
          <p className="text-sm text-muted-foreground">Digite seu PIN de 4 dígitos</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-center">
            <InputOTP maxLength={4} value={pin} onChange={setPin}>
              <InputOTPGroup>
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
                <InputOTPSlot index={3} />
              </InputOTPGroup>
            </InputOTP>
          </div>

          {error && (
            <p className="text-sm text-destructive text-center">{error}</p>
          )}

          <Button
            className="w-full"
            onClick={handleSubmit}
            disabled={pin.length !== 4 || loading}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Entrar
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
