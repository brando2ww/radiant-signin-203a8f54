import { useState, useEffect } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import { useAuthorizedEmployees, AuthorizedEmployee } from "@/hooks/use-authorized-employees";
import { useProductImageUpload } from "@/hooks/use-product-image-upload";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Upload, Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  employee?: AuthorizedEmployee | null;
}

export function AuthorizedEmployeeFormSheet({ open, onOpenChange, employee }: Props) {
  const { create, update, isCreating, isUpdating } = useAuthorizedEmployees();
  const { uploadImage, isUploading } = useProductImageUpload();

  const isEdit = !!employee;
  const [fullName, setFullName] = useState(employee?.full_name || "");
  const [roleTitle, setRoleTitle] = useState(employee?.role_title || "");
  const [avatarUrl, setAvatarUrl] = useState(employee?.avatar_url || "");
  const [creditLimit, setCreditLimit] = useState<number>(employee?.credit_limit || 0);
  const [isActive, setIsActive] = useState(employee?.is_active ?? true);
  const [notes, setNotes] = useState(employee?.internal_notes || "");

  useEffect(() => {
    if (open) {
      setFullName(employee?.full_name || "");
      setRoleTitle(employee?.role_title || "");
      setAvatarUrl(employee?.avatar_url || "");
      setCreditLimit(employee?.credit_limit || 0);
      setIsActive(employee?.is_active ?? true);
      setNotes(employee?.internal_notes || "");
    }
  }, [open, employee]);

  const initials = fullName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase() || "?";

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const url = await uploadImage(f);
    if (url) setAvatarUrl(url);
  };

  const handleSave = () => {
    if (!fullName.trim()) return;
    const payload = {
      full_name: fullName.trim(),
      role_title: roleTitle.trim() || null,
      avatar_url: avatarUrl || null,
      credit_limit: creditLimit,
      is_active: isActive,
      internal_notes: notes.trim() || null,
    } as any;
    if (isEdit && employee) {
      update({ id: employee.id, updates: payload }, { onSuccess: () => onOpenChange(false) });
    } else {
      create(payload, { onSuccess: () => onOpenChange(false) });
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEdit ? "Editar Cliente" : "Novo Cliente"}</SheetTitle>
          <SheetDescription>
            Clientes autorizados para venda a prazo (fiado).
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 py-4">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              {avatarUrl && <AvatarImage src={avatarUrl} />}
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <div>
              <Label htmlFor="avatar-upload" className="cursor-pointer">
                <div className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
                  {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  Enviar foto
                </div>
              </Label>
              <input
                id="avatar-upload"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFile}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Nome completo *</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>Cargo / função</Label>
            <Input value={roleTitle} onChange={(e) => setRoleTitle(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>Limite de crédito (0 = sem limite)</Label>
            <CurrencyInput value={creditLimit} onChange={(v) => setCreditLimit(Number(v) || 0)} />
          </div>

          <div className="flex items-center justify-between">
            <Label>Ativo</Label>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>

          <div className="space-y-2">
            <Label>Observação interna</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
        </div>

        <SheetFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={!fullName.trim() || isCreating || isUpdating}>
            {(isCreating || isUpdating) && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Salvar
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
