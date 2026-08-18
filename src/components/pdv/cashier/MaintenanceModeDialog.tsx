import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useFiscalPause } from "@/hooks/use-fiscal-pause";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cashierSessionId?: string | null;
}

/**
 * Confirmação do Modo Manutenção.
 *
 * Não tem botão na tela: só se chega aqui pelo F11. A saída, essa sim, é
 * visível — fica na faixa fixa do topo do caixa, para que ninguém precise
 * conhecer o atalho para desligar.
 */
export function MaintenanceModeDialog({ open, onOpenChange, cashierSessionId }: Props) {
  const { pausar } = useFiscalPause();

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Modo Manutenção</AlertDialogTitle>
          <AlertDialogDescription>
            Você está ativando o modo manutenção do sistema, gostaria de confirmar?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => pausar.mutate({ cashierSessionId })}
          >
            Sim
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
