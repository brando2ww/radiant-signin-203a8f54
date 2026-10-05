import { Routes, Route, Navigate } from "react-router-dom";
import Painel from "./Painel";
import Representantes from "./Representantes";
import Clientes from "./Clientes";
import ClienteDetalhe from "./ClienteDetalhe";
import Produtos from "./Produtos";
import Fornecedores from "./Fornecedores";
import Propostas from "./Propostas";
import PropostaEditar from "./PropostaEditar";
import Pedidos from "./Pedidos";
import PedidoDetalhe from "./PedidoDetalhe";
import Agenda from "./Agenda";
import ContasReceber from "./ContasReceber";
import ContasPagar from "./ContasPagar";
import Cobrancas from "./Cobrancas";
import Comissoes from "./Comissoes";
import Configuracoes from "./Configuracoes";

/** Força de vendas · telas do dono, gerente e financeiro (o representante usa /representante). */
export default function VendasRoutes() {
  return (
    <Routes>
      <Route index element={<Painel />} />
      <Route path="representantes" element={<Representantes />} />
      <Route path="clientes" element={<Clientes />} />
      <Route path="clientes/:id" element={<ClienteDetalhe />} />
      <Route path="produtos" element={<Produtos />} />
      <Route path="fornecedores" element={<Fornecedores />} />
      <Route path="propostas" element={<Propostas />} />
      <Route path="propostas/nova" element={<PropostaEditar />} />
      <Route path="propostas/:id" element={<PropostaEditar />} />
      <Route path="pedidos" element={<Pedidos />} />
      <Route path="pedidos/:id" element={<PedidoDetalhe />} />
      <Route path="agenda" element={<Agenda />} />
      <Route path="receber" element={<ContasReceber />} />
      <Route path="pagar" element={<ContasPagar />} />
      <Route path="cobrancas" element={<Cobrancas />} />
      <Route path="comissoes" element={<Comissoes />} />
      <Route path="configuracoes" element={<Configuracoes />} />
      <Route path="*" element={<Navigate to="/pdv/vendas" replace />} />
    </Routes>
  );
}
