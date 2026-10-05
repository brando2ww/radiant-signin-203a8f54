import { Routes, Route, Navigate } from "react-router-dom";
import RepHoje from "./Hoje";
import RepClientes from "./Clientes";
import RepClienteDetalhe from "./ClienteDetalhe";
import RepCatalogo from "./Catalogo";
import RepPropostas from "./Propostas";
import RepPropostaEditar from "./PropostaEditar";
import RepPedidos from "./Pedidos";
import RepAgenda from "./Agenda";
import RepComissoes from "./Comissoes";

/**
 * App do representante (/representante), pensado para o celular. Casca provisória do esqueleto: o agente do app do
 * representante substitui por casca com barra de abas e menu; as rotas abaixo são o contrato entre os agentes.
 */
export default function RepresentanteApp() {
  return (
    <Routes>
      <Route index element={<RepHoje />} />
      <Route path="clientes" element={<RepClientes />} />
      <Route path="clientes/:id" element={<RepClienteDetalhe />} />
      <Route path="catalogo" element={<RepCatalogo />} />
      <Route path="propostas" element={<RepPropostas />} />
      <Route path="propostas/nova" element={<RepPropostaEditar />} />
      <Route path="propostas/:id" element={<RepPropostaEditar />} />
      <Route path="pedidos" element={<RepPedidos />} />
      <Route path="agenda" element={<RepAgenda />} />
      <Route path="comissoes" element={<RepComissoes />} />
      <Route path="*" element={<Navigate to="/representante" replace />} />
    </Routes>
  );
}
