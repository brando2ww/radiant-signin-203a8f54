import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { ArrowLeft, Pencil, Save, Eye, EyeOff } from "lucide-react";
import { useTenants, TenantModule, TenantIntegration } from "@/hooks/use-tenants";
import { FranchiseSection } from "@/components/super-admin/FranchiseSection";
import { availableModules } from "@/components/super-admin/ModuleSelector";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

const roleLabels: Record<string, string> = {
  proprietario: "Proprietário",
  gerente: "Gerente",
  caixa: "Caixa",
  garcom: "Garçom",
  cozinheiro: "Cozinheiro",
  estoquista: "Estoquista",
  financeiro: "Financeiro",
  atendente_delivery: "Atendente Delivery",
};

const roleOptions = Object.entries(roleLabels);

const availableIntegrations = [
  { slug: "pagseguro", label: "PagSeguro" },
  { slug: "stone", label: "Stone" },
  { slug: "getnet", label: "Getnet" },
  { slug: "rede", label: "Rede" },
  { slug: "nf_automatica", label: "NF Automática" },
  { slug: "goomer", label: "Goomer" },
  { slug: "whatsapp", label: "WhatsApp" },
  { slug: "delivery_proprio", label: "Delivery Próprio" },
  { slug: "ifood", label: "iFood" },
];

