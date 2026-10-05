import { AgendaView } from "@/components/vendas/agenda/AgendaView";

/** App do representante · a agenda dele (o banco só devolve os compromissos dele). */
export default function RepAgenda() {
  return (
    <div className="mx-auto w-full max-w-5xl p-4">
      <AgendaView mode="representante" />
    </div>
  );
}
