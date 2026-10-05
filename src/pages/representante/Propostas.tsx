import { PropostasLista } from "@/components/vendas/propostas/PropostasLista";

/** App do representante · as propostas dele (as regras do banco só devolvem as dele). */
export default function RepPropostas() {
  return <PropostasLista mode="representante" />;
}
