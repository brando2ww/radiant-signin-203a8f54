import { Link } from "react-router-dom";
import { AlertCircle, PlugZap } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { VendasAsaas } from "@/lib/vendas/types";

/** Chamada para conectar o Asaas quando a empresa ainda não conectou (ou a conexão deu erro). */
export function AsaasAviso({ asaas }: { asaas: VendasAsaas | null }) {
  const comErro = asaas?.status === "error";
  return (
    <div
      className={
        "flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between " +
        (comErro ? "border-destructive/40 bg-destructive/5" : "border-primary/30 bg-primary/5")
      }
    >
      <div className="flex min-w-0 gap-3">
        {comErro ? (
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
        ) : (
          <PlugZap className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        )}
        <div className="min-w-0">
          <p className="font-medium">{comErro ? "A conexão com o Asaas deu erro" : "Conecte o Asaas para cobrar pelo Velara"}</p>
          <p className="break-words text-sm text-muted-foreground">
            {comErro
              ? asaas?.last_error || "Confira a chave de API nas configurações."
              : "Com a conta do Asaas da empresa conectada, você gera boleto, PIX ou link de cartão aqui, e a parcela é baixada sozinha quando o cliente paga."}
          </p>
        </div>
      </div>
      <Button asChild className="shrink-0">
        <Link to="/pdv/vendas/configuracoes">{comErro ? "Revisar conexão" : "Conectar o Asaas"}</Link>
      </Button>
    </div>
  );
}
