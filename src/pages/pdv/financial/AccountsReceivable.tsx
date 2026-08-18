import { FinancialLedger } from "@/components/pdv/financial/FinancialLedger";

/** Contas a Receber é a tela de Lançamentos com o tipo travado. */
export default function AccountsReceivable() {
  return (
    <FinancialLedger
      lockedType="receivable"
      title="Contas a Receber"
      subtitle="Valores a receber, com plano de contas e competência"
    />
  );
}
