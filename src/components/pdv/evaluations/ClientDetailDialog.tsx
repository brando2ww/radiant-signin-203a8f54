import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { WhatsAppIcon } from "@/components/icons/WhatsAppIcon";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar, MessageSquare, Star, User } from "lucide-react";
import { formatPhoneForWhatsApp } from "@/lib/whatsapp-message";
import { useEvaluationQuestionInfo } from "@/hooks/use-evaluation-report-helpers";
import { AnswerValue } from "@/components/evaluations/AnswerValue";
import type { EvaluationWithAnswers } from "@/hooks/use-customer-evaluations";

interface ClientDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: {
    name: string;
    whatsapp: string;
    birthDate: string | null;
    totalEvaluations: number;
    avgNps: number | null;
    firstEvaluation: string;
    lastEvaluation: string;
    npsCategory: "promoter" | "neutral" | "detractor" | "none";
    evaluations: EvaluationWithAnswers[];
  } | null;
}

export default function ClientDetailDialog({ open, onOpenChange, client }: ClientDetailDialogProps) {
  const { data: questionInfo } = useEvaluationQuestionInfo();

  if (!client) return null;

  const npsColor = {
    promoter: "text-emerald-600",
    neutral: "text-amber-600",
    detractor: "text-destructive",
    none: "text-muted-foreground",
  }[client.npsCategory];

  const handleWhatsApp = () => {
    const phone = formatPhoneForWhatsApp(client.whatsapp);
    window.open(`https://wa.me/${phone}`, "_blank");
  };

  const getNpsBadge = (nps: number | null) => {
    if (nps === null || nps === undefined) return null;
    if (nps >= 9) return <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-200">NPS {nps}</Badge>;
    if (nps >= 7) return <Badge className="bg-amber-500/15 text-amber-700 border-amber-200">NPS {nps}</Badge>;
    return <Badge className="bg-red-500/15 text-red-700 border-red-200">NPS {nps}</Badge>;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            {client.name}
          </DialogTitle>
          <DialogDescription>Histórico completo do cliente</DialogDescription>
        </DialogHeader>

        {/* Client info */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="space-y-1">
            <span className="text-muted-foreground">WhatsApp</span>
            <p className="font-medium">{client.whatsapp}</p>
          </div>
          <div className="space-y-1">
            <span className="text-muted-foreground">Aniversário</span>
            <p className="font-medium">
              {client.birthDate
                ? format(new Date(client.birthDate), "dd/MM/yyyy", { locale: ptBR })
                : "—"}
            </p>
          </div>
          <div className="space-y-1">
            <span className="text-muted-foreground">Cadastro</span>
            <p className="font-medium">
              {format(new Date(client.firstEvaluation), "dd/MM/yyyy", { locale: ptBR })}
            </p>
          </div>
          <div className="space-y-1">
            <span className="text-muted-foreground">NPS Médio</span>
            <p className={`font-bold ${npsColor}`}>
              {client.avgNps !== null ? client.avgNps.toFixed(1) : "N/A"}
            </p>
          </div>
        </div>

        <Button variant="outline" size="sm" className="w-fit gap-2" onClick={handleWhatsApp}>
          <WhatsAppIcon size={16} className="text-green-600" />
          Enviar mensagem
        </Button>

        {/* Detailed evaluations */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-1 -mx-1 px-1">
          <h4 className="text-sm font-semibold text-muted-foreground flex items-center gap-1 sticky top-0 bg-background py-1">
            <Calendar className="h-4 w-4" />
            {client.totalEvaluations} avaliação{client.totalEvaluations !== 1 ? "ões" : ""}
          </h4>

          {client.evaluations.map((ev) => {
            const starAnswers = ev.evaluation_answers.filter(
              (a) => (questionInfo?.get(a.question_id)?.type || "stars") === "stars"
            );
            const avgScore =
              starAnswers.length > 0
                ? starAnswers.reduce((s, a) => s + a.score, 0) / starAnswers.length
                : null;

            return (
              <div
                key={ev.id}
                className="border border-border rounded-lg p-3 space-y-3 bg-muted/20"
              >
                {/* Header: date + badges */}
                <div className="flex items-center justify-between text-sm gap-2 flex-wrap">
                  <span className="text-muted-foreground">
                    {format(new Date(ev.evaluation_date), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  </span>
                  <div className="flex items-center gap-2">
                    {avgScore !== null && (
                      <Badge variant="outline" className="gap-1">
                        <Star className="h-3 w-3 text-amber-500 fill-amber-500" />
                        {avgScore.toFixed(1)}
                      </Badge>
                    )}
                    {getNpsBadge(ev.nps_score)}
                  </div>
                </div>

                {/* General NPS comment */}
                {ev.nps_comment && (
                  <div className="flex items-start gap-1.5 text-sm bg-muted/50 p-2 rounded">
                    <MessageSquare className="h-3.5 w-3.5 shrink-0 mt-0.5 text-muted-foreground" />
                    <span>{ev.nps_comment}</span>
                  </div>
                )}

                {/* Per-question answers */}
                {ev.evaluation_answers.length > 0 ? (
                  <div className="space-y-2">
                    {ev.evaluation_answers.map((answer) => {
                      const info = questionInfo?.get(answer.question_id);
                      return (
                        <div key={answer.id} className="space-y-1.5 rounded-md border border-border/60 bg-background p-2.5">
                          <p className="text-sm font-medium leading-snug">
                            {info?.text || "Pergunta não encontrada"}
                          </p>
                          <AnswerValue
                            questionType={info?.type}
                            score={answer.score}
                            selectedOptions={answer.selected_options}
                            comment={answer.comment}
                            textAnswer={(answer as any).text_answer}
                          />
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Sem respostas para esta avaliação.</p>
                )}
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
