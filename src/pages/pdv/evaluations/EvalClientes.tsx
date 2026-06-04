import { useMemo, useState } from "react";
import { Users, Cake, Download } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  useEvaluationCustomers,
  type EvaluationCustomer,
} from "@/hooks/use-evaluation-customers";
import { useEvaluationCampaignsList } from "@/hooks/use-evaluation-coupons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

function npsBadge(score: number | null) {
  if (score == null) return <Badge variant="outline">—</Badge>;
  if (score >= 9) return <Badge>Promotor ({score})</Badge>;
  if (score >= 7) return <Badge variant="secondary">Neutro ({score})</Badge>;
  return <Badge variant="destructive">Detrator ({score})</Badge>;
}

function exportToCsv(rows: EvaluationCustomer[]) {
  const headers = [
    "Nome",
    "WhatsApp",
    "Aniversário",
    "Último NPS",
    "Última avaliação",
    "Campanha",
    "Avaliações",
  ];
  const lines = rows.map((c) =>
    [
      c.name,
      c.whatsapp || "",
      c.birth_date ? format(new Date(c.birth_date), "dd/MM/yyyy") : "",
      c.lastNpsScore ?? "",
      c.lastEvaluationDate
        ? format(new Date(c.lastEvaluationDate), "dd/MM/yyyy HH:mm")
        : "",
      c.lastCampaignName || "",
      c.totalEvaluations,
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",")
  );
  const csv = [headers.join(","), ...lines].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `clientes-avaliadores-${format(new Date(), "yyyy-MM-dd")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function EvalClientes() {
  const [campaignId, setCampaignId] = useState<string>("none");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [onlyBirthdays, setOnlyBirthdays] = useState(false);
  const [search, setSearch] = useState("");

  const { data: campaigns = [] } = useEvaluationCampaignsList();
  const { data, isLoading, isError, refetch } = useEvaluationCustomers({
    campaignId: campaignId === "none" ? null : campaignId,
    from: from ? new Date(from + "T00:00:00") : null,
    to: to ? new Date(to + "T23:59:59") : null,
    onlyBirthdaysThisMonth: onlyBirthdays,
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    if (!search.trim()) return data;
    const q = search.trim().toLowerCase();
    return data.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.whatsapp || "").toLowerCase().includes(q)
    );
  }, [data, search]);

  const totalEvaluators = data?.length ?? 0;
  const avgNps = useMemo(() => {
    if (!data || data.length === 0) return 0;
    const scored = data.filter((c) => c.lastNpsScore != null);
    if (scored.length === 0) return 0;
    return scored.reduce((s, c) => s + (c.lastNpsScore || 0), 0) / scored.length;
  }, [data]);
  const birthdays = data?.filter((c) => c.isBirthdayThisMonth) ?? [];

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Clientes Avaliadores</h1>
          <p className="text-sm text-muted-foreground">
            Quem respondeu suas pesquisas de avaliação.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => exportToCsv(filtered)}
          disabled={filtered.length === 0}
        >
          <Download className="h-4 w-4 mr-2" /> Exportar CSV
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <CardContent className="py-4 px-4">
            <p className="text-2xl font-bold">{totalEvaluators}</p>
            <p className="text-xs text-muted-foreground">Total de avaliadores</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 px-4">
            <p className="text-2xl font-bold">{avgNps.toFixed(1)}</p>
            <p className="text-xs text-muted-foreground">NPS médio (última avaliação)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 px-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-muted">
              <Cake className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold leading-none">{birthdays.length}</p>
              <p className="text-xs text-muted-foreground mt-1">Aniversariantes do mês</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou telefone"
            className="md:col-span-2"
          />
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
          <div className="flex items-center gap-2 md:col-span-4">
            <Checkbox
              id="onlyBirthdays"
              checked={onlyBirthdays}
              onCheckedChange={(v) => setOnlyBirthdays(!!v)}
            />
            <Label htmlFor="onlyBirthdays" className="text-sm cursor-pointer">
              Somente aniversariantes do mês
            </Label>
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
              icon={Users}
              title="Nenhum cliente encontrado"
              description="Quando seus clientes responderem avaliações, eles aparecerão aqui."
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead>NPS</TableHead>
                    <TableHead>Última avaliação</TableHead>
                    <TableHead>Campanha</TableHead>
                    <TableHead className="text-right"># Avaliações</TableHead>
                    <TableHead>Aniversariante</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((c) => (
                    <TableRow key={c.key}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell>{c.whatsapp || "—"}</TableCell>
                      <TableCell>{npsBadge(c.lastNpsScore)}</TableCell>
                      <TableCell className="text-xs">
                        {format(new Date(c.lastEvaluationDate), "dd/MM/yyyy HH:mm", {
                          locale: ptBR,
                        })}
                      </TableCell>
                      <TableCell>{c.lastCampaignName || "—"}</TableCell>
                      <TableCell className="text-right">{c.totalEvaluations}</TableCell>
                      <TableCell>
                        {c.isBirthdayThisMonth ? (
                          <Badge variant="secondary">
                            <Cake className="h-3 w-3 mr-1" /> Sim
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
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
