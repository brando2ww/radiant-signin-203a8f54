import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Users, UserCheck, Megaphone, Gift } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import {
  usePDVCustomers,
  useCreateCustomer,
  useUpdateCustomer,
  useDeleteCustomer,
  useConvertLeadToCustomer,
  type UnifiedCustomer,
  type CustomerLead,
} from "@/hooks/use-pdv-customers";
import { CustomerCard } from "@/components/pdv/CustomerCard";
import { CustomerDialog, type CustomerFormData } from "@/components/pdv/CustomerDialog";
import { CustomerFilters } from "@/components/pdv/CustomerFilters";
import { LeadCard } from "@/components/pdv/LeadCard";
import { matchesCustomerActivity, type CustomerDateFilters } from "@/lib/customer-consumption";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CashbackSettingsCard } from "@/components/pdv/settings/CashbackSettingsCard";
import { usePDVCashbackSettings } from "@/hooks/use-pdv-cashback-settings";

export default function Customers() {
  const { customers, leads, isLoading, customersError, cashbackError, consumptionError, refetchCustomers, refetchCashback } = usePDVCustomers();
  const { data: cashbackSettings } = usePDVCashbackSettings();
  const { mutate: createCustomer, isPending: isCreating } = useCreateCustomer();
  const { mutate: updateCustomer, isPending: isUpdating } = useUpdateCustomer();
  const { mutate: deleteCustomer, isPending: isDeleting } = useDeleteCustomer();
  const { mutate: convertLead, isPending: isConverting } = useConvertLeadToCustomer();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<UnifiedCustomer | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [leadSearch, setLeadSearch] = useState("");
  const [cashbackOpen, setCashbackOpen] = useState(false);
  const [dates, setDates] = useState<CustomerDateFilters>({ source: "all", consumedFrom: "", consumedTo: "", expiresFrom: "", expiresTo: "", cashbackOnly: false });

  const filteredCustomers = useMemo(() => {
    return customers.filter((c) => {
      const matchesSearch =
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.phone?.toLowerCase().includes(search.toLowerCase()) ||
        c.email?.toLowerCase().includes(search.toLowerCase());
      const searchDigits = search.replace(/\D/g, "");
      const matchesPhone = searchDigits.length >= 3 && c.phone?.replace(/\D/g, "").includes(searchDigits);
      return (matchesSearch || matchesPhone) && matchesCustomerActivity(c, { ...dates, source: sourceFilter });
    });
  }, [customers, search, sourceFilter, dates]);

  const filteredLeads = useMemo(() => {
    if (!leadSearch) return leads;
    const q = leadSearch.toLowerCase();
    return leads.filter(
      (l) =>
        l.customer_name.toLowerCase().includes(q) ||
        l.customer_whatsapp.includes(q)
    );
  }, [leads, leadSearch]);

  // Check which lead phones already exist as customers
  const customerPhones = useMemo(() => {
    const set = new Set<string>();
    for (const c of customers) {
      if (c.phone) set.add(c.phone.replace(/\D/g, ""));
    }
    return set;
  }, [customers]);

  const handleCreate = () => {
    setSelectedCustomer(null);
    setDialogOpen(true);
  };

  const handleEdit = (customer: UnifiedCustomer) => {
    setSelectedCustomer(customer);
    setDialogOpen(true);
  };

  const handleSubmit = (data: CustomerFormData) => {
    if (selectedCustomer) {
      updateCustomer(
        { id: selectedCustomer.id, updates: data },
        { onSuccess: () => setDialogOpen(false) }
      );
    } else {
      createCustomer(data, { onSuccess: () => setDialogOpen(false) });
    }
  };

  const handleDelete = () => {
    if (deleteDialog) {
      deleteCustomer(deleteDialog, { onSuccess: () => setDeleteDialog(null) });
    }
  };

  const handleConvertLead = (lead: CustomerLead) => {
    convertLead(lead);
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-9 w-48" />
            <Skeleton className="h-5 w-80" />
          </div>
          <Skeleton className="h-10 w-40" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Clientes</h1>
          <p className="text-muted-foreground">
            Gerencie todos os clientes do estabelecimento
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
        <Button variant="outline" onClick={() => setCashbackOpen(true)}><Gift className="h-4 w-4 mr-2" />Configurar cashback</Button>
        <Button onClick={handleCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Cliente
        </Button>
        </div>
      </div>

      {cashbackSettings && !cashbackSettings.ativo && (
        <Alert>
          <AlertTitle>Cashback do salão desativado</AlertTitle>
          <AlertDescription>As comandas não estão gerando crédito. O proprietário ou gerente pode ativá-lo em “Configurar cashback”.</AlertDescription>
        </Alert>
      )}
      {consumptionError && (
        <Alert variant="destructive">
          <AlertTitle>Não foi possível carregar o histórico de consumo</AlertTitle>
          <AlertDescription>
            <p>Totais e filtros de datas podem estar incompletos.</p>
            <Button variant="outline" size="sm" onClick={() => refetchCustomers()}>Tentar novamente</Button>
          </AlertDescription>
        </Alert>
      )}
      {customersError && (
        <Alert variant="destructive">
          <AlertTitle>Não foi possível carregar todos os clientes</AlertTitle>
          <AlertDescription>
            <p>Confira sua conexão e tente novamente para visualizar o cadastro completo.</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => refetchCustomers()}>Tentar novamente</Button>
          </AlertDescription>
        </Alert>
      )}
      {cashbackError && (
        <Alert variant="destructive">
          <AlertTitle>Não foi possível atualizar os saldos de cashback</AlertTitle>
          <AlertDescription>
            <p>Os valores podem estar desatualizados. Tente novamente antes de consultar o saldo.</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => refetchCashback()}>Tentar novamente</Button>
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="customers">
        <TabsList>
          <TabsTrigger value="customers" className="gap-2">
            <UserCheck className="h-4 w-4" />
            Clientes ({customers.length})
          </TabsTrigger>
          <TabsTrigger value="leads" className="gap-2">
            <Megaphone className="h-4 w-4" />
            Leads ({leads.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="customers" className="space-y-4">
          <CustomerFilters
            search={search}
            onSearchChange={setSearch}
            sourceFilter={sourceFilter}
            onSourceFilterChange={setSourceFilter}
            totalCount={customers.length}
            filteredCount={filteredCustomers.length}
            dates={dates}
            onDatesChange={setDates}
          />

          {filteredCustomers.length === 0 ? (
            <Card>
              <CardContent className="min-h-[300px] flex items-center justify-center">
                <div className="text-center space-y-4">
                  <Users className="h-16 w-16 mx-auto text-muted-foreground" />
                  <div>
                    <h3 className="text-lg font-medium">
                      {customers.length === 0 ? "Nenhum cliente cadastrado" : "Nenhum cliente encontrado"}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {customers.length === 0
                        ? "Cadastre clientes ou preencha nome e telefone nas comandas e no delivery"
                        : "Tente ajustar os filtros de busca"}
                    </p>
                  </div>
                  {customers.length === 0 && (
                    <Button onClick={handleCreate}>
                      <Plus className="h-4 w-4 mr-2" />
                      Cadastrar Cliente
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredCustomers.map((customer) => (
                <CustomerCard
                  key={`${customer.source}-${customer.id}`}
                  customer={customer}
                  onEdit={handleEdit}
                  onDelete={(id) => setDeleteDialog(id)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="leads" className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar lead por nome ou WhatsApp..."
                value={leadSearch}
                onChange={(e) => setLeadSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <span className="text-sm text-muted-foreground whitespace-nowrap">
              {filteredLeads.length} leads capturados via avaliações
            </span>
          </div>

          {filteredLeads.length === 0 ? (
            <Card>
              <CardContent className="min-h-[300px] flex items-center justify-center">
                <div className="text-center space-y-4">
                  <Megaphone className="h-16 w-16 mx-auto text-muted-foreground" />
                  <div>
                    <h3 className="text-lg font-medium">Nenhum lead encontrado</h3>
                    <p className="text-sm text-muted-foreground">
                      Leads aparecem quando clientes preenchem avaliações
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredLeads.map((lead) => (
                <LeadCard
                  key={lead.customer_whatsapp}
                  lead={lead}
                  onConvert={handleConvertLead}
                  isConverting={isConverting}
                  alreadyCustomer={customerPhones.has(lead.customer_whatsapp.replace(/\D/g, ""))}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={cashbackOpen} onOpenChange={setCashbackOpen}>
        <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader><DialogTitle>Configuração de cashback</DialogTitle></DialogHeader>
          <CashbackSettingsCard />
        </DialogContent>
      </Dialog>

      <CustomerDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        customer={selectedCustomer}
        onSubmit={handleSubmit}
        isSubmitting={isCreating || isUpdating}
      />

      <AlertDialog open={!!deleteDialog} onOpenChange={() => setDeleteDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este cliente? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
