import { FinancialLedger } from "@/components/pdv/financial/FinancialLedger";

/** Contas a pagar da empresa: a mesma tela de lançamentos do financeiro, travada em "a pagar". */
export default function ContasPagar() {
  return (
    <FinancialLedger
      lockedType="payable"
      title="Contas a pagar"
      subtitle="Fornecedores, despesas e as comissões pagas aos representantes"
    />
  );
}
