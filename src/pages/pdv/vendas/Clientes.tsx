import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, MessageCircle, Pencil, Plus, Search, UserCog, Users, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ClienteDialog } from "@/components/vendas/clientes/ClienteDialog";
import { documentoCliente, linkWhatsApp, soDigitos } from "@/components/vendas/clientes/cliente-utils";
import { useTrocarRepresentante, useVendasClientes, useVendasRepresentantesLista } from "@/hooks/use-vendas-clientes";
import type { VendasCliente } from "@/lib/vendas/types";

const TODOS = "__todos__";
const SEM = "__sem__";
const POR_PAGINA = 300;

const normalizar = (v: string | null | undefined) =>
  (v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

export default function Clientes() {
  const navigate = useNavigate();
  const [incluirBalcao, setIncluirBalcao] = useState(false);
  const { clientes, isLoading } = useVendasClientes({ incluirBalcao });
  const { representantes } = useVendasRepresentantesLista();
  const trocar = useTrocarRepresentante();

  const [busca, setBusca] = useState("");
  const [repFiltro, setRepFiltro] = useState(TODOS);
  const [cidadeFiltro, setCidadeFiltro] = useState(TODOS);
  const [limite, setLimite] = useState(POR_PAGINA);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [dialogo, setDialogo] = useState<{ aberto: boolean; cliente: VendasCliente | null }>({ aberto: false, cliente: null });
  const [troca, setTroca] = useState<{ aberto: boolean; rep: string }>({ aberto: false, rep: SEM });

  const repPorId = useMemo(() => new Map(representantes.map((r) => [r.id, r])), [representantes]);

  const cidades = useMemo(() => {
    const m = new Map<string, string>();
    clientes.forEach((c) => {
      const cidade = c.city?.trim();
      if (cidade && !m.has(normalizar(cidade))) m.set(normalizar(cidade), cidade);
    });
    return Array.from(m.values()).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [clientes]);

  const filtrados = useMemo(() => {
    const q = normalizar(busca.trim());
    const qDig = soDigitos(busca);
    return clientes.filter((c) => {
      if (repFiltro === SEM && c.representative_id) return false;
      if (repFiltro !== TODOS && repFiltro !== SEM && c.representative_id !== repFiltro) return false;
      if (cidadeFiltro !== TODOS && normalizar(c.city?.trim()) !== normalizar(cidadeFiltro)) return false;
      if (!q) return true;
      const texto = normalizar(
        [c.name, c.trade_name, c.company_name, c.contact_name, c.city, c.email].filter(Boolean).join(" "),
      );
      if (texto.includes(q)) return true;
      if (qDig.length >= 3) {
        return [c.cnpj, c.cpf, c.whatsapp, c.phone].some((v) => soDigitos(v).includes(qDig));
      }
      return false;
    });
  }, [clientes, busca, repFiltro, cidadeFiltro]);

  const visiveis = filtrados.slice(0, limite);
  const todosMarcados = filtrados.length > 0 && filtrados.every((c) => selecionados.has(c.id));
  const algunsMarcados = !todosMarcados && filtrados.some((c) => selecionados.has(c.id));

  const alternar = (id: string, marcar: boolean) =>
    setSelecionados((s) => {
      const n = new Set(s);
      if (marcar) n.add(id);
      else n.delete(id);
      return n;
    });

  const alternarTodos = (marcar: boolean) =>
    setSelecionados((s) => {
      const n = new Set(s);
      filtrados.forEach((c) => (marcar ? n.add(c.id) : n.delete(c.id)));
      return n;
    });

  const confirmarTroca = async () => {
    const ids = Array.from(selecionados);
    try {
      const n = await trocar.mutateAsync({ ids, representanteId: troca.rep === SEM ? null : troca.rep });
      const nomeRep = troca.rep === SEM ? "sem representante" : repPorId.get(troca.rep)?.name;
      toast.success(`${n} ${n === 1 ? "cliente passou" : "clientes passaram"} para ${nomeRep}.`);
      setSelecionados(new Set());
      setTroca({ aberto: false, rep: SEM });
    } catch (e: any) {
      toast.error("Não foi possível trocar o representante. " + (e?.message ?? ""));
    }
  };

  const limparFiltros = () => {
    setBusca("");
    setRepFiltro(TODOS);
    setCidadeFiltro(TODOS);
  };

  const temFiltro = busca || repFiltro !== TODOS || cidadeFiltro !== TODOS;

  return (
    <div className="space-y-5 p-4 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Clientes</h1>
          <p className="text-sm text-muted-foreground">Carteira B2B: quem compra pelos representantes e por proposta.</p>
        </div>
        <Button onClick={() => setDialogo({ aberto: true, cliente: null })} className="w-full sm:w-auto">
          <Plus className="mr-2 h-4 w-4" /> Novo cliente
        </Button>
      </div>

      <Card className="space-y-3 p-3 sm:p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_240px_220px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value);
                setLimite(POR_PAGINA);
              }}
              placeholder="Buscar por nome, CNPJ, cidade, contato..."
              className="pl-9"
            />
          </div>
          <Select value={repFiltro} onValueChange={setRepFiltro}>
            <SelectTrigger aria-label="Representante">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todos os representantes</SelectItem>
              <SelectItem value={SEM}>Sem representante</SelectItem>
              {representantes.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.name}
                  {!r.is_active ? " (inativo)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={cidadeFiltro} onValueChange={setCidadeFiltro}>
            <SelectTrigger aria-label="Cidade">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todas as cidades</SelectItem>
              {cidades.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Switch
              id="incluir-balcao"
              checked={incluirBalcao}
              onCheckedChange={(v) => {
                setIncluirBalcao(v);
                setSelecionados(new Set());
              }}
            />
            <Label htmlFor="incluir-balcao" className="text-sm font-normal">
              Incluir clientes do balcão
            </Label>
          </div>
          <p className="text-sm text-muted-foreground">
            {isLoading
              ? "Carregando..."
              : `${filtrados.length} ${filtrados.length === 1 ? "cliente" : "clientes"}${
                  filtrados.length !== clientes.length ? ` de ${clientes.length}` : ""
                }`}
            {temFiltro && (
              <Button variant="link" size="sm" className="h-auto px-2 py-0" onClick={limparFiltros}>
                Limpar filtros
              </Button>
            )}
          </p>
        </div>
      </Card>

      {selecionados.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
          <span className="text-sm font-medium">
            {selecionados.size} {selecionados.size === 1 ? "selecionado" : "selecionados"}
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setSelecionados(new Set())}>
              <X className="mr-1 h-4 w-4" /> Limpar
            </Button>
            <Button size="sm" onClick={() => setTroca({ aberto: true, rep: SEM })}>
              <UserCog className="mr-1.5 h-4 w-4" /> Trocar representante
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <Card className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </Card>
      ) : clientes.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 px-4 py-14 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <Users className="h-7 w-7 text-muted-foreground" />
          </div>
          <div>
            <p className="font-medium">Nenhum cliente B2B ainda</p>
            <p className="text-sm text-muted-foreground">
              Cadastre o primeiro pelo CNPJ: os dados da Receita entram sozinhos.
            </p>
          </div>
          <Button onClick={() => setDialogo({ aberto: true, cliente: null })}>
            <Plus className="mr-2 h-4 w-4" /> Cadastrar cliente
          </Button>
        </Card>
      ) : filtrados.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
          Nenhum cliente com estes filtros.
          <Button variant="outline" size="sm" onClick={limparFiltros}>
            Limpar filtros
          </Button>
        </Card>
      ) : (
        <>
          {/* Computador */}
          <Card className="hidden overflow-hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={todosMarcados ? true : algunsMarcados ? "indeterminate" : false}
                      onCheckedChange={(v) => alternarTodos(v === true)}
                      aria-label="Selecionar todos"
                    />
                  </TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Cidade</TableHead>
                  <TableHead>Representante</TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead>Condição</TableHead>
                  <TableHead className="w-24 text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visiveis.map((c) => {
                  const rep = c.representative_id ? repPorId.get(c.representative_id) : null;
                  const wpp = linkWhatsApp(c.whatsapp);
                  return (
                    <TableRow
                      key={c.id}
                      className="cursor-pointer"
                      data-state={selecionados.has(c.id) ? "selected" : undefined}
                      onClick={() => navigate(`/pdv/vendas/clientes/${c.id}`)}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selecionados.has(c.id)}
                          onCheckedChange={(v) => alternar(c.id, v === true)}
                          aria-label={`Selecionar ${c.name}`}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{c.name}</span>
                          {!c.is_b2b && (
                            <Badge variant="outline" className="text-[10px]">
                              Balcão
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {[c.company_name && c.company_name !== c.name ? c.company_name : null, documentoCliente(c)]
                            .filter(Boolean)
                            .join(" · ") || "·"}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {c.city ? `${c.city}${c.state ? `/${c.state}` : ""}` : <span className="text-muted-foreground">·</span>}
                      </TableCell>
                      <TableCell className="text-sm">
                        {rep ? rep.name : <span className="text-muted-foreground">Sem representante</span>}
                      </TableCell>
                      <TableCell className="text-sm">
                        <div>{c.contact_name || <span className="text-muted-foreground">·</span>}</div>
                        {c.whatsapp && <div className="text-xs text-muted-foreground">{c.whatsapp}</div>}
                      </TableCell>
                      <TableCell className="text-sm">{c.payment_terms || <span className="text-muted-foreground">·</span>}</TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-1">
                          {wpp && (
                            <Button asChild size="icon" variant="ghost" className="h-8 w-8" title="WhatsApp">
                              <a href={wpp} target="_blank" rel="noreferrer">
                                <MessageCircle className="h-4 w-4" />
                              </a>
                            </Button>
                          )}
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            title="Editar"
                            onClick={() => setDialogo({ aberto: true, cliente: c })}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>

          {/* Celular */}
          <div className="space-y-2 md:hidden">
            <div className="flex items-center gap-2 px-1">
              <Checkbox
                id="marcar-todos-m"
                checked={todosMarcados ? true : algunsMarcados ? "indeterminate" : false}
                onCheckedChange={(v) => alternarTodos(v === true)}
              />
              <Label htmlFor="marcar-todos-m" className="text-sm font-normal text-muted-foreground">
                Selecionar todos
              </Label>
            </div>
            {visiveis.map((c) => {
              const rep = c.representative_id ? repPorId.get(c.representative_id) : null;
              return (
                <Card
                  key={c.id}
                  className="flex cursor-pointer items-start gap-3 p-3"
                  onClick={() => navigate(`/pdv/vendas/clientes/${c.id}`)}
                >
                  <div className="pt-0.5" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selecionados.has(c.id)}
                      onCheckedChange={(v) => alternar(c.id, v === true)}
                      aria-label={`Selecionar ${c.name}`}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium">{c.name}</p>
                      {!c.is_b2b && (
                        <Badge variant="outline" className="shrink-0 text-[10px]">
                          Balcão
                        </Badge>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {[c.city ? `${c.city}${c.state ? `/${c.state}` : ""}` : null, documentoCliente(c)]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{rep ? rep.name : "Sem representante"}</p>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 shrink-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDialogo({ aberto: true, cliente: c });
                    }}
                    aria-label="Editar"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </Card>
              );
            })}
          </div>

          {filtrados.length > visiveis.length && (
            <div className="flex justify-center">
              <Button variant="outline" onClick={() => setLimite((l) => l + POR_PAGINA)}>
                Mostrar mais ({filtrados.length - visiveis.length} restantes)
              </Button>
            </div>
          )}
        </>
      )}

      <ClienteDialog
        open={dialogo.aberto}
        onOpenChange={(v) => setDialogo((d) => ({ ...d, aberto: v }))}
        cliente={dialogo.cliente}
        mode="gestao"
      />

      <Dialog open={troca.aberto} onOpenChange={(v) => !trocar.isPending && setTroca((t) => ({ ...t, aberto: v }))}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-md">
          <DialogHeader>
            <DialogTitle>Trocar representante</DialogTitle>
            <DialogDescription>
              {selecionados.size} {selecionados.size === 1 ? "cliente vai" : "clientes vão"} para a carteira escolhida. Propostas
              e pedidos já feitos continuam com quem os fez.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Novo representante</Label>
            <Select value={troca.rep} onValueChange={(v) => setTroca((t) => ({ ...t, rep: v }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM}>Sem representante</SelectItem>
                {representantes
                  .filter((r) => r.is_active)
                  .map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setTroca((t) => ({ ...t, aberto: false }))} disabled={trocar.isPending}>
              Cancelar
            </Button>
            <Button onClick={confirmarTroca} disabled={trocar.isPending}>
              {trocar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Trocar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
