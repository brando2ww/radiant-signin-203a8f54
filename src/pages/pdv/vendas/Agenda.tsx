import { AgendaView } from "@/components/vendas/agenda/AgendaView";

/** Força de vendas · agenda da equipe (dono, gerente e financeiro), com filtro por representante. */
export default function Agenda() {
  return (
    <div className="mx-auto w-full max-w-7xl p-4 md:p-6">
      <AgendaView mode="gestao" />
    </div>
  );
}
