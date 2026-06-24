import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, GripVertical, AlertTriangle, Camera, Thermometer, Star } from "lucide-react";
import { useChecklistItems, ITEM_TYPE_LABELS, type ChecklistItemType } from "@/hooks/use-checklists";
import type { Database } from "@/integrations/supabase/types";

type ItemRow = Database["public"]["Tables"]["checklist_items"]["Row"];

interface Props {
  checklistId: string;
}

export function ChecklistItemsEditor({ checklistId }: Props) {
  const { items, isLoading, upsertItem, deleteItem } = useChecklistItems(checklistId);
  const [newItem, setNewItem] = useState(false);

  const typeIcons: Partial<Record<ChecklistItemType, React.ReactNode>> = {
    temperature: <Thermometer className="h-4 w-4" />,
    photo: <Camera className="h-4 w-4" />,
    stars: <Star className="h-4 w-4" />,
  };

  return (
    <div className="space-y-3">
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando itens...</p>
      ) : items.length === 0 && !newItem ? (
        <p className="text-sm text-muted-foreground">Nenhum item. Adicione o primeiro.</p>
      ) : (
        items.map((item) => (
          <ItemCard key={item.id} item={item} onSave={upsertItem} onDelete={deleteItem} typeIcons={typeIcons} />
        ))
      )}

      {newItem ? (
        <NewItemForm
          checklistId={checklistId}
          sortOrder={items.length}
          onSave={async (data) => { await upsertItem(data); setNewItem(false); }}
          onCancel={() => setNewItem(false)}
          typeIcons={typeIcons}
        />
      ) : (
        <Button variant="outline" size="sm" onClick={() => setNewItem(true)} className="w-full">
          <Plus className="h-4 w-4 mr-2" /> Adicionar Item
        </Button>
      )}
    </div>
  );
}

