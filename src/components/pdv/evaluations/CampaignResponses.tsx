import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Star, MessageSquare, Search, ChevronLeft, ChevronRight, User, Phone, Calendar } from "lucide-react";
import { useCampaignResponses } from "@/hooks/use-evaluation-campaigns";
import { AnswerValue } from "@/components/evaluations/AnswerValue";

interface Props {
  campaignId: string;
}

export function CampaignResponses({ campaignId }: Props) {
  const { data: responses, isLoading } = useCampaignResponses(campaignId);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [selectedResponse, setSelectedResponse] = useState<any | null>(null);
  const perPage = 10;

  const filtered = useMemo(() => {
    if (!responses) return [];
    if (!search.trim()) return responses;
    const q = search.toLowerCase();
    return responses.filter(
      (r) =>
        r.customer_name.toLowerCase().includes(q) ||
        r.customer_whatsapp.includes(q)
    );
  }, [responses, search]);

  const totalPages = Math.ceil(filtered.length / perPage);
  const paginated = filtered.slice(page * perPage, (page + 1) * perPage);

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando respostas...</p>;

  if (!responses || responses.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        Nenhuma resposta recebida ainda. Compartilhe o link da campanha com seus clientes.
      </p>
    );
  }

  const getAvgScore = (answers: any[]) => {
    if (!answers || answers.length === 0) return 0;
    const stars = answers.filter((a: any) => (a.question_type || "stars") === "stars");
    if (stars.length === 0) return 0;
    return stars.reduce((s: number, a: any) => s + a.score, 0) / stars.length;
  };

  const getNpsBadge = (nps: number | null) => {
    if (nps === null || nps === undefined) return <Badge variant="outline">—</Badge>;
    if (nps >= 9) return <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-200">{nps}</Badge>;
    if (nps >= 7) return <Badge className="bg-amber-500/15 text-amber-700 border-amber-200">{nps}</Badge>;
    return <Badge className="bg-red-500/15 text-red-700 border-red-200">{nps}</Badge>;
  };

  return (
    <div className="space-y-4">
      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold">{responses.length}</p>
            <p className="text-xs text-muted-foreground">Total de respostas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold flex items-center justify-center gap-1">
              {(() => {
                const stars = responses.flatMap((r) =>
                  (r.evaluation_answers as any[]).filter((a: any) => (a.question_type || "stars") === "stars")
                );
                const total = stars.reduce((a: number, b: any) => a + b.score, 0);
                return (total / Math.max(stars.length, 1)).toFixed(1);
              })()}
              <Star className="h-4 w-4 text-amber-500 fill-amber-500" />
            </p>
            <p className="text-xs text-muted-foreground">Média geral</p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome ou telefone..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          className="pl-9"
        />
      </div>

      {/* Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>WhatsApp</TableHead>
              <TableHead className="text-center">NPS</TableHead>
              <TableHead className="text-center">Média</TableHead>
              <TableHead className="text-right">Data</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginated.map((response) => {
              const avg = getAvgScore(response.evaluation_answers as any[]);
              return (
                <TableRow
                  key={response.id}
                  className="cursor-pointer"
                  onClick={() => setSelectedResponse(response)}
                >
                  <TableCell className="font-medium">{response.customer_name}</TableCell>
                  <TableCell className="text-muted-foreground">{response.customer_whatsapp}</TableCell>
                  <TableCell className="text-center">{getNpsBadge(response.nps_score)}</TableCell>
                  <TableCell className="text-center">
                    <span className="flex items-center justify-center gap-1">
                      {avg.toFixed(1)} <Star className="h-3 w-3 text-amber-500 fill-amber-500" />
                    </span>
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground text-sm">
                    {new Date(response.created_at).toLocaleDateString("pt-BR")}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {filtered.length} resultado{filtered.length !== 1 ? "s" : ""}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-muted-foreground">{page + 1} / {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      <Dialog open={!!selectedResponse} onOpenChange={(open) => !open && setSelectedResponse(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          {selectedResponse && (
            <>
              <DialogHeader>
                <DialogTitle className="text-lg">Detalhes da Avaliação</DialogTitle>
              </DialogHeader>

              <div className="space-y-5">
                {/* Customer info */}
                <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{selectedResponse.customer_name}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Phone className="h-3.5 w-3.5" />
                    <span>{selectedResponse.customer_whatsapp}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>Nascimento: {selectedResponse.customer_birth_date ? new Date(selectedResponse.customer_birth_date + "T12:00:00").toLocaleDateString("pt-BR") : "—"}</span>
                  </div>
                </div>

                {/* NPS */}
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <span className="text-sm font-medium">NPS Score</span>
                  {getNpsBadge(selectedResponse.nps_score)}
                </div>

                {/* Answers */}
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold">Respostas</h4>
                  {((selectedResponse.evaluation_answers as any[]) || []).map((answer: any) => (
                    <div key={answer.id} className="space-y-1.5 rounded-lg border p-3">
                      <p className="text-sm font-medium">
                        {answer.evaluation_campaign_questions?.question_text || "Pergunta não encontrada"}
                      </p>
                      <AnswerValue
                        questionType={answer.question_type}
                        score={answer.score}
                        selectedOptions={answer.selected_options}
                        comment={answer.comment}
                        textAnswer={answer.text_answer}
                      />
                    </div>
                  ))}
                </div>

                {/* Timestamp */}
                <p className="text-xs text-muted-foreground text-right">
                  Respondido em {new Date(selectedResponse.created_at).toLocaleString("pt-BR")}
                </p>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
