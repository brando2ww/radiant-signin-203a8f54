import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Star, List, CheckSquare, MessageSquare, X, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

const QUESTION_TYPES = [
  {
    value: "stars",
    label: "Estrelas",
    description: "Avaliação de 1 a 5 estrelas",
    icon: Star,
    color: "border-yellow-400 bg-yellow-50 dark:bg-yellow-950/30",
    iconColor: "text-yellow-500",
  },
  {
    value: "single_choice",
    label: "Escolha Única",
    description: "Cliente escolhe uma opção",
    icon: List,
    color: "border-blue-400 bg-blue-50 dark:bg-blue-950/30",
    iconColor: "text-blue-500",
  },
  {
    value: "multiple_choice",
    label: "Múltipla Escolha",
    description: "Cliente escolhe várias opções",
    icon: CheckSquare,
    color: "border-purple-400 bg-purple-50 dark:bg-purple-950/30",
    iconColor: "text-purple-500",
  },
  {
    value: "free_text",
    label: "Texto Livre",
    description: "Cliente escreve livremente",
    icon: MessageSquare,
    color: "border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30",
    iconColor: "text-emerald-500",
  },
] as const;

const PLACEHOLDERS: Record<string, string> = {
  stars: "Ex: Como avalia a qualidade da comida?",
  single_choice: "Ex: Como conheceu nosso restaurante?",
  multiple_choice: "Ex: O que mais gostou na experiência?",
  free_text: "Ex: O que podemos melhorar?",
};

interface QuestionInitialData {
  id: string;
  question_text: string;
  question_type: string;
  options?: string[];
  placeholder?: string | null;
  is_required?: boolean;
  max_length?: number | null;
}

interface QuestionFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: {
    question_text: string;
    question_type: string;
    options?: string[];
    placeholder?: string | null;
    is_required?: boolean;
    max_length?: number;
  }) => void;
  isPending?: boolean;
  initialData?: QuestionInitialData | null;
}

