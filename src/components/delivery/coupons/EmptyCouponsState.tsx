import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Ticket, Plus } from "lucide-react";

export function EmptyCouponsState({ onCreate }: { onCreate: () => void }) {
  return (
    <Card className="p-12 flex flex-col items-center text-center">
      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
        <Ticket className="w-8 h-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold">Crie seu primeiro cupom</h3>
      <p className="text-sm text-muted-foreground mt-2 max-w-md">
        Cupons promocionais ajudam a aumentar suas vendas e fidelizar clientes.
        Compartilhe códigos exclusivos por WhatsApp, redes sociais ou QR Code.
      </p>
      <Button onClick={onCreate} className="mt-6" size="lg">
        <Plus className="w-4 h-4 mr-2" /> Criar primeiro cupom
      </Button>
    </Card>
  );
}
