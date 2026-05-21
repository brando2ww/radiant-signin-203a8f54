import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { Search, ThumbsUp, Minus, ThumbsDown, Eye } from "lucide-react";
import ClientDetailDialog from "@/components/pdv/evaluations/ClientDetailDialog";
import type { EvaluationWithAnswers } from "@/hooks/use-customer-evaluations";

export type NpsCategory = "promoters" | "neutrals" | "detractors" | "all";

interface Props {
  category: NpsCategory | null;
  evaluations: EvaluationWithAnswers[];
  onClose: () => void;
}

const categoryConfig = {
  promoters: { label: "Promotores", icon: ThumbsUp, color: "text-emerald-600", scoreLabel: "NPS ≥ 9" },
  neutrals: { label: "Neutros", icon: Minus, color: "text-amber-600", scoreLabel: "NPS 7-8" },
  detractors: { label: "Detratores", icon: ThumbsDown, color: "text-destructive", scoreLabel: "NPS ≤ 6" },
  all: { label: "Todas as Respostas", icon: Eye, color: "text-foreground", scoreLabel: "Todas" },
};

export default function NPSDetailDialog({ category, evaluations, onClose }: Props) {
  const [search, setSearch] = useState("");
  const [selectedClient, setSelectedClient] = useState<{
    name: string;
    whatsapp: string;
    birthDate: string | null;
    totalEvaluations: number;
    avgNps: number | null;
    firstEvaluation: string;
    lastEvaluation: string;
    npsCategory: "promoter" | "neutral" | "detractor" | "none";
    evaluations: EvaluationWithAnswers[];
  } | null>(null);

  const filtered = useMemo(() => {
    if (!category) return [];
    const list = evaluations.filter(e => {
      if (category === "all") return true;
      if (e.nps_score == null) return false;
      if (category === "promoters") return e.nps_score >= 9;
      if (category === "neutrals") return e.nps_score >= 7 && e.nps_score <= 8;
      return e.nps_score <= 6;
    });
    const term = search.trim().toLowerCase();
    const searched = term
      ? list.filter(e =>
          e.customer_name.toLowerCase().includes(term) ||
          e.customer_whatsapp.includes(term)
        )
      : list;
    return [...searched].sort((a, b) => {
      const da = a.evaluation_date || a.created_at;
      const db = b.evaluation_date || b.created_at;
      return db.localeCompare(da);
    });
  }, [category, evaluations, search]);

  const handleViewClient = (evaluation: EvaluationWithAnswers) => {
    const clientEvals = evaluations.filter(
      e => e.customer_whatsapp === evaluation.customer_whatsapp
    );
    const npsScores = clientEvals.filter(e => e.nps_score != null).map(e => e.nps_score!);
    const avgNps = npsScores.length > 0 ? npsScores.reduce((a, b) => a + b, 0) / npsScores.length : null;
    const dates = clientEvals.map(e => e.evaluation_date || e.created_at);
    const npsCategory = avgNps == null ? "none" as const
      : avgNps >= 9 ? "promoter" as const
      : avgNps >= 7 ? "neutral" as const
      : "detractor" as const;

    setSelectedClient({
      name: evaluation.customer_name,
      whatsapp: evaluation.customer_whatsapp,
      birthDate: evaluation.customer_birth_date || null,
      totalEvaluations: clientEvals.length,
      avgNps,
      firstEvaluation: dates.sort()[0],
      lastEvaluation: dates.sort().reverse()[0],
      npsCategory,
      evaluations: clientEvals,
    });
  };

  if (!category) return null;
  const config = categoryConfig[category];
  const Icon = config.icon;

  return (
    <>
      <Dialog open={!!category} onOpenChange={(open) => { if (!open) { setSearch(""); onClose(); } }}>
        <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Icon className={`h-5 w-5 ${config.color}`} />
              <span className={config.color}>{config.label}</span>
              <span className="text-sm font-normal text-muted-foreground">({filtered.length} • {config.scoreLabel})</span>
            </DialogTitle>
          </DialogHeader>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome ou telefone..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="overflow-auto flex-1 -mx-6 px-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>WhatsApp</TableHead>
                  <TableHead className="text-center">NPS</TableHead>
                  <TableHead>Comentário</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead className="text-center">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      Nenhum registro encontrado
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map(e => (
                    <TableRow key={e.id}>
                      <TableCell className="font-medium">{e.customer_name}</TableCell>
                      <TableCell>
                        <a
                          href={`https://wa.me/${e.customer_whatsapp.replace(/\D/g, "")}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline text-sm"
                        >
                          {e.customer_whatsapp}
                        </a>
                      </TableCell>
                      <TableCell className={`text-center font-bold ${config.color}`}>{e.nps_score ?? "—"}</TableCell>
                      <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">
                        {e.nps_comment || "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {format(new Date(e.evaluation_date || e.created_at), "dd/MM/yyyy")}
                      </TableCell>
                      <TableCell className="text-center">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleViewClient(e)}
                          title="Visualizar detalhes"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>

      <ClientDetailDialog
        open={!!selectedClient}
        onOpenChange={(open) => { if (!open) setSelectedClient(null); }}
        client={selectedClient}
      />
    </>
  );
}