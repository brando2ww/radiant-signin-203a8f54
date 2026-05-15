import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LabelList } from "recharts";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { QuestionAnswer, CampaignQuestionMeta } from "@/hooks/use-campaign-question-analytics";

interface Props {
  answers: QuestionAnswer[];
  question: CampaignQuestionMeta;
}

export function QuestionPanelChoice({ answers, question }: Props) {
  const [page, setPage] = useState(0);
  const pageSize = 20;
  const data = useMemo(() => {
    const counts = new Map<string, number>();
    (question.options || []).forEach(o => counts.set(o, 0));
    let total = 0;
    answers.forEach(a => {
      const opts = a.selected_options || [];
      if (opts.length === 0 && a.text_answer) {
        counts.set(a.text_answer, (counts.get(a.text_answer) || 0) + 1);
        total++;
      } else {
        opts.forEach(o => {
          counts.set(o, (counts.get(o) || 0) + 1);
        });
        if (opts.length > 0) total++;
      }
    });
    const arr = Array.from(counts.entries())
      .map(([option, count]) => ({
        option,
        count,
        pct: total > 0 ? Math.round((count / total) * 100) : 0,
        label: `${count} (${total > 0 ? Math.round((count / total) * 100) : 0}%)`,
      }))
      .sort((a, b) => b.count - a.count);
    return { rows: arr, total };
  }, [answers, question.options]);

  if (data.total === 0) {
    return <p className="text-sm text-muted-foreground py-6 text-center">Sem respostas no período.</p>;
  }

  const top = data.rows[0];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Total de respostas</p>
            <p className="text-4xl font-bold text-foreground">{data.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Mais escolhida</p>
            <p className="text-2xl font-bold text-foreground truncate">{top?.option || "—"}</p>
            <p className="text-sm text-muted-foreground">{top?.count} respostas ({top?.pct}%)</p>
          </CardContent>
        </Card>
      </div>

      <div className="rounded-lg border border-border bg-card p-3">
        <ResponsiveContainer width="100%" height={Math.max(200, data.rows.length * 44)}>
          <BarChart data={data.rows} layout="vertical" margin={{ left: 10, right: 60 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
            <XAxis type="number" allowDecimals={false} />
            <YAxis type="category" dataKey="option" width={180} tick={{ fontSize: 12 }} />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d: any = payload[0].payload;
                return (
                  <div className="rounded-lg border bg-background p-2 shadow-md text-sm">
                    <p className="font-medium">{d.option}</p>
                    <p className="text-xs">{d.count} respostas — {d.pct}%</p>
                  </div>
                );
              }}
            />
            <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]}>
              <LabelList dataKey="label" position="right" className="fill-foreground" style={{ fontSize: 11 }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
