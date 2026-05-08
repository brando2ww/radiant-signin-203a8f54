import { useState, useEffect } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { User, Calendar, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface CashierHeaderProps {
  isOpen: boolean;
  openedAt: string | null;
}

export function CashierHeader({ isOpen, openedAt }: CashierHeaderProps) {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="bg-muted/50 border rounded-lg p-3">
      <div className="grid grid-cols-2 md:grid-cols-4 items-center gap-3">
        {/* Operador */}
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
            <User className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Operador</p>
            <p className="font-medium">Caixa Principal</p>
          </div>
        </div>

        {/* Data e Hora de Abertura */}
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">
              {isOpen ? "Aberto em" : "Data atual"}
            </p>
            <p className="font-medium">
              {openedAt
                ? format(new Date(openedAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
                : format(currentTime, "dd/MM/yyyy", { locale: ptBR })}
            </p>
          </div>
        </div>

        {/* Relógio em Tempo Real */}
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
            <Clock className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Hora atual</p>
            <p className="font-medium font-mono text-base">
              {format(currentTime, "HH:mm:ss")}
            </p>
          </div>
        </div>

        {/* Status do Caixa */}
        <div className="flex items-center gap-3">
          <div
            className={`h-3 w-3 rounded-full ${
              isOpen ? "bg-green-500 animate-pulse" : "bg-muted-foreground"
            }`}
          />
          <Badge
            variant={isOpen ? "default" : "secondary"}
            className={`text-xs px-3 py-1 ${
              isOpen
                ? "bg-green-500/10 text-green-600 border-green-500/20 hover:bg-green-500/20"
                : ""
            }`}
          >
            {isOpen ? "Caixa Aberto" : "Caixa Fechado"}
          </Badge>
        </div>
      </div>
    </div>
  );
}
