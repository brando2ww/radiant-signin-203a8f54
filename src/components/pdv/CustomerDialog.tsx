import { useEffect } from "react";
import { useForm } from "react-hook-form";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export interface CustomerFormData {
  name: string;
  phone: string;
  cpf: string;
  email: string;
  birth_date: string;
  notes: string;
}

interface CustomerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: { id: string; name: string; phone?: string | null; cpf?: string | null; email?: string | null; birth_date?: string | null; notes?: string | null } | null;
  onSubmit: (data: CustomerFormData) => void;
  isSubmitting: boolean;
}

export function CustomerDialog({ open, onOpenChange, customer, onSubmit, isSubmitting }: CustomerDialogProps) {
  const { register, handleSubmit, reset, formState: { errors } } = useForm<CustomerFormData>();

  useEffect(() => {
    if (open) {
      reset({
        name: customer?.name || "",
        phone: customer?.phone || "",
        cpf: customer?.cpf || "",
        email: customer?.email || "",
        birth_date: customer?.birth_date || "",
        notes: customer?.notes || "",
      });
    }
  }, [open, customer, reset]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{customer ? "Editar Cliente" : "Novo Cliente"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome *</Label>
            <Input id="name" {...register("name", { required: "Nome é obrigatório" })} placeholder="Nome completo" />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="phone">Telefone</Label>
              <Input id="phone" {...register("phone")} placeholder="(00) 00000-0000" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cpf">CPF</Label>
              <Input id="cpf" {...register("cpf")} placeholder="000.000.000-00" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" type="email" {...register("email")} placeholder="email@exemplo.com" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="birth_date">Data de Nasc.</Label>
              <Input id="birth_date" type="date" {...register("birth_date")} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Observações</Label>
            <Textarea id="notes" {...register("notes")} placeholder="Observações sobre o cliente..." rows={3} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Salvando..." : customer ? "Salvar" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
