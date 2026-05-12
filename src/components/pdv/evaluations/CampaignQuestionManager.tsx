import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, GripVertical, FileDown, Star, List, CheckSquare, MessageSquare, Pencil } from "lucide-react";
import { toast } from "sonner";
import {
  useCampaignQuestions,
  useCreateCampaignQuestion,
  useUpdateCampaignQuestion,
  useDeleteCampaignQuestion,
} from "@/hooks/use-evaluation-campaigns";
import { QuestionFormDialog } from "./QuestionFormDialog";

const RESTAURANT_TEMPLATES: { text: string; type: string; options?: string[] }[] = [
  { text: "Como avalia a qualidade da comida?", type: "stars" },
  { text: "O atendimento foi satisfatório?", type: "stars" },
  { text: "O ambiente estava agradável?", type: "stars" },
  { text: "O tempo de espera foi adequado?", type: "stars" },
  { text: "A relação custo-benefício foi justa?", type: "stars" },
  { text: "A higiene do local estava adequada?", type: "stars" },
  {
    text: "Como conheceu nosso restaurante?",
    type: "single_choice",
    options: ["Instagram", "Indicação de amigos", "Google", "Passou na frente", "iFood/Delivery", "Outro"],
  },
  {
    text: "O que mais gostou?",
    type: "multiple_choice",
    options: ["Comida", "Atendimento", "Ambiente", "Preço", "Localização", "Rapidez"],
  },
];

const QUESTION_TYPE_LABELS: Record<string, { label: string; icon: React.ReactNode }> = {
  stars: { label: "Estrelas (1-5)", icon: <Star className="h-3.5 w-3.5" /> },
  single_choice: { label: "Escolha única", icon: <List className="h-3.5 w-3.5" /> },
  multiple_choice: { label: "Múltipla escolha", icon: <CheckSquare className="h-3.5 w-3.5" /> },
  free_text: { label: "Texto livre", icon: <MessageSquare className="h-3.5 w-3.5" /> },
};

interface Props {
  campaignId: string;
}

export function CampaignQuestionManager({ campaignId }: Props) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<{
    id: string;
    question_text: string;
    question_type: string;
    options?: string[];
    placeholder?: string | null;
    is_required?: boolean;
    max_length?: number | null;
  } | null>(null);

  const { data: questions, isLoading } = useCampaignQuestions(campaignId);
  const createQuestion = useCreateCampaignQuestion();
  const updateQuestion = useUpdateCampaignQuestion();
  const deleteQuestion = useDeleteCampaignQuestion();

  const handleSubmitQuestion = (data: { question_text: string; question_type: string; options?: string[]; placeholder?: string | null; is_required?: boolean; max_length?: number }) => {
    if (editingQuestion) {
      updateQuestion.mutate(
        {
          id: editingQuestion.id,
          campaign_id: campaignId,
          question_text: data.question_text,
          question_type: data.question_type,
          options: data.options || null,
          placeholder: data.placeholder ?? null,
          is_required: !!data.is_required,
          max_length: data.max_length ?? 500,
        },
        {
          onSuccess: () => {
            setDialogOpen(false);
            setEditingQuestion(null);
          },
        }
      );
    } else {
      createQuestion.mutate(
        {
          campaign_id: campaignId,
          question_text: data.question_text,
          order_position: (questions?.length || 0) + 1,
          question_type: data.question_type,
          options: data.options,
          placeholder: data.placeholder ?? null,
          is_required: !!data.is_required,
          max_length: data.max_length ?? 500,
        },
        {
          onSuccess: () => setDialogOpen(false),
        }
      );
    }
  };

  const handleOpenEdit = (q: any) => {
    setEditingQuestion({
      id: q.id,
      question_text: q.question_text,
      question_type: (q as any).question_type || "stars",
      options: ((q as any).options as string[]) || [],
      placeholder: (q as any).placeholder ?? null,
      is_required: !!(q as any).is_required,
      max_length: (q as any).max_length ?? 500,
    });
    setDialogOpen(true);
  };

  const handleCloseDialog = (open: boolean) => {
    setDialogOpen(open);
    if (!open) setEditingQuestion(null);
  };

  const handleImportTemplate = () => {
    const startPos = (questions?.length || 0) + 1;
    for (let i = 0; i < RESTAURANT_TEMPLATES.length; i++) {
      const t = RESTAURANT_TEMPLATES[i];
      createQuestion.mutate({
        campaign_id: campaignId,
        question_text: t.text,
        order_position: startPos + i,
        question_type: t.type,
        options: t.options,
      });
    }
    toast.success("Template de restaurante importado!");
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button onClick={() => setDialogOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" /> Nova Pergunta
        </Button>
        <Button variant="outline" onClick={handleImportTemplate} disabled={createQuestion.isPending} className="gap-2">
          <FileDown className="h-4 w-4" /> Importar Template
        </Button>
      </div>

      <QuestionFormDialog
        open={dialogOpen}
        onOpenChange={handleCloseDialog}
        onSubmit={handleSubmitQuestion}
        isPending={editingQuestion ? updateQuestion.isPending : createQuestion.isPending}
        initialData={editingQuestion}
      />

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : questions && questions.length > 0 ? (
        <div className="space-y-2">
          {questions.map((q, index) => {
            const typeInfo = QUESTION_TYPE_LABELS[(q as any).question_type || "stars"];
            const qOptions = (q as any).options as string[] | null;
            return (
              <Card key={q.id}>
                <CardContent className="py-3 px-4 space-y-1">
                  <div className="flex items-center gap-3">
                    <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-sm font-medium text-muted-foreground w-6">{index + 1}.</span>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm">{q.question_text}</span>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground bg-muted/50 rounded px-1.5 py-0.5">
                          {typeInfo?.icon} {typeInfo?.label}
                        </span>
                      </div>
                    </div>
                    <Switch
                      checked={q.is_active}
                      onCheckedChange={(checked) =>
                        updateQuestion.mutate({ id: q.id, campaign_id: campaignId, is_active: checked })
                      }
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleOpenEdit(q)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => deleteQuestion.mutate({ id: q.id, campaign_id: campaignId })}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  {qOptions && qOptions.length > 0 && (
                    <div className="flex flex-wrap gap-1 pl-14">
                      {qOptions.map((opt, i) => (
                        <span key={i} className="text-[10px] bg-muted/50 rounded-full px-2 py-0.5 text-muted-foreground">
                          {opt}
                        </span>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground text-center py-8">
          Nenhuma pergunta adicionada. Adicione perguntas para que seus clientes possam avaliar.
        </p>
      )}
    </div>
  );
}
