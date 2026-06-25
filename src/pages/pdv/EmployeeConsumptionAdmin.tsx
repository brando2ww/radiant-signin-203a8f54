import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Search, MoreVertical, Pencil, Trash2, FileText, Users, DollarSign, AlertCircle, ChevronDown, ChevronRight, HandCoins } from "lucide-react";
import { useAuthorizedEmployees, AuthorizedEmployee } from "@/hooks/use-authorized-employees";
import { useEmployeeConsumption } from "@/hooks/use-employee-consumption";
import { usePDVUsers } from "@/hooks/use-pdv-users";
import { usePDVCashier } from "@/hooks/use-pdv-cashier";
import { AuthorizedEmployeeFormSheet } from "@/components/pdv/employee-consumption/AuthorizedEmployeeFormSheet";
import { EmployeeStatementSheet } from "@/components/pdv/employee-consumption/EmployeeStatementSheet";
import { QuitarFiadoDialog } from "@/components/pdv/employee-consumption/QuitarFiadoDialog";
import { ConsumptionEntryDetails } from "@/components/pdv/employee-consumption/ConsumptionEntryDetails";
import { formatBRL } from "@/lib/format";
import { format, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { downloadCsv } from "@/lib/csv-export";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function EmployeeConsumptionAdmin() {
  const { employees, isLoading, remove } = useAuthorizedEmployees();
  const { entries, payments } = useEmployeeConsumption();
  const { users } = usePDVUsers();
  const { activeSession } = usePDVCashier();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [debtFilter, setDebtFilter] = useState<string>("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AuthorizedEmployee | null>(null);
  const [statementEmp, setStatementEmp] = useState<AuthorizedEmployee | null>(null);
  const [toDelete, setToDelete] = useState<AuthorizedEmployee | null>(null);
  const [quitarEmp, setQuitarEmp] = useState<AuthorizedEmployee | null>(null);
  const [expandedEntries, setExpandedEntries] = useState<Record<string, boolean>>({});

  const filtered = useMemo(() => {
    return employees.filter((e) => {
      if (search && !e.full_name.toLowerCase().includes(search.toLowerCase())) return false;
      if (statusFilter === "active" && !e.is_active) return false;
      if (statusFilter === "inactive" && e.is_active) return false;
      if (debtFilter === "with" && (!e.balance || e.balance <= 0)) return false;
      if (debtFilter === "without" && e.balance && e.balance > 0) return false;
      return true;
    });
  }, [employees, search, statusFilter, debtFilter]);

  const kpis = useMemo(() => {
    const totalOpen = employees.reduce((s, e) => s + (e.balance || 0), 0);
    const monthStart = startOfMonth(new Date()).toISOString();
    const monthPaid = payments
      .filter((p) => p.created_at >= monthStart)
      .reduce((s, p) => s + Number(p.amount), 0);
    const topDebtor = [...employees].sort((a, b) => (b.balance || 0) - (a.balance || 0))[0];
    return { totalOpen, monthPaid, topDebtor };
  }, [employees, payments]);

  const handleNew = () => { setEditing(null); setTimeout(() => setFormOpen(true), 0); };
  const handleEdit = (e: AuthorizedEmployee) => { setEditing(e); setTimeout(() => setFormOpen(true), 0); };

  const exportEntries = () => {
    const header = ["Cliente", "Data", "Subtotal", "Desconto", "Cupom", "Total", "Pago", "Saldo", "Status", "Operador", "Observação", "Itens"];
    const rows = entries.map((e) => {
      const emp = employees.find((x) => x.id === e.employee_id);
      const op = users.find((u: any) => u.user_id === e.operator_id);
      const itemsStr = Array.isArray(e.items)
        ? e.items.map((i: any) => `${Number(i.quantity || 0)}x ${i.product_name || ""}`).join(" | ")
        : "";
      return [
        emp?.full_name || "",
        format(new Date(e.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR }),
        Number(e.subtotal || e.total).toFixed(2),
        Number(e.discount || 0).toFixed(2),
        e.coupon_code || "",
        Number(e.total).toFixed(2),
        Number(e.paid_amount).toFixed(2),
        (Number(e.total) - Number(e.paid_amount)).toFixed(2),
        e.status,
        op?.display_name || op?.email || "",
        e.notes || "",
        itemsStr,
      ];
    });
    const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
    downloadCsv("venda-a-prazo.csv", csv);
  };

  return (
    <div className="container mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Venda a Prazo</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie clientes autorizados e acompanhe o fiado.
          </p>
        </div>
        <Button onClick={handleNew} className="gap-2">
          <Plus className="h-4 w-4" /> Novo cliente
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <DollarSign className="h-4 w-4" /> Total em aberto
            </CardDescription>
            <CardTitle className="text-2xl">{formatBRL(kpis.totalOpen)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Users className="h-4 w-4" /> Quitado no mês
            </CardDescription>
            <CardTitle className="text-2xl">{formatBRL(kpis.monthPaid)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4" /> Maior devedor
            </CardDescription>
            <CardTitle className="text-base">
              {kpis.topDebtor && kpis.topDebtor.balance
                ? `${kpis.topDebtor.full_name} · ${formatBRL(kpis.topDebtor.balance)}`
                : "—"}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Tabs defaultValue="employees">
        <TabsList>
          <TabsTrigger value="employees">Clientes</TabsTrigger>
          <TabsTrigger value="entries">Lançamentos</TabsTrigger>
        </TabsList>

        <TabsContent value="employees" className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos status</SelectItem>
                <SelectItem value="active">Ativos</SelectItem>
                <SelectItem value="inactive">Inativos</SelectItem>
              </SelectContent>
            </Select>
            <Select value={debtFilter} onValueChange={setDebtFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos saldos</SelectItem>
                <SelectItem value="with">Com dívida</SelectItem>
                <SelectItem value="without">Sem dívida</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : filtered.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                Nenhum cliente encontrado.
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filtered.map((emp) => {
                const initials =
                  emp.full_name
                    .split(" ")
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((p) => p[0])
                    .join("")
                    .toUpperCase() || "?";
                const hasDebt = (emp.balance || 0) > 0;
                return (
                  <Card key={emp.id} className={!emp.is_active ? "opacity-60" : ""}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div
                          className="flex items-center gap-3 flex-1 cursor-pointer"
                          onClick={() => setStatementEmp(emp)}
                        >
                          <Avatar>
                            {emp.avatar_url && <AvatarImage src={emp.avatar_url} />}
                            <AvatarFallback>{initials}</AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{emp.full_name}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {emp.role_title || "Sem cargo"}
                            </p>
                          </div>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setTimeout(() => setStatementEmp(emp), 0)}>
                              <FileText className="h-4 w-4 mr-2" /> Extrato
                            </DropdownMenuItem>
                            {hasDebt && (
                              <DropdownMenuItem onClick={() => setQuitarEmp(emp)}>
                                <HandCoins className="h-4 w-4 mr-2" /> Quitar
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => handleEdit(emp)}>
                              <Pencil className="h-4 w-4 mr-2" /> Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => setToDelete(emp)}
                              className="text-destructive"
                            >
                              <Trash2 className="h-4 w-4 mr-2" /> Excluir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>

                      <div className="mt-3 flex items-center justify-between">
                        <div>
                          <p className="text-xs text-muted-foreground">Saldo devedor</p>
                          <p className={`font-bold ${hasDebt ? "text-destructive" : "text-foreground"}`}>
                            {formatBRL(emp.balance || 0)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">Limite</p>
                          <p className="text-sm">
                            {emp.credit_limit > 0 ? formatBRL(emp.credit_limit) : "Sem limite"}
                          </p>
                        </div>
                      </div>

                      <div className="mt-2 flex items-center justify-between">
                        <Badge variant={emp.is_active ? "secondary" : "outline"}>
                          {emp.is_active ? "Ativo" : "Inativo"}
                        </Badge>
                        {hasDebt && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs gap-1"
                            onClick={() => setQuitarEmp(emp)}
                          >
                            <HandCoins className="h-3.5 w-3.5" />
                            Quitar
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="entries" className="space-y-4">
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={exportEntries}>
              Exportar CSV
            </Button>
          </div>
          <Card>
            <CardContent className="p-0">
              <div className="divide-y">
                {entries.length === 0 && (
                  <p className="p-6 text-center text-sm text-muted-foreground">
                    Nenhum lançamento.
                  </p>
                )}
                {entries.map((e) => {
                  const emp = employees.find((x) => x.id === e.employee_id);
                  const isOpen = !!expandedEntries[e.id];
                  return (
                    <div key={e.id} className="p-3">
                      <button
                        type="button"
                        className="w-full flex items-center justify-between gap-3 text-left"
                        onClick={() => setExpandedEntries((p) => ({ ...p, [e.id]: !p[e.id] }))}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {isOpen
                            ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                            : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                          <div className="min-w-0">
                            <p className="font-medium truncate">{emp?.full_name || "—"}</p>
                            <p className="text-xs text-muted-foreground">
                              {format(new Date(e.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })} ·{" "}
                              {Array.isArray(e.items) ? e.items.length : 0} item(s)
                              {Number(e.discount || 0) > 0 ? " · c/ desconto" : ""}
                              {e.coupon_code ? ` · ${e.coupon_code}` : ""}
                            </p>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-semibold">{formatBRL(e.total)}</p>
                          <Badge variant={e.status === "pago" ? "secondary" : "outline"} className="text-xs">
                            {e.status === "pago" ? "Pago" : e.status === "pago_parcial" ? "Parcial" : "Pendente"}
                          </Badge>
                        </div>
                      </button>
                      {isOpen && <ConsumptionEntryDetails entry={e} />}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <AuthorizedEmployeeFormSheet
        open={formOpen}
        onOpenChange={setFormOpen}
        employee={editing}
      />

      <EmployeeStatementSheet
        open={!!statementEmp}
        onOpenChange={(o) => !o && setStatementEmp(null)}
        employee={statementEmp}
      />

      {quitarEmp && (
        <QuitarFiadoDialog
          open={!!quitarEmp}
          onOpenChange={(o) => !o && setQuitarEmp(null)}
          employee={quitarEmp}
          activeSession={activeSession}
        />
      )}

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cliente?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Lançamentos existentes serão preservados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (toDelete) remove(toDelete.id);
                setToDelete(null);
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
