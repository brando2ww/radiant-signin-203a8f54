import { useParams } from "react-router-dom";
import { PedidoDetalheView } from "@/components/vendas/pedidos/PedidoDetalheView";

/** Força de vendas · um pedido: itens, parcelas, faturar, entregar e cancelar. */
export default function PedidoDetalhe() {
  const { id } = useParams<{ id: string }>();
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-4 sm:py-6 lg:px-6">
      <PedidoDetalheView key={id} id={id!} mode="gestao" voltar="/pdv/vendas/pedidos" />
    </div>
  );
}
