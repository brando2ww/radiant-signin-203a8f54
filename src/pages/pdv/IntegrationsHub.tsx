import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ResponsivePageHeader } from "@/components/ui/responsive-page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, ArrowRight, Bike, TabletSmartphone } from "lucide-react";
import { WhatsAppIcon } from "@/components/icons/WhatsAppIcon";
import { supabase } from "@/integrations/supabase/client";

import pagseguroLogo from "@/assets/integrations/pagseguro.png";
import stoneLogo from "@/assets/integrations/stone.png";
import goomerLogo from "@/assets/integrations/goomer.png";
import nfeLogo from "@/assets/integrations/nfe.png";
import getnetLogo from "@/assets/integrations/getnet.png";
import redeLogo from "@/assets/integrations/rede.png";
import velaraLogo from "@/assets/logo_velara_preto.png";

interface IntegrationItem {
  slug: string;
  name: string;
  description: string;
  logo?: string;
  fallbackIcon?: React.ComponentType<{ className?: string }>;
  customIcon?: React.ReactNode;
  category: string;
  categoryColor: string;
  comingSoon?: boolean;
}

const integrations: IntegrationItem[] = [
  {
    slug: "pagseguro",
    name: "PagSeguro",
    description: "Conecte sua maquininha PagSeguro para receber pagamentos em cartão de débito e crédito.",
    logo: pagseguroLogo,
    category: "Maquininha",
    categoryColor: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    comingSoon: true,
  },
  {
    slug: "stone",
    name: "Stone",
    description: "Integração com terminais Stone para pagamentos por cartão com split e antecipação.",
    logo: stoneLogo,
    category: "Maquininha",
    categoryColor: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    comingSoon: true,
  },
  {
    slug: "getnet",
    name: "Getnet",
    description: "Conecte sua maquininha Getnet (Santander) com POS integrado via Cloud, USB ou HTTP.",
    logo: getnetLogo,
    category: "Maquininha",
    categoryColor: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    comingSoon: true,
  },
  {
    slug: "rede",
    name: "Rede",
    description: "Integração com maquininhas Rede (Itaú) via USB, Bluetooth ou HTTP com suporte a Pix e e-Rede.",
    logo: redeLogo,
    category: "Maquininha",
    categoryColor: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    comingSoon: true,
  },
  {
    slug: "nf-automatica",
    name: "NF Automática",
    description: "Emita notas fiscais automaticamente ao finalizar vendas, com certificado digital A1.",
    logo: nfeLogo,
    category: "Fiscal",
    categoryColor: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  },
  {
    slug: "goomer",
    name: "Goomer",
    description: "Cardápio digital interativo com QR Code por mesa e pedidos via tablet integrados ao PDV.",
    logo: goomerLogo,
    category: "Cardápio Digital",
    categoryColor: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  },
  {
    slug: "whatsapp",
    name: "WhatsApp Business",
    description: "Conecte seu WhatsApp Business para enviar notificações, receber pedidos e se comunicar com clientes.",
    customIcon: <WhatsAppIcon className="h-7 w-7 text-green-500" />,
    category: "Comunicação",
    categoryColor: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  },
  {
    slug: "uber-eats",
    name: "Uber Eats",
    description: "Receba pedidos do Uber Eats no seu sistema com sincronização automática.",
    fallbackIcon: Bike,
    category: "Delivery",
    categoryColor: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    comingSoon: true,
  },
  {
    slug: "delivery-proprio",
    name: "Delivery Próprio",
    description: "Sistema de delivery integrado da Velara com cardápio online personalizável e gestão completa de pedidos.",
    logo: velaraLogo,
    category: "Delivery",
    categoryColor: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  },
  {
    slug: "ativar-dispositivo",
    name: "Ativar VelaraPay",
    description: "Vincule este PDV ao seu estabelecimento usando o token de ativação gerado no painel administrativo.",
    fallbackIcon: TabletSmartphone,
    category: "Dispositivo",
    categoryColor: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
  },
];

export default function IntegrationsHub() {
  const navigate = useNavigate();

  return (
    <div className="p-4 md:p-6 space-y-6">
      <ResponsivePageHeader
        title="Integrações"
        description="Conecte seu PDV com plataformas de delivery, maquininhas e ferramentas fiscais"
      />

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {integrations.map((item) => (
            <div
              key={item.slug}
              className="group relative flex flex-col rounded-xl border bg-card p-5 shadow-sm transition-shadow hover:shadow-md"
            >
              <Badge
                variant="secondary"
                className={`absolute top-4 right-4 text-[11px] font-medium ${item.categoryColor}`}
              >
                {item.category}
              </Badge>

              <div className="flex items-center gap-3 mb-4">
                <div className="h-12 w-12 shrink-0 rounded-lg border bg-white p-1.5 flex items-center justify-center">
                  {item.logo ? (
                    <img
                      src={item.logo}
                      alt={item.name}
                      className="h-full w-full object-contain"
                    />
                  ) : item.customIcon ? (
                    item.customIcon
                  ) : item.fallbackIcon ? (
                    <item.fallbackIcon className="h-7 w-7 text-muted-foreground" />
                  ) : null}
                </div>
                <h3 className="text-lg font-semibold leading-tight">{item.name}</h3>
              </div>

              <p className="text-sm text-muted-foreground mb-5 flex-1">
                {item.description}
              </p>

              <Button
                variant="outline"
                className="w-full gap-2"
                disabled={item.comingSoon}
                onClick={() => !item.comingSoon && navigate(`/pdv/integracoes/${item.slug}`)}
              >
                {item.comingSoon ? "Em Breve" : "Acessar"}
                {!item.comingSoon && <ArrowRight className="h-4 w-4" />}
              </Button>
            </div>
        ))}
      </div>
    </div>
  );
}
