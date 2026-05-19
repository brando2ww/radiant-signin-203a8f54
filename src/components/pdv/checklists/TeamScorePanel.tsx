import { useState } from "react";
import { Loader2, ListChecks, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useOperatorRankingComparison, useBadgesSummary, ScorePeriodType } from "@/hooks/use-operator-scores";
import { ScoreOverview } from "./score/ScoreOverview";
import { ScorePodium } from "./score/ScorePodium";
import { ScoreRanking } from "./score/ScoreRanking";
import { ScoreEvolutionChart } from "./score/ScoreEvolutionChart";
import { BadgesSection } from "./score/BadgesSection";
import { ScoreFormulaInfo } from "./score/ScoreFormulaInfo";
import { DateRange } from "react-day-picker";
import { toLocalDateStr } from "@/lib/date";

interface TeamScorePanelProps {
  onNavigate?: (section: string) => void;
}

export function TeamScorePanel({ onNavigate }: TeamScorePanelProps) {
  const [period, setPeriod] = useState<ScorePeriodType>("week");
  const [customRange, setCustomRange] = useState<DateRange | undefined>();

  const customStart = customRange?.from ? toLocalDateStr(customRange.from) : undefined;
  const customEnd = customRange?.to ? toLocalDateStr(customRange.to) : undefined;

  const { data: ranking, isLoading } = useOperatorRankingComparison(period, customStart, customEnd);
  const badges = useBadgesSummary(ranking || []);

  const hasData = (ranking || []).some(r => r.totalExecutions > 0);

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ScoreOverview
        period={period}
        onPeriodChange={setPeriod}
        customRange={customRange}
        onCustomRangeChange={setCustomRange}
        ranking={ranking || []}
      />

      <ScorePodium ranking={ranking || []} />

      {!hasData ? (
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <p className="text-sm text-muted-foreground">
              O score começa a ser calculado assim que a equipe executar os primeiros checklists
            </p>
            <div className="flex justify-center gap-3">
              {onNavigate && (
                <>
                  <Button variant="outline" size="sm" onClick={() => onNavigate("hoje")}>
                    <ListChecks className="h-4 w-4 mr-1.5" />
                    Tarefas do Dia
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => onNavigate("equipe")}>
                    <Users className="h-4 w-4 mr-1.5" />
                    Cadastrar Equipe
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <ScoreRanking ranking={ranking || []} />
          <ScoreEvolutionChart ranking={ranking || []} />
          <BadgesSection badges={badges} />
        </>
      )}

      <ScoreFormulaInfo onNavigate={onNavigate} />
    </div>
  );
}
