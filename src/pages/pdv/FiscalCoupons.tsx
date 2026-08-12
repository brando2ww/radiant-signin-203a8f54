import { useMemo, useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { RefreshCw, Download } from "lucide-react";
import { format, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatBRL } from "@/lib/format";
import { useFiscalCoupons, type FiscalCoupon, type FiscalCouponsFilter } from "@/hooks/use-fiscal-coupons";
import {
  useCancelNFCe,
  useCheckNFCeStatus,
  useResendNFCe,
} from "@/hooks/use-fiscal-coupon-actions";
import { FiscalCouponsHeader } from "@/components/pdv/fiscal-coupons/FiscalCouponsHeader";
import { FiscalCouponsFilters } from "@/components/pdv/fiscal-coupons/FiscalCouponsFilters";
import { FiscalCouponsTable } from "@/components/pdv/fiscal-coupons/FiscalCouponsTable";
import { FiscalCouponDetailDialog } from "@/components/pdv/fiscal-coupons/FiscalCouponDetailDialog";
import { CancelNFCeDialog } from "@/components/pdv/fiscal-coupons/CancelNFCeDialog";
import { toast } from "sonner";

export default function FiscalCoupons() {
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState<FiscalCouponsFilter>({
    startDate: startOfMonth(new Date()),
    endDate: new Date(),
    status: "all",
    ambiente: "all",
    paymentMethod: "all",
    search: "",
  });

  const { data: coupons = [], isLoading, refetch, isFetching } = useFiscalCoupons(filter);
  const checkStatus = useCheckNFCeStatus();
  const resend = useResendNFCe();

  const [detailCoupon, setDetailCoupon] = useState<FiscalCoupon | null>(null);
  const [cancelCoupon, setCancelCoupon] = useState<FiscalCoupon | null>(null);

  // Abrir detalhe via querystring (?emission_id=...)
  useEffect(() => {
    const id = params.get("emission_id");
    if (id && coupons.length) {
      const found = coupons.find((c) => c.id === id);
      if (found) setDetailCoupon(found);
    }
  }, [params, coupons]);

  const handleExportCsv = () => {
    if (!coupons.length) {
      toast.info("Sem cupons para exportar");
      return;
    }
    const headers = [
      "Numero", "Serie", "Data", "Status", "Ambiente", "Cliente CPF", "Cliente Nome",
      "Forma Pagamento", "Valor Total", "Chave Acesso", "Protocolo",
    ];
    const rows = coupons.map((c) => [
      c.numero ?? "",
      c.serie ?? "",
      format(new Date(c.data_emissao), "dd/MM/yyyy HH:mm", { locale: ptBR }),
      c.status,
      c.ambiente,
      c.customer_cpf ?? "",
      (c.customer_name ?? "").replace(/[;\n]/g, " "),
      c.forma_pagamento ?? "",
      formatBRL(c.valor_total),
      c.chave_acesso ?? "",
      c.protocolo_autorizacao ?? "",
    ]);
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cupons-fiscais-${format(new Date(), "yyyy-MM-dd-HHmm")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const closeDetail = () => {
    setDetailCoupon(null);
    if (params.get("emission_id")) {
      params.delete("emission_id");
      setParams(params, { replace: true });
    }
  };

  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex-1 p-6 space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Cupons Fiscais</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie os cupons NFC-e enviados à Receita: consulte status, baixe DANFE/XML, cancele ou reenvie.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <Button variant="outline" onClick={handleExportCsv}>
            <Download className="w-4 h-4 mr-2" /> Exportar CSV
          </Button>
        </div>
      </div>

      <FiscalCouponsHeader coupons={coupons} />
      <FiscalCouponsFilters filter={filter} onChange={setFilter} />

      <FiscalCouponsTable
        coupons={coupons}
        isLoading={isLoading}
        onView={(c) => setDetailCoupon(c)}
        onCancel={(c) => setCancelCoupon(c)}
        onCheckStatus={(c) => checkStatus.mutate({ ref: c.referencia_focusnfe })}
        onResend={(c) => resend.mutate({ nota_id: c.id })}
      />

      <FiscalCouponDetailDialog
        coupon={detailCoupon}
        open={!!detailCoupon}
        onClose={closeDetail}
      />
      <CancelNFCeDialog
        coupon={cancelCoupon}
        open={!!cancelCoupon}
        onClose={() => setCancelCoupon(null)}
      />
    </div>
  );
}
