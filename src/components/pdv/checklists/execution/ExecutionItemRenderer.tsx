import { useState, useRef } from "react";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Camera, Star, Loader2, AlertTriangle } from "lucide-react";
import { TrainingStep } from "./TrainingStep";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export interface ChecklistItemData {
  id: string; // checklist_items.id
  executionItemId: string; // checklist_execution_items.id
  title: string;
  item_type: string;
  is_critical: boolean;
  is_required: boolean;
  requires_photo: boolean;
  min_value: number | null;
  max_value: number | null;
  training_instruction: string | null;
  training_video_url: string | null;
  options: string[] | null;
  value: any;
  photo_url: string | null;
  is_compliant: boolean | null;
  completed_at: string | null;
}

interface ExecutionItemRendererProps {
  item: ChecklistItemData;
  onSave: (executionItemId: string, value: any, photoUrl: string | null, isCompliant: boolean | null) => void;
  userId: string;
  executionId: string;
}

export function ExecutionItemRenderer({ item, onSave, userId, executionId }: ExecutionItemRendererProps) {
  const [value, setValue] = useState<any>(item.value);
  const [photoUrl, setPhotoUrl] = useState<string | null>(item.photo_url);
  const [uploading, setUploading] = useState(false);
  const [trainingAcked, setTrainingAcked] = useState(!item.training_instruction && !item.training_video_url);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasTraining = !!(item.training_instruction || item.training_video_url);
  const isBlocked = hasTraining && !trainingAcked;

  const checkCompliance = (val: any): boolean | null => {
    if (item.item_type === "temperature" || item.item_type === "number") {
      const num = parseFloat(val);
      if (isNaN(num)) return null;
      if (item.min_value != null && num < item.min_value) return false;
      if (item.max_value != null && num > item.max_value) return false;
      return true;
    }
    return null;
  };

  const handleChange = (newVal: any) => {
    setValue(newVal);
    const compliant = checkCompliance(newVal);
    onSave(item.executionItemId, newVal, photoUrl, compliant);
  };

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${userId}/${executionId}/${item.id}.${ext}`;
      const { error } = await supabase.storage
        .from("checklist-evidence")
        .upload(path, file, { upsert: true, contentType: file.type || `image/${ext}` });
      if (error) {
        console.error("[checklist-evidence] upload error:", error);
        toast.error(`Falha ao enviar foto: ${error.message}`);
        return;
      }
      const { data: urlData } = supabase.storage.from("checklist-evidence").getPublicUrl(path);
      // cache-bust to force refresh
      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;
      setPhotoUrl(publicUrl);
      try {
        await onSave(item.executionItemId, value, publicUrl, checkCompliance(value));
      } catch (err: any) {
        console.error("[checklist-evidence] save error:", err);
        toast.error(`Foto enviada, mas falhou ao salvar: ${err?.message || "erro desconhecido"}`);
      }
    } catch (err: any) {
      console.error("[checklist-evidence] unexpected error:", err);
      toast.error(`Erro inesperado: ${err?.message || "tente novamente"}`);
    } finally {
      setUploading(false);
      // reset so the same file can be reselected
      input.value = "";
    }
  };

  const isOutOfRange =
    (item.item_type === "temperature" || item.item_type === "number") &&
    value != null &&
    value !== "" &&
    checkCompliance(value) === false;

  const isDone = item.completed_at != null;

  return (
    <div className={cn(
      "rounded-lg border p-4 space-y-3",
      isDone ? "bg-primary/5 border-primary/20" : "",
      isOutOfRange ? "border-destructive/50 bg-destructive/5" : ""
    )}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium">{item.title}</span>
          {item.is_critical && <Badge variant="destructive" className="text-[10px] px-1.5">Crítico</Badge>}
          {item.is_required && <Badge variant="secondary" className="text-[10px] px-1.5">Obrigatório</Badge>}
        </div>
      </div>

      {hasTraining && (
        <TrainingStep
          instruction={item.training_instruction}
          videoUrl={item.training_video_url}
          acknowledged={trainingAcked}
          onAcknowledge={() => setTrainingAcked(true)}
        />
      )}

      {!isBlocked && (
        <div className="space-y-2">
          {item.item_type === "checkbox" && (
            <div className="flex items-center gap-3">
              <Switch
                checked={!!value}
                onCheckedChange={(v) => handleChange(v)}
              />
              <span className="text-sm text-muted-foreground">{value ? "Feito" : "Pendente"}</span>
            </div>
          )}

          {(item.item_type === "number" || item.item_type === "temperature") && (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  placeholder={item.item_type === "temperature" ? "°C" : "Valor"}
                  value={value ?? ""}
                  onChange={(e) => handleChange(e.target.value ? parseFloat(e.target.value) : null)}
                  className="w-32"
                />
                {item.item_type === "temperature" && <span className="text-sm text-muted-foreground">°C</span>}
                {isOutOfRange && (
                  <Badge variant="destructive" className="flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    Fora da faixa
                  </Badge>
                )}
                {value != null && value !== "" && checkCompliance(value) === true && (
                  <Badge className="bg-green-600 text-white">OK</Badge>
                )}
              </div>
              {(item.min_value != null || item.max_value != null) && (
                <p className="text-xs text-muted-foreground">
                  Faixa: {item.min_value ?? "—"} a {item.max_value ?? "—"}
                  {item.item_type === "temperature" ? " °C" : ""}
                </p>
              )}
            </div>
          )}

          {item.item_type === "text" && (
            <Textarea
              placeholder="Observação..."
              value={value ?? ""}
              onChange={(e) => handleChange(e.target.value)}
              rows={2}
            />
          )}

          {item.item_type === "photo" && (
            <div className="space-y-2">
              {photoUrl ? (
                <img src={photoUrl} alt="Evidência" className="w-full max-w-xs rounded-md border" />
              ) : null}
              <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhoto} />
              <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Camera className="h-4 w-4 mr-2" />}
                {photoUrl ? "Trocar Foto" : "Tirar Foto"}
              </Button>
            </div>
          )}

          {item.item_type === "stars" && (
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => handleChange(star)}
                  className="p-0.5"
                >
                  <Star
                    className={cn(
                      "h-7 w-7 transition-colors",
                      (value ?? 0) >= star
                        ? "fill-yellow-400 text-yellow-400"
                        : "text-muted-foreground/30"
                    )}
                  />
                </button>
              ))}
            </div>
          )}

          {item.item_type === "multiple_choice" && (
            <div className="space-y-2">
              {(item.options ?? []).length === 0 ? (
                <p className="text-xs text-muted-foreground italic">
                  Nenhuma opção configurada para este item.
                </p>
              ) : (
                (item.options ?? []).map((opt, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleChange(opt)}
                    className={cn(
                      "w-full text-left px-3 py-2.5 rounded-md border text-sm transition-colors",
                      value === opt
                        ? "border-primary bg-primary/10 font-medium text-primary"
                        : "border-border hover:bg-accent/60"
                    )}
                  >
                    {opt}
                  </button>
                ))
              )}
              {value != null && (
                <p className="text-xs text-muted-foreground">
                  Selecionado: <strong>{value}</strong>
                </p>
              )}
            </div>
          )}

          {item.requires_photo && item.item_type !== "photo" && (
            <div className="space-y-1">
              {photoUrl ? (
                <img src={photoUrl} alt="Evidência" className="w-full max-w-xs rounded-md border" />
              ) : null}
              <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhoto} />
              <Button variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Camera className="h-4 w-4 mr-2" />}
                {photoUrl ? "Trocar Foto" : "Anexar Foto"}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
