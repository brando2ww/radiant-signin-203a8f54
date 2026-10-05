import { useParams } from "react-router-dom";
import { PropostaEditor } from "@/components/vendas/propostas/PropostaEditor";

/** App do representante · criar (/nova, aceita ?cliente=) ou abrir uma proposta. Remonta quando o id muda. */
export default function RepPropostaEditar() {
  const { id } = useParams<{ id: string }>();
  return <PropostaEditor key={id ?? "nova"} mode="representante" />;
}
