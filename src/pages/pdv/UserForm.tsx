import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { ArrowLeft, Eye, EyeOff, ChevronDown, Save, KeyRound, Trash2 } from "lucide-react";
import { roleConfig, RolePermissionsView } from "@/components/pdv/users/RolePermissionsView";
import { usePDVUsers } from "@/hooks/use-pdv-users";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export default function UserForm() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditing = !!id;
  const { users, createUser, updateUser, deleteUser } = usePDVUsers();
  const { user: currentUser } = useAuth();

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("garcom");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [permissionsOpen, setPermissionsOpen] = useState(false);
  const [resetPasswordOpen, setResetPasswordOpen] = useState(false);
  const [discountPassword, setDiscountPassword] = useState("");
  const [showDiscountPassword, setShowDiscountPassword] = useState(false);
  const [maxDiscountPercent, setMaxDiscountPercent] = useState(100);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);

  useEffect(() => {
    if (isEditing && users.length > 0) {
      const user = users.find((u: any) => u.id === id);
      if (user) {
        setDisplayName(user.display_name || "");
        setEmail(user.email || "");
        setPhone(user.phone || "");
        setRole(user.role || "garcom");
        setDiscountPassword(user.discount_password || "");
        setMaxDiscountPercent(user.max_discount_percent ?? 100);
        setEditingUserId(user.user_id);
      }
    }
  }, [isEditing, id, users]);

  const isSelf = isEditing && editingUserId === currentUser?.id;

  const handleSubmit = () => {
    if (!displayName.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }
    if (!isEditing && !email.trim()) {
      toast.error("E-mail é obrigatório para criar usuário");
      return;
    }
    if (!isEditing) {
      if (!password || password.length < 6) {
        toast.error("Senha deve ter no mínimo 6 caracteres");
        return;
      }
      if (password !== confirmPassword) {
        toast.error("As senhas não conferem");
        return;
      }
    } else if (password || confirmPassword) {
      // Editing with password change requested
      if (password.length < 6) {
        toast.error("Nova senha deve ter no mínimo 6 caracteres");
        return;
      }
      if (password !== confirmPassword) {
        toast.error("As senhas não conferem");
        return;
      }
      if (isSelf) {
        toast.error("Você não pode alterar sua própria senha por aqui.");
        return;
      }
    }

    const data: any = {
      display_name: displayName,
      email,
      phone,
      role,
      discount_password: discountPassword,
      max_discount_percent: maxDiscountPercent,
    };
    if (!isEditing) data.password = password;
    if (isEditing && password) data.password = password;

    if (isEditing) {
      updateUser.mutate({ id: id!, ...data }, {
        onSuccess: () => navigate("/pdv/usuarios"),
      });
    } else {
      createUser.mutate(data, {
        onSuccess: () => navigate("/pdv/usuarios"),
      });
    }
  };

  const handleDelete = () => {
    if (!id) return;
    deleteUser.mutate(id, {
      onSuccess: () => navigate("/pdv/usuarios"),
    });
  };

  const isPending = createUser.isPending || updateUser.isPending || deleteUser.isPending;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/pdv/usuarios")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-semibold">{isEditing ? "Editar Usuário" : "Novo Usuário"}</h1>
          <p className="text-sm text-muted-foreground">
            {isEditing ? "Atualize os dados do colaborador." : "Preencha os dados para criar um novo colaborador."}
          </p>
        </div>
      </div>

      {/* Form */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left — Personal data */}
        <div className="space-y-5 rounded-lg border p-5 bg-card">
          <h2 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">Dados Pessoais</h2>

          <div className="space-y-2">
            <Label htmlFor="name">Nome *</Label>
            <Input id="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Nome completo" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">E-mail {!isEditing && "*"}</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@exemplo.com" disabled={isEditing} />
            {isEditing && <p className="text-xs text-muted-foreground">O e-mail não pode ser alterado.</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Telefone</Label>
            <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(00) 00000-0000" />
          </div>

          {/* Discount authorization */}
          <div className="pt-2 border-t space-y-1">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Autorização de Desconto</h3>
          </div>

          <div className="space-y-2">
            <Label htmlFor="discountPassword">Senha de desconto</Label>
            <div className="relative">
              <Input
                id="discountPassword"
                type={showDiscountPassword ? "text" : "password"}
                inputMode="numeric"
                maxLength={6}
                value={discountPassword}
                onChange={(e) => setDiscountPassword(e.target.value.replace(/\D/g, ""))}
                placeholder="0000"
                className="pr-10"
              />
              <button type="button" onClick={() => setShowDiscountPassword(!showDiscountPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                {showDiscountPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">Senha numérica (4-6 dígitos) para autorizar descontos no caixa.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="maxDiscount">Desconto máximo permitido (%)</Label>
            <div className="relative">
              <Input
                id="maxDiscount"
                type="number"
                min={0}
                max={100}
                value={maxDiscountPercent}
                onChange={(e) => setMaxDiscountPercent(Math.min(100, Math.max(0, Number(e.target.value))))}
                className="pr-8"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
            </div>
          </div>

          {/* Password (create mode) */}
          {!isEditing && (
            <>
              <div className="space-y-2">
                <Label htmlFor="password">Senha *</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    className="pr-10"
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm">Confirmar Senha *</Label>
                <div className="relative">
                  <Input
                    id="confirm"
                    type={showConfirm ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repita a senha"
                    className="pr-10"
                  />
                  <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                    {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {confirmPassword && password !== confirmPassword && (
                  <p className="text-xs text-destructive">As senhas não conferem</p>
                )}
              </div>
            </>
          )}

          {/* Reset password (edit mode) */}
          {isEditing && !isSelf && (
            <Collapsible open={resetPasswordOpen} onOpenChange={setResetPasswordOpen}>
              <div className="pt-2 border-t" />
              <CollapsibleTrigger asChild>
                <Button variant="outline" size="sm" className="w-full justify-between">
                  <span className="flex items-center gap-2">
                    <KeyRound className="h-4 w-4" />
                    Redefinir senha de acesso
                  </span>
                  <ChevronDown className={`h-4 w-4 transition-transform ${resetPasswordOpen ? "rotate-180" : ""}`} />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-3 space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="newPassword">Nova senha</Label>
                  <div className="relative">
                    <Input
                      id="newPassword"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                      className="pr-10"
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="newConfirm">Confirmar nova senha</Label>
                  <div className="relative">
                    <Input
                      id="newConfirm"
                      type={showConfirm ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repita a nova senha"
                      className="pr-10"
                    />
                    <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                      {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {confirmPassword && password !== confirmPassword && (
                    <p className="text-xs text-destructive">As senhas não conferem</p>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Deixe em branco para manter a senha atual. A nova senha entra em vigor no próximo login do usuário.
                </p>
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>

        {/* Right — Role selection */}
        <div className="space-y-5 rounded-lg border p-5 bg-card">
          <h2 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">Função no Sistema</h2>

          <RadioGroup value={role} onValueChange={setRole} className="space-y-2">
            {Object.entries(roleConfig).map(([key, config]) => (
              <label
                key={key}
                className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors hover:bg-muted/50 ${role === key ? "border-primary bg-primary/5" : "border-border"}`}
              >
                <RadioGroupItem value={key} className="mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium">{config.label}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">{config.description}</p>
                </div>
              </label>
            ))}
          </RadioGroup>

          {/* Permissions collapsible */}
          <Collapsible open={permissionsOpen} onOpenChange={setPermissionsOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full justify-between text-muted-foreground">
                Permissões de "{roleConfig[role]?.label}"
                <ChevronDown className={`h-4 w-4 transition-transform ${permissionsOpen ? "rotate-180" : ""}`} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              <RolePermissionsView role={role} />
            </CollapsibleContent>
          </Collapsible>
        </div>
      </div>

      {/* Footer actions */}
      <div className="flex flex-col sm:flex-row sm:justify-between gap-3 pt-2">
        <div>
          {isEditing && !isSelf && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="gap-2 text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/5" disabled={isPending}>
                  <Trash2 className="h-4 w-4" />
                  Excluir usuário
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Excluir usuário?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta ação é <strong>permanente</strong>. {displayName || email} perderá o acesso ao sistema imediatamente e o vínculo com o estabelecimento será apagado. Histórico de vendas e comandas é preservado.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Excluir
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => navigate("/pdv/usuarios")} disabled={isPending}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={isPending} className="gap-2">
            <Save className="h-4 w-4" />
            {isEditing ? "Salvar Alterações" : "Criar Usuário"}
          </Button>
        </div>
      </div>
    </div>
  );
}
