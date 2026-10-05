import { useSearchParams } from "react-router-dom";
import { PedidosLista } from "@/components/vendas/pedidos/PedidosLista";
import { PedidoDetalheView } from "@/components/vendas/pedidos/PedidoDetalheView";

/**
 * App do representante · pedidos dos clientes dele, só leitura. O detalhe abre na mesma rota (?id=), porque o app do
 * representante não tem rota própria de pedido.
 */
export default function RepPedidos() {
  const [params] = useSearchParams();
  const id = params.get("id");
  if (id) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-4 sm:py-6">
        <PedidoDetalheView key={id} id={id} mode="representante" voltar="/representante/pedidos" />
      </div>
    );
  }
  return <PedidosLista mode="representante" />;
}
