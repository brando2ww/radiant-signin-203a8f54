import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDeliveryFunnel } from "@/hooks/use-delivery-funnel";
import { Eye, ShoppingCart, CheckCircle2, TrendingDown, Loader2, ChevronDown, ArrowRight } from "lucide-react";

interface PurchaseFunnelProps {
  userId: string;
  startDate: Date;
  endDate: Date;
}

export const PurchaseFunnel = ({ userId, startDate, endDate }: PurchaseFunnelProps) => {
  const { data, isLoading } = useDeliveryFunnel(userId, startDate, endDate);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const steps = [
    {
      label: "Visualizaram o cardápio",
      value: data.pageViews,
      icon: Eye,
      widthPercent: 100,
    },
    {
      label: "Adicionaram ao carrinho",
      value: data.addToCarts,
      icon: ShoppingCart,
      widthPercent: 65,
    },
    {
      label: "Converteram (compraram)",
      value: data.purchases,
      icon: CheckCircle2,
      widthPercent: 35,
    },
  ];

  const transitions = [
    {
      from: "Visualização",
      to: "Carrinho",
      rate: data.viewToCartRate,
    },
    {
      from: "Carrinho",
      to: "Compra",
      rate: data.cartToPurchaseRate,
    },
  ];

  const benchmark = (rate: number, min: number, max: number) => {
    if (rate >= min && rate <= max) return { label: "saudável", color: "text-emerald-600 dark:text-emerald-500" };
    if (rate < min) return { label: "abaixo do ideal", color: "text-destructive" };
    return { label: "acima do esperado", color: "text-emerald-600 dark:text-emerald-500" };
  };

  return (
    <div id="funnel" className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingDown className="h-5 w-5" />
            Funil de Compra
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center gap-1">
            {steps.map((step, index) => {
              const Icon = step.icon;
              const prevValue = index > 0 ? steps[index - 1].value : null;
              const dropRate = prevValue && prevValue > 0
                ? (((prevValue - step.value) / prevValue) * 100).toFixed(1)
                : null;
              const percentage = data.pageViews > 0
                ? ((step.value / data.pageViews) * 100).toFixed(1)
                : "0";

              return (
                <div key={step.label} className="w-full flex flex-col items-center">
                  {index > 0 && (
                    <div className="flex items-center gap-2 py-1.5 text-muted-foreground">
                      <ChevronDown className="h-4 w-4" />
                      {dropRate && (
                        <span className="text-xs font-medium">
                          -{dropRate}% de perda
                        </span>
                      )}
                      <ChevronDown className="h-4 w-4" />
                    </div>
                  )}

                  <div className="w-full flex items-center justify-between px-2 mb-1">
                    <div className="flex items-center gap-2 text-sm">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium text-foreground">{step.label}</span>
                    </div>
                    <span className="font-bold text-lg text-foreground">{step.value}</span>
                  </div>

                  <div
                    className="relative h-10 rounded-md bg-primary/15 border border-primary/20 flex items-center justify-center transition-all duration-500"
                    style={{ width: `${step.widthPercent}%`, minWidth: "120px" }}
                  >
                    <div className="absolute inset-0 rounded-md bg-primary/20" />
                    <span className="relative text-sm font-semibold text-foreground">
                      {percentage}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          {
            icon1: Eye,
            icon2: ShoppingCart,
            label: "Visualização → Carrinho",
            rate: data.viewToCartRate,
            min: 25,
            max: 35,
            hint: "Taxa saudável: 25-35%",
          },
          {
            icon1: ShoppingCart,
            icon2: CheckCircle2,
            label: "Carrinho → Compra",
            rate: data.cartToPurchaseRate,
            min: 60,
            max: 75,
            hint: "Taxa saudável: 60-75%",
          },
          {
            icon1: Eye,
            icon2: CheckCircle2,
            label: "Conversão Geral",
            rate: data.overallConversionRate,
            min: 2,
            max: 5,
            hint: "Taxa saudável: 2-5%",
          },
        ].map((c, i) => {
          const b = benchmark(c.rate, c.min, c.max);
          const Icon1 = c.icon1;
          const Icon2 = c.icon2;
          return (
            <Card key={i}>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  <Icon1 className="h-3.5 w-3.5" />
                  <ArrowRight className="h-3 w-3" />
                  <Icon2 className="h-3.5 w-3.5" />
                </div>
                <p className="text-xs text-muted-foreground">{c.label}</p>
                <p className={`text-2xl font-bold ${i === 2 ? "text-primary" : ""}`}>
                  {c.rate.toFixed(1)}%
                </p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {c.hint} · <span className={b.color}>{b.label}</span>
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

