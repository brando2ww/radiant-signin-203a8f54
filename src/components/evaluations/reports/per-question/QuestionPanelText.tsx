import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { QuestionAnswer } from "@/hooks/use-campaign-question-analytics";

interface Props {
  answers: QuestionAnswer[];
}

export function QuestionPanelText({ answers }: Props) {
  const [page, setPage] = useState(0);
  const pageSize = 20;

  const valid = useMemo(
    () => answers
      .filter(a => (a.text_answer && a.text_answer.trim()) || (a.comment && a.comment.trim()))
      .sort((a, b) => b.evaluation_date.localeCompare(a.evaluation_date)),
    [answers]
  );

  const pages = Math.ceil(valid.length / pageSize);
  const pageRows = valid.slice(page * pageSize, (page + 1) * pageSize);

  if (valid.length === 0) {
    return <p className="text-sm text-muted-foreground py-6 text-center">Sem respostas no período.</p>;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Total de respostas</p>
          <p className="text-4xl font-bold text-foreground">{valid.length}</p>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {pageRows.map((r, i) => (
          <div key={i} className="rounded-lg border border-border bg-card p-3">
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-xs text-muted-foreground">
                {format(parseISO(r.evaluation_date), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              </span>
              {r.customer_name && (
                <span className="text-xs font-medium text-foreground">{r.customer_name}</span>
              )}
            </div>
            <p className="text-sm text-foreground whitespace-pre-wrap">
              {r.text_answer || r.comment}
            </p>
          </div>
        ))}
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Página {page + 1} de {pages}</span>
          <div className="flex gap-1">
            <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Anterior</Button>
            <Button size="sm" variant="outline" disabled={page >= pages - 1} onClick={() => setPage(p => p + 1)}>Próxima</Button>
          </div>
        </div>
      )}
    </div>
  );
}
