import { useMemo, useState } from "react";
import { Gift, Search } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  useEvaluationCoupons,
  useEvaluationCampaignsList,
} from "@/hooks/use-evaluation-coupons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/pdv/shared/EmptyState";
import { ErrorState } from "@/components/pdv/shared/ErrorState";
import { formatBRL } from "@/lib/format";

export default function EvalCupons() {
  const [campaignId, setCampaignId] = useState<string>("none");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [search, setSearch] = useState("");

  const { data: campaigns = [] } = useEvaluationCampaignsList();
  const filters = {
    campaignId: campaignId === "none" ? null : campaignId,
    from: from ? new Date(from + "T00:00:00") : null,
    to: to ? new Date(to + "T23:59:59") : null,
  };
  const { data, isLoading, isError, refetch } = useEvaluationCoupons(filters);

  const filtered = useMemo(() => {
    if (!data) return [];
    if (!search.trim()) return data;
    const q = search.trim().toLowerCase();
    return data.filter(
      (c) =>
        c.coupon_code?.toLowerCase().includes(q) ||
        (c.customer_name || "").toLowerCase().includes(q) ||
        (c.customer_whatsapp || "").toLowerCase().includes(q)
    );
  }, [data, search]);

  function statusBadge(c: (typeof filtered)[number]) {
    if (c.is_redeemed) return <Badge variant="secondary">Usado</Badge>;
    if (c.coupon_expires_at && new Date(c.coupon_expires_at) < new Date())
      return <Badge variant="outline">Expirado</Badge>;
    return <Badge>Disponível</Badge>;
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Cupons de Avaliação</h1>
        <p className="text-sm text-muted-foreground">
          Acompanhe os cupons emitidos pelas suas campanhas de avaliação.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <div className="md:col-span-2 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por código, cliente ou telefone"
              className="pl-9"
            />
          </div>
          <Select value={campaignId} onValueChange={setCampaignId}>
            <SelectTrigger>
              <SelectValue placeholder="Campanha" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Todas as campanhas</SelectItem>
              {campaigns.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex gap-2">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : isError ? (
            <ErrorState onRetry={() => refetch()} />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Gift}
              title="Nenhum cupom encontrado"
              description="Os cupons gerados pelas campanhas aparecerão aqui."
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>WhatsApp</TableHead>
                    <TableHead>Campanha</TableHead>
                    <TableHead>Prêmio</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Gerado em</TableHead>
                    <TableHead>Validade</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono text-xs">{c.coupon_code}</TableCell>
                      <TableCell>{c.customer_name || "—"}</TableCell>
                      <TableCell>{c.customer_whatsapp || "—"}</TableCell>
                      <TableCell>{c.campaign_name || "—"}</TableCell>
                      <TableCell>{c.prize_name || "—"}</TableCell>
                      <TableCell>
                        {c.reward_type === "discount" && c.reward_value != null
                          ? formatBRL(c.reward_value)
                          : c.reward_type === "percentage" && c.reward_value != null
                          ? `${c.reward_value}%`
                          : "—"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {format(new Date(c.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                      </TableCell>
                      <TableCell className="text-xs">
                        {c.coupon_expires_at
                          ? format(new Date(c.coupon_expires_at), "dd/MM/yyyy", { locale: ptBR })
                          : "—"}
                      </TableCell>
                      <TableCell>{statusBadge(c)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