export default function TenantDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    tenants,
    fetchTenantModules,
    fetchTenantUsers,
    fetchTenantIntegrations,
    updateTenantUser,
    upsertTenantModule,
    saveTenantIntegrations,
  } = useTenants();

  const [modules, setModules] = useState<TenantModule[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [integrations, setIntegrations] = useState<TenantIntegration[]>([]);
  const [selectedIntegrations, setSelectedIntegrations] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingModules, setSavingModules] = useState(false);
  const [savingIntegrations, setSavingIntegrations] = useState(false);

  // Edit user dialog
  const [editUser, setEditUser] = useState<any | null>(null);
  const [editRole, setEditRole] = useState("");
  const [editActive, setEditActive] = useState(true);
  const [editMaxDiscount, setEditMaxDiscount] = useState(100);
  const [editDiscountPw, setEditDiscountPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [savingUser, setSavingUser] = useState(false);

  const tenant = tenants.find((t) => t.id === id);
  const parentTenant = tenant?.parent_tenant_id
    ? tenants.find((t) => t.id === tenant.parent_tenant_id)
    : null;

  const loadData = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [mods, usrs, ints] = await Promise.all([
        fetchTenantModules(id),
        fetchTenantUsers(id),
        fetchTenantIntegrations(id),
      ]);
      setModules(mods);
      setUsers(usrs);
      setIntegrations(ints);
      setSelectedIntegrations(ints.filter((i) => i.is_active).map((i) => i.integration_slug));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [id]);

  const handleToggleModule = async (moduleSlug: string, nextActive: boolean) => {
    if (!id) return;
    setSavingModules(true);
    try {
      await upsertTenantModule(id, moduleSlug, nextActive);
      const mods = await fetchTenantModules(id);
      setModules(mods);
      toast.success(`Módulo ${moduleSlug} ${nextActive ? "ativado" : "desativado"}`);
    } catch {
      toast.error("Erro ao atualizar módulo");
    } finally {
      setSavingModules(false);
    }
  };

  const handleSaveIntegrations = async () => {
    if (!id) return;
    setSavingIntegrations(true);
    try {
      await saveTenantIntegrations(id, selectedIntegrations);
      toast.success("Integrações salvas!");
    } catch {
      toast.error("Erro ao salvar integrações");
    } finally {
      setSavingIntegrations(false);
    }
  };

  const toggleIntegration = (slug: string) => {
    setSelectedIntegrations((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]
    );
  };

  const openEditUser = (u: any) => {
    setEditUser(u);
    setEditRole(u.role);
    setEditActive(u.is_active ?? true);
    setEditMaxDiscount(u.max_discount_percent ?? 100);
    setEditDiscountPw(u.discount_password ?? "");
    setShowPw(false);
  };

  const handleSaveUser = async () => {
    if (!editUser) return;
    setSavingUser(true);
    try {
      await updateTenantUser(editUser.id, {
        role: editRole as any,
        is_active: editActive,
        max_discount_percent: editMaxDiscount,
        discount_password: editDiscountPw || undefined,
      });
      setUsers((prev) =>
        prev.map((u) =>
          u.id === editUser.id
            ? {
                ...u,
                role: editRole,
                is_active: editActive,
                max_discount_percent: editMaxDiscount,
                discount_password: editDiscountPw,
              }
            : u
        )
      );
      toast.success("Usuário atualizado!");
      setEditUser(null);
    } catch {
      toast.error("Erro ao atualizar usuário");
    } finally {
      setSavingUser(false);
    }
  };

  if (!tenant) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Tenant não encontrado.
        <br />
        <Button variant="link" onClick={() => navigate("/admin/tenants")}>
          Voltar
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/admin/tenants")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">{tenant.name}</h1>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{tenant.document || "Sem documento"}</span>
            <Badge variant={tenant.is_active ? "default" : "secondary"} className="text-xs">
              {tenant.is_active ? "Ativo" : "Inativo"}
            </Badge>
            {!tenant.parent_tenant_id && (
              <Badge variant="outline" className="text-xs">Matriz</Badge>
            )}
            {parentTenant && (
              <Badge
                variant="outline"
                className="text-xs cursor-pointer"
                onClick={() => navigate(`/admin/tenants/${parentTenant.id}`)}
              >
                Franquia de {parentTenant.name}
              </Badge>
            )}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : (
        <>
          {/* Módulos */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Módulos Habilitados</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {availableModules.map((mod) => {
                  const current = modules.find((m) => m.module === mod.value);
                  const isActive = !!current?.is_active;
                  return (
                    <div key={mod.value} className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium">{mod.label}</p>
                        <p className="text-xs text-muted-foreground">{mod.description}</p>
                      </div>
                      <Switch
                        checked={isActive}
                        disabled={savingModules}
                        onCheckedChange={(checked) => handleToggleModule(mod.value, checked)}
                      />
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Integrações */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Integrações Autorizadas</CardTitle>
              <Button size="sm" onClick={handleSaveIntegrations} disabled={savingIntegrations}>
                <Save className="h-4 w-4 mr-1" /> Salvar
              </Button>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {availableIntegrations.map((integ) => (
                  <label key={integ.slug} className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={selectedIntegrations.includes(integ.slug)}
                      onCheckedChange={() => toggleIntegration(integ.slug)}
                    />
                    <span className="text-sm">{integ.label}</span>
                  </label>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Usuários */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Usuários ({users.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {users.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum usuário cadastrado.</p>
              ) : (
                <div className="space-y-3">
                  {users.map((u) => (
                    <div key={u.id} className="flex items-center justify-between border rounded-lg p-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{u.display_name || "Sem nome"}</p>
                        <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <Badge variant="outline" className="text-xs">
                            {roleLabels[u.role] || u.role}
                          </Badge>
                          <Badge variant={u.is_active ? "default" : "secondary"} className="text-xs">
                            {u.is_active ? "Ativo" : "Inativo"}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            Desc. máx: {u.max_discount_percent ?? 100}%
                          </span>
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => openEditUser(u)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Franquias */}
          <FranchiseSection tenantId={id!} allTenants={tenants} />

          {/* Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Informações</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-1 text-muted-foreground">
              <p>
                Criado em:{" "}
                {format(new Date(tenant.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              </p>
              <p>
                Atualizado em:{" "}
                {format(new Date(tenant.updated_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              </p>
            </CardContent>
          </Card>
        </>
      )}

      {/* Edit User Dialog */}
      <Dialog open={!!editUser} onOpenChange={(open) => !open && setEditUser(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Usuário</DialogTitle>
            <DialogDescription>{editUser?.display_name || editUser?.email}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-sm">Função</Label>
              <Select value={editRole} onValueChange={setEditRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {roleOptions.map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">Desconto máximo (%)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={editMaxDiscount}
                onChange={(e) => setEditMaxDiscount(Number(e.target.value))}
              />
            </div>
            <div>
              <Label className="text-sm">Senha de desconto</Label>
              <div className="flex gap-2">
                <Input
                  type={showPw ? "text" : "password"}
                  maxLength={6}
                  placeholder="0000"
                  value={editDiscountPw}
                  onChange={(e) => setEditDiscountPw(e.target.value.replace(/\D/g, ""))}
                />
                <Button type="button" variant="outline" size="icon" onClick={() => setShowPw(!showPw)}>
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-sm">Ativo</Label>
              <Switch checked={editActive} onCheckedChange={setEditActive} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUser(null)}>Cancelar</Button>
            <Button onClick={handleSaveUser} disabled={savingUser}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
