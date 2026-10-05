import { ReceberLedger } from "@/components/vendas/financeiro/ReceberLedger";

/** Contas a receber da empresa, com o pedido de origem e a situação da cobrança no Asaas. */
export default function ContasReceber() {
  return (
    <ReceberLedger
      title="Contas a receber"
      subtitle="Parcelas dos pedidos e demais recebimentos, com a cobrança de cada uma"
    />
  );
}
