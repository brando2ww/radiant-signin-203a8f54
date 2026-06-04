import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Trash2, Pencil, X, Check, User } from "lucide-react";
import { EmptyState } from "@/components/pdv/shared/EmptyState";

export interface SupplierContact {
  id: string;
  name: string;
  role?: string;
  phone?: string;
  email?: string;
}

interface Props {
  value: SupplierContact[];
  onChange: (next: SupplierContact[]) => void;
}

const empty: Omit<SupplierContact, "id"> = { name: "", role: "", phone: "", email: "" };

export function SupplierContactsTab({ value, onChange }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Omit<SupplierContact, "id">>(empty);
  const [isAdding, setIsAdding] = useState(false);

  function startAdd() {
    setDraft(empty);
    setIsAdding(true);
    setEditingId(null);
  }

  function startEdit(c: SupplierContact) {
    setDraft({ name: c.name, role: c.role || "", phone: c.phone || "", email: c.email || "" });
    setEditingId(c.id);
    setIsAdding(false);
  }

  function cancel() {
    setEditingId(null);
    setIsAdding(false);
    setDraft(empty);
  }

  function save() {
    if (!draft.name.trim()) return;
    const list = [...value];
    if (editingId) {
      const idx = list.findIndex((c) => c.id === editingId);
      if (idx >= 0) list[idx] = { id: editingId, ...draft };
    } else {
      list.push({ id: crypto.randomUUID(), ...draft });
    }
    onChange(list);
    cancel();
  }

  function remove(id: string) {
    onChange(value.filter((c) => c.id !== id));
  }

  const showForm = isAdding || editingId !== null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Adicione representantes, vendedores ou contatos financeiros.
        </p>
        {!showForm && (
          <Button type="button" size="sm" onClick={startAdd}>
            <Plus className="h-4 w-4 mr-1" /> Adicionar
          </Button>
        )}
      </div>

      {showForm && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Nome *</Label>
                <Input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="Nome do contato"
                />
              </div>
              <div>
                <Label>Cargo</Label>
                <Input
                  value={draft.role}
                  onChange={(e) => setDraft({ ...draft, role: e.target.value })}
                  placeholder="Ex.: Vendedor"
                />
              </div>
              <div>
                <Label>Telefone</Label>
                <Input
                  value={draft.phone}
                  onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                  placeholder="(11) 99999-9999"
                />
              </div>
              <div className="col-span-2">
                <Label>E-mail</Label>
                <Input
                  type="email"
                  value={draft.email}
                  onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                  placeholder="contato@empresa.com"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={cancel}>
                <X className="h-4 w-4 mr-1" /> Cancelar
              </Button>
              <Button type="button" size="sm" onClick={save} disabled={!draft.name.trim()}>
                <Check className="h-4 w-4 mr-1" /> Salvar contato
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {value.length === 0 && !showForm ? (
        <EmptyState
          icon={User}
          title="Nenhum contato adicional"
          description="Cadastre contatos extras para esse fornecedor."
        />
      ) : (
        <div className="space-y-2">
          {value.map((c) => (
            <Card key={c.id}>
              <CardContent className="py-3 px-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{c.name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {[c.role, c.phone, c.email].filter(Boolean).join(" · ") || "—"}
                  </p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button type="button" variant="ghost" size="icon" onClick={() => startEdit(c)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => remove(c.id)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
