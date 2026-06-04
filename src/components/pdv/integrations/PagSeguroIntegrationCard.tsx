import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CreditCard, ExternalLink } from "lucide-react";

export function PagSeguroIntegrationCard() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-lg">
              <CreditCard className="h-5 w-5 text-muted-foreground" />
              PagSeguro
              <Badge variant="secondary">Em breve</Badge>
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Integração com maquininhas PagSeguro
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Esta integração ainda está em desenvolvimento. Por enquanto, registre os pagamentos
          em cartão manualmente no PDV usando a forma de pagamento correspondente — o valor
          será conciliado normalmente no fluxo de caixa.
        </p>
        <a
          href="https://dev.pagseguro.uol.com.br/reference"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          <ExternalLink className="h-3 w-3" />
          Documentação PagSeguro
        </a>
      </CardContent>
    </Card>
  );
}
