import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { DatePickerWithRange } from "@/components/ui/date-range-picker";
import { DateRange } from "react-day-picker";
import { format, subDays, startOfMonth } from "date-fns";
import { useEvaluationCampaigns } from "@/hooks/use-evaluation-campaigns";
import { useCampaignQuestionAnalytics } from "@/hooks/use-campaign-question-analytics";
import { QuestionPanelStars } from "@/components/evaluations/reports/per-question/QuestionPanelStars";
import { QuestionPanelChoice } from "@/components/evaluations/reports/per-question/QuestionPanelChoice";
import { QuestionPanelText } from "@/components/evaluations/reports/per-question/QuestionPanelText";
import { MessageSquare, Star, ListChecks, Type } from "lucide-react";

type Preset = "7d" | "30d" | "month" | "custom";

function presetRange(p: Preset): DateRange | undefined {
  const today = new Date();
  if (p === "7d") return { from: subDays(today, 6), to: today };
  if (p === "30d") return { from: subDays(today, 29), to: today };
  if (p === "month") return { from: startOfMonth(today), to: today };
  return undefined;
}

function questionTypeMeta(type: string) {
  if (type === "stars" || type === "nps" || type === "scale") {
    return { label: "Nota", icon: Star };
  }
  if (type === "multiple_choice" || type === "single_choice" || type === "choice") {
    return { label: "Múltipla escolha", icon: ListChecks };
  }
  return { label: "Texto livre", icon: Type };
}

function isStarsType(t: string) {
  return t === "stars" || t === "nps" || t === "scale";
}
function isChoiceType(t: string) {
  return t === "multiple_choice" || t === "single_choice" || t === "choice";
}

export default function ReportPerQuestion() {
  const { data: campaigns, isLoading: loadingCampaigns } = useEvaluationCampaigns();
  const [campaignId, setCampaignId] = useState<string>("");
  const [preset, setPreset] = useState<Preset>("30d");
  const [customRange, setCustomRange] = useState<DateRange | undefined>(presetRange("30d"));

  const range = preset === "custom" ? customRange : presetRange(preset);
  const startDate = range?.from ? format(range.from, "yyyy-MM-dd") : undefined;
  const endDate = range?.to ? format(range.to, "yyyy-MM-dd") : undefined;

  // auto-select first active campaign
  const effectiveCampaignId = campaignId || campaigns?.find(c => c.is_active)?.id || campaigns?.[0]?.id || "";

  const { data, isLoading } = useCampaignQuestionAnalytics(
    effectiveCampaignId || null,
    startDate,
    endDate,
  );

  const summaries = useMemo(() => {
    return (data || []).map(({ question, answers }) => {
      const meta = questionTypeMeta(question.question_type);
      let kpi = `${answers.length} respostas`;
      if (isStarsType(question.question_type) && answers.length > 0) {
        const scores = answers.map(a => a.score).filter((s): s is number => typeof s === "number");
        if (scores.length > 0) {
          const max = Math.max(...scores);
          const scale10 = max > 5;
          const promoters = scores.filter(s => scale10 ? s >= 9 : s >= 5).length;
          const detractors = scores.filter(s => scale10 ? s <= 6 : s <= 3).length;
          const nps = Math.round(((promoters - detractors) / scores.length) * 100);
          kpi = `NPS ${nps} · ${scores.length} respostas`;
        }
      } else if (isChoiceType(question.question_type) && answers.length > 0) {
        const counts = new Map<string, number>();
        answers.forEach(a => (a.selected_options || []).forEach(o => counts.set(o, (counts.get(o) || 0) + 1)));
        const top = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0];
        if (top) kpi = `Top: ${top[0]} · ${answers.length} respostas`;
      }
      return { question, answers, meta, kpi };
    });
  }, [data]);

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <MessageSquare className="h-6 w-6" /> Análise por Pergunta
        </h1>
        <p className="text-sm text-muted-foreground">Métricas detalhadas para cada pergunta de uma campanha.</p>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="p-4 flex flex-col md:flex-row md:items-end gap-3 md:gap-4">
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Campanha</label>
            <Select value={effectiveCampaignId} onValueChange={setCampaignId}>
              <SelectTrigger>
                <SelectValue placeholder={loadingCampaigns ? "Carregando..." : "Selecione uma campanha"} />
              </SelectTrigger>
              <SelectContent>
                {(campaigns || []).map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}{!c.is_active && " (inativa)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-[180px]">
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Período</label>
            <Select value={preset} onValueChange={(v) => setPreset(v as Preset)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">Últimos 7 dias</SelectItem>
                <SelectItem value="30d">Últimos 30 dias</SelectItem>
                <SelectItem value="month">Mês atual</SelectItem>
                <SelectItem value="custom">Personalizado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {preset === "custom" && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Datas</label>
              <DatePickerWithRange date={customRange} setDate={setCustomRange} />
            </div>
          )}
        </CardContent>
      </Card>

      {!effectiveCampaignId ? (
        <p className="text-sm text-muted-foreground text-center py-16">
          {loadingCampaigns ? "Carregando campanhas..." : "Nenhuma campanha disponível."}
        </p>
      ) : isLoading ? (
        <p className="text-sm text-muted-foreground text-center py-16">Carregando análise...</p>
      ) : summaries.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-16">Esta campanha não tem perguntas ativas.</p>
      ) : (
        <Accordion type="multiple" className="space-y-2">
          {summaries.map(({ question, answers, meta, kpi }) => {
            const Icon = meta.icon;
            return (
              <AccordionItem
                key={question.id}
                value={question.id}
                className="border border-border rounded-lg bg-card px-3"
              >
                <AccordionTrigger className="hover:no-underline py-3">
                  <div className="flex flex-1 items-center gap-3 text-left">
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{question.question_text}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{kpi}</p>
                    </div>
                    <Badge variant="secondary" className="ml-2 shrink-0">{meta.label}</Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pt-2 pb-4">
                  {isStarsType(question.question_type) ? (
                    <QuestionPanelStars answers={answers} />
                  ) : isChoiceType(question.question_type) ? (
                    <QuestionPanelChoice answers={answers} question={question} />
                  ) : (
                    <QuestionPanelText answers={answers} />
                  )}
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}
    </div>
  );
}