export function QuestionFormDialog({ open, onOpenChange, onSubmit, isPending, initialData }: QuestionFormDialogProps) {
  const [type, setType] = useState("stars");
  const [text, setText] = useState("");
  const [options, setOptions] = useState<string[]>([]);
  const [newOption, setNewOption] = useState("");
  const [placeholder, setPlaceholder] = useState("");
  const [isRequired, setIsRequired] = useState(false);
  const [maxLength, setMaxLength] = useState<number>(500);

  const isEditing = !!initialData;

  useEffect(() => {
    if (open && initialData) {
      setType(initialData.question_type);
      setText(initialData.question_text);
      setOptions(initialData.options || []);
      setNewOption("");
      setPlaceholder(initialData.placeholder || "");
      setIsRequired(!!initialData.is_required);
      setMaxLength(initialData.max_length ?? 500);
    } else if (!open) {
      setType("stars");
      setText("");
      setOptions([]);
      setNewOption("");
      setPlaceholder("");
      setIsRequired(false);
      setMaxLength(500);
    }
  }, [open, initialData]);

  const isChoiceType = type === "single_choice" || type === "multiple_choice";
  const isFreeText = type === "free_text";
  const canSubmit = text.trim() && (!isChoiceType || options.length >= 2);

  const resetForm = () => {
    setType("stars");
    setText("");
    setOptions([]);
    setNewOption("");
    setPlaceholder("");
    setIsRequired(false);
    setMaxLength(500);
  };

  const handleClose = (val: boolean) => {
    if (!val) resetForm();
    onOpenChange(val);
  };

  const handleAddOption = () => {
    const trimmed = newOption.trim();
    if (!trimmed || options.includes(trimmed)) return;
    setOptions((prev) => [...prev, trimmed]);
    setNewOption("");
  };

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit({
      question_text: text.trim(),
      question_type: type,
      options: isChoiceType ? options : undefined,
      placeholder: isFreeText ? (placeholder.trim() || null) : null,
      is_required: isFreeText ? isRequired : false,
      max_length: isFreeText ? Math.max(10, Math.min(2000, maxLength || 500)) : 500,
    });
    resetForm();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[560px] gap-0 p-0 overflow-hidden max-h-[90vh] flex flex-col">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle>{isEditing ? "Editar Pergunta" : "Nova Pergunta"}</DialogTitle>
          <DialogDescription>
            Configure o tipo e o conteúdo da pergunta para seus clientes.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 space-y-5 pb-5 overflow-y-auto">
          {/* Step 1 — Type selection */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Tipo da pergunta</Label>
            <div className="grid grid-cols-4 gap-2">
              {QUESTION_TYPES.map((qt) => {
                const Icon = qt.icon;
                const selected = type === qt.value;
                return (
                  <button
                    key={qt.value}
                    type="button"
                    onClick={() => {
                      setType(qt.value);
                      if (qt.value === "stars" || qt.value === "free_text") setOptions([]);
                    }}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-lg border-2 p-3 text-center transition-all hover:shadow-sm",
                      selected ? qt.color : "border-transparent bg-muted/40 hover:bg-muted/60"
                    )}
                  >
                    <Icon className={cn("h-5 w-5", selected ? qt.iconColor : "text-muted-foreground")} />
                    <span className="text-xs font-semibold">{qt.label}</span>
                    <span className="text-[10px] text-muted-foreground leading-tight">{qt.description}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 2 — Question text */}
          <div className="space-y-2">
            <Label htmlFor="question-text" className="text-sm font-medium">Texto da pergunta</Label>
            <Input
              id="question-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={PLACEHOLDERS[type]}
              maxLength={200}
            />
          </div>

          {/* Step 3 — Options (choice types only) */}
          {isChoiceType && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Opções de resposta</Label>
                <span className={cn(
                  "text-[11px]",
                  options.length < 2 ? "text-destructive" : "text-muted-foreground"
                )}>
                  {options.length} / mínimo 2
                </span>
              </div>

              {options.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {options.map((opt, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1 text-xs bg-secondary border rounded-full px-2.5 py-1 font-medium"
                    >
                      {opt}
                      <button
                        type="button"
                        onClick={() => setOptions((prev) => prev.filter((_, i) => i !== idx))}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                <Input
                  value={newOption}
                  onChange={(e) => setNewOption(e.target.value)}
                  placeholder="Adicionar opção..."
                  maxLength={100}
                  className="h-9 text-sm"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddOption();
                    }
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleAddOption}
                  disabled={!newOption.trim()}
                  className="h-9 shrink-0"
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}

          {/* Step 3 — Free text settings */}
          {isFreeText && (
            <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
              <div className="space-y-1.5">
                <Label htmlFor="ft-placeholder" className="text-xs font-medium">Placeholder (opcional)</Label>
                <Input
                  id="ft-placeholder"
                  value={placeholder}
                  onChange={(e) => setPlaceholder(e.target.value)}
                  placeholder="Ex: Escreva sua opinião..."
                  maxLength={100}
                  className="h-9 text-sm"
                />
              </div>

              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label className="text-xs font-medium">Resposta obrigatória</Label>
                  <p className="text-[11px] text-muted-foreground">Cliente precisa preencher para enviar</p>
                </div>
                <Switch checked={isRequired} onCheckedChange={setIsRequired} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ft-maxlen" className="text-xs font-medium">Tamanho máximo (caracteres)</Label>
                <Input
                  id="ft-maxlen"
                  type="number"
                  min={10}
                  max={2000}
                  value={maxLength}
                  onChange={(e) => setMaxLength(Number(e.target.value) || 500)}
                  className="h-9 text-sm"
                />
              </div>
            </div>
          )}

          {/* Preview */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground">Pré-visualização</Label>
            <div className="rounded-lg border bg-muted/20 p-4 space-y-2">
              <p className="text-sm font-medium">
                {text || <span className="text-muted-foreground italic">Texto da pergunta...</span>}
                {isFreeText && !isRequired && (
                  <span className="text-xs text-muted-foreground font-normal ml-1">(opcional)</span>
                )}
              </p>
              {type === "stars" && (
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star key={s} className="h-6 w-6 text-yellow-400 fill-yellow-400/20" />
                  ))}
                </div>
              )}
              {type === "single_choice" && options.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  {options.map((opt, i) => (
                    <label key={i} className="flex items-center gap-2 text-sm">
                      <span className="h-4 w-4 rounded-full border-2 border-muted-foreground/40 shrink-0" />
                      {opt}
                    </label>
                  ))}
                </div>
              )}
              {type === "multiple_choice" && options.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  {options.map((opt, i) => (
                    <label key={i} className="flex items-center gap-2 text-sm">
                      <span className="h-4 w-4 rounded-sm border-2 border-muted-foreground/40 shrink-0" />
                      {opt}
                    </label>
                  ))}
                </div>
              )}
              {isFreeText && (
                <div className="space-y-1">
                  <Textarea
                    disabled
                    placeholder={placeholder || "Escreva sua resposta..."}
                    className="min-h-[70px] text-sm bg-background/60"
                  />
                  <p className="text-[10px] text-muted-foreground text-right">0 / {maxLength}</p>
                </div>
              )}
              {isChoiceType && options.length === 0 && (
                <p className="text-xs text-muted-foreground italic">Adicione opções para ver a prévia</p>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t bg-muted/30">
          <Button variant="outline" onClick={() => handleClose(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || isPending}>
            {isEditing ? "Salvar Alterações" : "Adicionar Pergunta"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
