import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ExternalLink } from "lucide-react";

import redeLogo from "@/assets/integrations/rede.png";

export function RedeIntegrationCard() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-lg">
              <img src={redeLogo} alt="Rede" className="h-5 w-5 object-contain" />
              Rede
              <Badge variant="secondary">Em breve</Badge>
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Integração com maquininhas Rede (Itaú)
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Esta integração ainda está em desenvolvimento. Por enquanto, registre os pagamentos
          em cartão manualmente no PDV — o valor será conciliado normalmente no fluxo de caixa.
        </p>
        <a
          href="https://www.userede.com.br/desenvolvedores"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          <ExternalLink className="h-3 w-3" />
          Portal do Desenvolvedor Rede
        </a>
      </CardContent>
    </Card>
  );
}
