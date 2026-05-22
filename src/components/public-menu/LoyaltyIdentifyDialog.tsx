import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { useGetOrCreateCustomer, DeliveryCustomer } from "@/hooks/use-delivery-customers";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onConfirm: (c: DeliveryCustomer) => void;
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

export function LoyaltyIdentifyDialog({ open, onOpenChange, onConfirm }: Props) {
  const [phone, setPhone] = useState("");
  const getOrCreate = useGetOrCreateCustomer();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = phone.replace(/\D/g, "");
    if (clean.length < 10) return;
    getOrCreate.mutate(clean, {
      onSuccess: (customer) => {
        onConfirm(customer);
        onOpenChange(false);
        setPhone("");
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Identifique-se</DialogTitle>
          <DialogDescription>
            Informe seu telefone para ver seus pontos do programa de fidelidade.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="loyalty-phone">Telefone</Label>
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
          <Button
            type="submit"
            className="w-full"
            disabled={phone.replace(/\D/g, "").length < 10 || getOrCreate.isPending}
          >
            {getOrCreate.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Ver meus pontos
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
