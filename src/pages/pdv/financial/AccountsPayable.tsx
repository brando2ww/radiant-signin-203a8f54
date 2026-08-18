import { FinancialLedger } from "@/components/pdv/financial/FinancialLedger";

/**
 * Contas a Pagar é a tela de Lançamentos com o tipo travado.
 *
 * Antes tinha tabela própria (`bills`) e formulário próprio, sem plano de
 * contas nem competência — e nada do que era lançado aqui chegava na DRE.
 */
export default function AccountsPayable() {
  return (
    <FinancialLedger
      lockedType="payable"
      title="Contas a Pagar"
      subtitle="Obrigações do estabelecimento, com plano de contas e competência"
    />
  );
}
