import { useState, useEffect } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { User, Calendar, Clock } from "lucide-react";

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
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-8 w-8 shrink-0 rounded-full bg-primary/10 flex items-center justify-center">
            <User className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] text-muted-foreground leading-tight">Operador</p>
            <p className="text-sm font-medium truncate">Caixa Principal</p>
          </div>
        </div>

        {/* Data e Hora de Abertura */}
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-8 w-8 shrink-0 rounded-full bg-muted flex items-center justify-center">
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] text-muted-foreground leading-tight">
              {isOpen ? "Aberto em" : "Data atual"}
            </p>
            <p className="text-sm font-medium truncate">
              {openedAt
                ? format(new Date(openedAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
                : format(currentTime, "dd/MM/yyyy", { locale: ptBR })}
            </p>
          </div>
        </div>

        {/* Relógio em Tempo Real */}
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-8 w-8 shrink-0 rounded-full bg-muted flex items-center justify-center">
            <Clock className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] text-muted-foreground leading-tight">Hora atual</p>
            <p className="text-sm font-medium font-mono truncate">
              {format(currentTime, "HH:mm:ss")}
            </p>
          </div>
        </div>

        {/* Status do Caixa */}
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-8 w-8 shrink-0 rounded-full bg-muted flex items-center justify-center">
            <div
              className={`h-3 w-3 rounded-full ${
                isOpen ? "bg-green-500 animate-pulse" : "bg-muted-foreground"
              }`}
            />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] text-muted-foreground leading-tight">Status</p>
            <p className="text-sm font-medium truncate">
              {isOpen ? "Caixa Aberto" : "Caixa Fechado"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
