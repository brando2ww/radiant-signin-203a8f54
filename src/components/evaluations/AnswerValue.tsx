import { Star, MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface AnswerValueProps {
  questionType?: string | null;
  score: number;
  selectedOptions?: unknown;
  comment?: string | null;
  textAnswer?: string | null;
}

function parseOptions(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      return [raw];
    }
  }
  return [];
}

export function AnswerValue({ questionType, score, selectedOptions, comment }: AnswerValueProps) {
  const type = questionType || "stars";
  const options = parseOptions(selectedOptions);

  return (
    <div className="space-y-2">
      {type === "stars" && (
        <div className="flex items-center gap-0.5">
          {[1, 2, 3, 4, 5].map((s) => (
            <Star
              key={s}
              className={`h-4 w-4 ${
                s <= score ? "text-amber-500 fill-amber-500" : "text-muted-foreground/20"
              }`}
            />
          ))}
          <span className="ml-2 text-sm text-muted-foreground">{score}/5</span>
        </div>
      )}

      {(type === "single_choice" || type === "multiple_choice") && (
        <div className="flex flex-wrap gap-1.5">
          {options.length > 0 ? (
            options.map((opt, idx) => (
              <Badge key={idx} variant="secondary" className="font-normal">
                {opt}
              </Badge>
            ))
          ) : (
            <span className="text-sm text-muted-foreground">—</span>
          )}
        </div>
      )}

      {type !== "stars" && type !== "single_choice" && type !== "multiple_choice" && (
        <span className="text-sm">
          {options.length > 0 ? options.join(", ") : score ? String(score) : "—"}
        </span>
      )}

      {comment && (
        <div className="flex items-start gap-1.5 text-xs bg-muted/50 p-2 rounded">
          <MessageSquare className="h-3 w-3 shrink-0 mt-0.5 text-muted-foreground" />
          <span>{comment}</span>
        </div>
      )}
    </div>
  );
}