function ItemCard({
  item,
  onSave,
  onDelete,
  typeIcons,
}: {
  item: ItemRow;
  onSave: (data: any) => Promise<void>;
  onDelete: (id: string) => void;
  typeIcons: Partial<Record<ChecklistItemType, React.ReactNode>>;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(item.title);
  const [itemType, setItemType] = useState<ChecklistItemType>(item.item_type);
  const [isCritical, setIsCritical] = useState(item.is_critical);
  const [isRequired, setIsRequired] = useState(item.is_required);
  const [requiresPhoto, setRequiresPhoto] = useState(item.requires_photo);
  const [minVal, setMinVal] = useState(item.min_value?.toString() || "");
  const [maxVal, setMaxVal] = useState(item.max_value?.toString() || "");
  const [trainingInstruction, setTrainingInstruction] = useState(item.training_instruction || "");
  const [trainingVideoUrl, setTrainingVideoUrl] = useState(item.training_video_url || "");
  const [options, setOptions] = useState<string[]>(
    Array.isArray((item as any).options) ? (item as any).options : []
  );
  const [newOption, setNewOption] = useState("");

  const handleSave = async () => {
    await onSave({
      id: item.id,
      checklist_id: item.checklist_id,
      title,
      item_type: itemType,
      is_critical: isCritical,
      is_required: isRequired,
      requires_photo: requiresPhoto,
      sort_order: item.sort_order,
      min_value: minVal ? Number(minVal) : null,
      max_value: maxVal ? Number(maxVal) : null,
      training_instruction: trainingInstruction || null,
      training_video_url: trainingVideoUrl || null,
      options: itemType === "multiple_choice" ? options : null,
    });
    setEditing(false);
  };

  if (!editing) {
    return (
      <Card className="cursor-pointer hover:bg-accent/50" onClick={() => setEditing(true)}>
        <CardContent className="py-3 px-4 flex items-center gap-3">
          <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm truncate">{item.title}</span>
              {isCritical && <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />}
            </div>
            <span className="text-xs text-muted-foreground">{ITEM_TYPE_LABELS[item.item_type]}</span>
          </div>
          {typeIcons[item.item_type]}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary">
      <CardContent className="py-4 px-4 space-y-3">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título do item" />
        <Select value={itemType} onValueChange={(v) => setItemType(v as ChecklistItemType)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {(Object.keys(ITEM_TYPE_LABELS) as ChecklistItemType[]).map((t) => (
              <SelectItem key={t} value={t}>{ITEM_TYPE_LABELS[t]}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {itemType === "temperature" && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Mínimo (°C)</Label>
              <Input type="number" value={minVal} onChange={(e) => setMinVal(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Máximo (°C)</Label>
              <Input type="number" value={maxVal} onChange={(e) => setMaxVal(e.target.value)} />
            </div>
          </div>
        )}

        {itemType === "multiple_choice" && (
          <div className="space-y-2">
            <Label className="text-xs">Opções de resposta</Label>
            {options.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  value={opt}
                  onChange={(e) => setOptions(options.map((o, j) => j === i ? e.target.value : o))}
                  placeholder={`Opção ${i + 1}`}
                  className="h-8 text-sm"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => setOptions(options.filter((_, j) => j !== i))}
                  type="button"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            <div className="flex gap-2">
              <Input
                value={newOption}
                onChange={(e) => setNewOption(e.target.value)}
                placeholder="Nova opção..."
                className="h-8 text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newOption.trim()) {
                    setOptions([...options, newOption.trim()]);
                    setNewOption("");
                  }
                }}
              />
              <Button
                variant="outline"
                size="sm"
                type="button"
                disabled={!newOption.trim()}
                onClick={() => { setOptions([...options, newOption.trim()]); setNewOption(""); }}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={isCritical} onCheckedChange={setIsCritical} /> Crítico
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={isRequired} onCheckedChange={setIsRequired} /> Obrigatório
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={requiresPhoto} onCheckedChange={setRequiresPhoto} /> Foto obrigatória
          </label>
        </div>

        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">Modo treinamento</summary>
          <div className="mt-2 space-y-2">
            <Textarea
              placeholder="Instrução para o colaborador..."
              value={trainingInstruction}
              onChange={(e) => setTrainingInstruction(e.target.value)}
              rows={2}
            />
            <Input
              placeholder="URL do vídeo explicativo"
              value={trainingVideoUrl}
              onChange={(e) => setTrainingVideoUrl(e.target.value)}
            />
          </div>
        </details>

        <div className="flex justify-between">
          <Button variant="destructive" size="sm" onClick={() => onDelete(item.id)}>
            <Trash2 className="h-3.5 w-3.5 mr-1" /> Excluir
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditing(false)}>Cancelar</Button>
            <Button size="sm" onClick={handleSave}>Salvar</Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function NewItemForm({
  checklistId,
  sortOrder,
  onSave,
  onCancel,
  typeIcons,
}: {
  checklistId: string;
  sortOrder: number;
  onSave: (data: any) => Promise<void>;
  onCancel: () => void;
  typeIcons: Partial<Record<ChecklistItemType, React.ReactNode>>;
}) {
  const [title, setTitle] = useState("");
  const [itemType, setItemType] = useState<ChecklistItemType>("checkbox");
  const [isCritical, setIsCritical] = useState(false);
  const [isRequired, setIsRequired] = useState(true);
  const [requiresPhoto, setRequiresPhoto] = useState(false);
  const [minVal, setMinVal] = useState("");
  const [maxVal, setMaxVal] = useState("");
  const [options, setOptions] = useState<string[]>([]);
  const [newOption, setNewOption] = useState("");

  const handleSave = () =>
    onSave({
      checklist_id: checklistId,
      title,
      item_type: itemType,
      is_critical: isCritical,
      is_required: isRequired,
      requires_photo: requiresPhoto,
      sort_order: sortOrder,
      min_value: minVal ? Number(minVal) : null,
      max_value: maxVal ? Number(maxVal) : null,
      options: itemType === "multiple_choice" ? options : null,
    });

  return (
    <Card className="border-primary">
      <CardContent className="py-4 px-4 space-y-3">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título do item" autoFocus />
        <Select value={itemType} onValueChange={(v) => setItemType(v as ChecklistItemType)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {(Object.keys(ITEM_TYPE_LABELS) as ChecklistItemType[]).map((t) => (
              <SelectItem key={t} value={t}>{ITEM_TYPE_LABELS[t]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {itemType === "temperature" && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Mínimo (°C)</Label>
              <Input type="number" value={minVal} onChange={(e) => setMinVal(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Máximo (°C)</Label>
              <Input type="number" value={maxVal} onChange={(e) => setMaxVal(e.target.value)} />
            </div>
          </div>
        )}
        {itemType === "multiple_choice" && (
          <div className="space-y-2">
            <Label className="text-xs">Opções de resposta</Label>
            {options.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  value={opt}
                  onChange={(e) => setOptions(options.map((o, j) => j === i ? e.target.value : o))}
                  placeholder={`Opção ${i + 1}`}
                  className="h-8 text-sm"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => setOptions(options.filter((_, j) => j !== i))}
                  type="button"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            <div className="flex gap-2">
              <Input
                value={newOption}
                onChange={(e) => setNewOption(e.target.value)}
                placeholder="Nova opção..."
                className="h-8 text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newOption.trim()) {
                    setOptions([...options, newOption.trim()]);
                    setNewOption("");
                  }
                }}
              />
              <Button
                variant="outline"
                size="sm"
                type="button"
                disabled={!newOption.trim()}
                onClick={() => { setOptions([...options, newOption.trim()]); setNewOption(""); }}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={isCritical} onCheckedChange={setIsCritical} /> Crítico
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={isRequired} onCheckedChange={setIsRequired} /> Obrigatório
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={requiresPhoto} onCheckedChange={setRequiresPhoto} /> Foto obrigatória
          </label>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onCancel}>Cancelar</Button>
          <Button size="sm" onClick={handleSave} disabled={!title.trim()}>Adicionar</Button>
        </div>
      </CardContent>
    </Card>
  );
}
