import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Briefcase,
  KeyRound,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Power,
  PowerOff,
  Search,
  Smartphone,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useUserRole } from "@/hooks/use-user-role";
import { formatBRL } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { VendasRepresentante } from "@/lib/vendas/types";
import {
  RESUMO_VAZIO,
  useRepresentantes,
  type RepFormValues,
  type RepLogin,
  type RepResumo,
} from "@/components/vendas/representantes/use-representantes";
import { RepresentanteFormDialog } from "@/components/vendas/representantes/RepresentanteFormDialog";
import { CredenciaisDialog, SenhaDialog, type Credenciais } from "@/components/vendas/representantes/AcessoDialogs";

const pct = (n: number) => `${Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
const semAcento = (t: string) => t.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

type Situacao = { rotulo: string; classe: string };

function situacaoDoAcesso(rep: VendasRepresentante, login: RepLogin | undefined, ehDono: boolean): Situacao {
  if (!rep.is_active) return { rotulo: "Inativo", classe: "bg-muted text-muted-foreground" };
  if (!rep.rep_user_id) return { rotulo: "Sem acesso ao app", classe: "border border-dashed text-muted-foreground" };
  if (ehDono && login && !login.is_active) {
    return { rotulo: "Acesso bloqueado", classe: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" };
  }
  return { rotulo: "App liberado", classe: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300" };
}

function Tile({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe?: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums md:text-2xl">{valor}</p>
      {detalhe && <p className="mt-0.5 text-xs text-muted-foreground">{detalhe}</p>}
    </Card>
  );
}

export default function Representantes() {
  const {
    ehDono,
    representantes,
    isLoading,
    error,
    resumo,
    resumoCarregando,
    logins,
    criar,
    salvar,
    alternarAtivo,
    redefinirSenha,
    criarAcesso,
  } = useRepresentantes();
  const { canAccess } = useUserRole();

  const [filtro, setFiltro] = useState<"ativos" | "inativos">("ativos");
  const [busca, setBusca] = useState("");
  const [formAberto, setFormAberto] = useState(false);
  const [editando, setEditando] = useState<VendasRepresentante | null>(null);
  const [credenciais, setCredenciais] = useState<Credenciais | null>(null);
  const [senhaDe, setSenhaDe] = useState<VendasRepresentante | null>(null);
  const [acessoDe, setAcessoDe] = useState<VendasRepresentante | null>(null);
  const [desativando, setDesativando] = useState<VendasRepresentante | null>(null);

  const ativos = useMemo(() => representantes.filter((r) => r.is_active), [representantes]);
  const inativos = useMemo(() => representantes.filter((r) => !r.is_active), [representantes]);

  const visiveis = useMemo(() => {
    const base = filtro === "ativos" ? ativos : inativos;
    const q = semAcento(busca.trim());
    if (!q) return base;
    return base.filter((r) => semAcento([r.name, r.email, r.region, r.phone].filter(Boolean).join(" ")).includes(q));
  }, [filtro, ativos, inativos, busca]);

  const totais = useMemo(() => {
    const t = { ...RESUMO_VAZIO };
    ativos.forEach((r) => {
      const s = resumo[r.id];
      if (!s) return;
      t.clientes += s.clientes;
      t.propostasAbertas += s.propostasAbertas;
      t.propostasValor += s.propostasValor;
      t.pedidosMes += s.pedidosMes;
      t.vendasMes += s.vendasMes;
    });
    // Comissão pendente conta também a de quem já saiu: ainda é dinheiro a pagar.
    representantes.forEach((r) => { t.comissaoPendente += resumo[r.id]?.comissaoPendente ?? 0; });
    return t;
  }, [ativos, representantes, resumo]);

  const novo = () => {
    setEditando(null);
    setFormAberto(true);
  };
  const editar = (rep: VendasRepresentante) => {
    setEditando(rep);
    setFormAberto(true);
  };

  const gravar = (valores: RepFormValues, senha: string | null) => {
    if (editando) {
      salvar.mutate(
        { rep: editando, valores },
        {
          onSuccess: () => {
            setFormAberto(false);
            toast.success("Representante atualizado");
          },
          onError: (e: any) => toast.error(e?.message || "Não foi possível salvar"),
        },
      );
      return;
    }
    criar.mutate(
      { valores, senha },
      {
        onSuccess: (rep) => {
          setFormAberto(false);
          setFiltro("ativos");
          if (senha) {
            setCredenciais({ nome: rep.name, email: rep.email ?? valores.email, senha });
          } else {
            toast.success("Representante cadastrado (sem acesso ao app por enquanto)");
          }
        },
        onError: (e: any) => toast.error(e?.message || "Não foi possível cadastrar"),
      },
    );
  };

  const trocarSenha = ({ senha }: { email: string; senha: string }) => {
    const rep = senhaDe;
    if (!rep) return;
    redefinirSenha.mutate(
      { rep, senha },
      {
        onSuccess: () => {
          setSenhaDe(null);
          setCredenciais({ nome: rep.name, email: logins[rep.rep_user_id ?? ""]?.email ?? rep.email ?? "", senha });
        },
        onError: (e: any) => toast.error(e?.message || "Não foi possível trocar a senha"),
      },
    );
  };

  const liberarApp = ({ email, senha }: { email: string; senha: string }) => {
    const rep = acessoDe;
    if (!rep) return;
    criarAcesso.mutate(
      { rep, email, senha },
      {
        onSuccess: () => {
          setAcessoDe(null);
          setCredenciais({ nome: rep.name, email, senha });
        },
        onError: (e: any) => toast.error(e?.message || "Não foi possível criar o acesso"),
      },
    );
  };

  const mudarAtivo = (rep: VendasRepresentante, ativo: boolean) => {
    alternarAtivo.mutate(
      { rep, ativo },
      {
        onSuccess: () => {
          setDesativando(null);
          toast.success(ativo ? `${rep.name} reativado` : `${rep.name} desativado`);
        },
        onError: (e: any) => toast.error(e?.message || "Não foi possível alterar"),
      },
    );
  };

  const acoes = (rep: VendasRepresentante) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Ações de ${rep.name}`}>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onClick={() => editar(rep)}>
          <Pencil className="mr-2 h-4 w-4" /> Editar
        </DropdownMenuItem>
        {ehDono && rep.rep_user_id && rep.is_active && (
          <DropdownMenuItem onClick={() => setSenhaDe(rep)}>
            <KeyRound className="mr-2 h-4 w-4" /> Gerar nova senha
          </DropdownMenuItem>
        )}
        {ehDono && !rep.rep_user_id && rep.is_active && (
          <DropdownMenuItem onClick={() => setAcessoDe(rep)}>
            <UserPlus className="mr-2 h-4 w-4" /> Liberar o app
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        {rep.is_active ? (
          <DropdownMenuItem onClick={() => setDesativando(rep)} className="text-destructive focus:text-destructive">
            <PowerOff className="mr-2 h-4 w-4" /> Desativar
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={() => mudarAtivo(rep, true)}>
            <Power className="mr-2 h-4 w-4" /> Reativar
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const numero = (n: number) => (resumoCarregando ? "·" : n.toLocaleString("pt-BR"));
  const dinheiro = (n: number) => (resumoCarregando ? "·" : formatBRL(n));

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Representantes</h1>
          <p className="text-sm text-muted-foreground">
            Quem vende para os seus clientes B2B: carteira, propostas, vendas do mês e comissão de cada um.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canAccess("/representante") && (
            <Button variant="outline" asChild className="gap-2">
              <Link to="/representante">
                <Smartphone className="h-4 w-4" /> App do representante
              </Link>
            </Button>
          )}
          <Button onClick={novo} className="gap-2">
            <Plus className="h-4 w-4" /> Novo representante
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          rotulo="Representantes ativos"
          valor={ativos.length.toLocaleString("pt-BR")}
          detalhe={`${numero(totais.clientes)} clientes nas carteiras`}
        />
        <Tile rotulo="Vendas do mês" valor={dinheiro(totais.vendasMes)} detalhe={`${numero(totais.pedidosMes)} pedidos`} />
        <Tile
          rotulo="Propostas abertas"
          valor={numero(totais.propostasAbertas)}
          detalhe={`${dinheiro(totais.propostasValor)} em negociação`}
        />
        <Tile rotulo="Comissão a pagar" valor={dinheiro(totais.comissaoPendente)} detalhe="sobre o que já foi recebido" />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <ToggleGroup
          type="single"
          value={filtro}
          onValueChange={(v) => v && setFiltro(v as "ativos" | "inativos")}
          className="justify-start"
        >
          <ToggleGroupItem value="ativos" className="px-3 text-sm">
            Ativos ({ativos.length})
          </ToggleGroupItem>
          <ToggleGroupItem value="inativos" className="px-3 text-sm">
            Inativos ({inativos.length})
          </ToggleGroupItem>
        </ToggleGroup>
        <div className="relative sm:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, e-mail ou região"
            className="pl-9"
          />
        </div>
      </div>

      {error ? (
        <Card className="p-6 text-sm text-destructive">Não foi possível carregar os representantes: {error.message}</Card>
      ) : isLoading ? (
        <Card className="flex items-center justify-center p-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </Card>
      ) : representantes.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Briefcase className="h-6 w-6 text-muted-foreground" />
          </div>
          <div>
            <p className="font-medium">Nenhum representante cadastrado ainda</p>
            <p className="text-sm text-muted-foreground">
              Cadastre quem vende para você. Cada um recebe um acesso e vê só os clientes da carteira dele.
            </p>
          </div>
          <Button onClick={novo} className="gap-2">
            <Plus className="h-4 w-4" /> Cadastrar o primeiro
          </Button>
        </Card>
      ) : visiveis.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          {busca.trim()
            ? "Nenhum representante encontrado com essa busca."
            : filtro === "inativos"
            ? "Nenhum representante inativo."
            : "Nenhum representante ativo. Reative um da aba Inativos ou cadastre um novo."}
        </Card>
      ) : (
        <>
          {/* Computador: tabela */}
          <Card className="hidden overflow-hidden lg:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Representante</TableHead>
                  <TableHead className="text-right">Carteira</TableHead>
                  <TableHead className="text-right">Propostas abertas</TableHead>
                  <TableHead className="text-right">Vendas do mês</TableHead>
                  <TableHead className="text-right">Comissão pendente</TableHead>
                  <TableHead>Condições</TableHead>
                  <TableHead>Acesso</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visiveis.map((rep) => {
                  const s: RepResumo = resumo[rep.id] ?? RESUMO_VAZIO;
                  const sit = situacaoDoAcesso(rep, logins[rep.rep_user_id ?? ""], ehDono);
                  return (
                    <TableRow key={rep.id} className={cn(!rep.is_active && "opacity-70")}>
                      <TableCell>
                        <button className="text-left font-medium hover:underline" onClick={() => editar(rep)}>
                          {rep.name}
                        </button>
                        <p className="text-xs text-muted-foreground">
                          {[rep.region, rep.email].filter(Boolean).join(" · ") || "·"}
                        </p>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {numero(s.clientes)} <span className="text-xs text-muted-foreground">clientes</span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {numero(s.propostasAbertas)}
                        {s.propostasAbertas > 0 && (
                          <p className="text-xs text-muted-foreground">{dinheiro(s.propostasValor)}</p>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {dinheiro(s.vendasMes)}
                        {s.pedidosMes > 0 && (
                          <p className="text-xs text-muted-foreground">
                            {s.pedidosMes} {s.pedidosMes === 1 ? "pedido" : "pedidos"}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{dinheiro(s.comissaoPendente)}</TableCell>
                      <TableCell className="text-sm">
                        <span className="tabular-nums">{pct(rep.commission_percent)}</span>{" "}
                        <span className="text-xs text-muted-foreground">comissão</span>
                        <p className="text-xs text-muted-foreground">
                          até {pct(rep.max_discount_percent)} de desconto
                        </p>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn("whitespace-nowrap border-transparent font-normal", sit.classe)}>
                          {sit.rotulo}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{acoes(rep)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>

          {/* Celular e tablet: cartões */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:hidden">
            {visiveis.map((rep) => {
              const s: RepResumo = resumo[rep.id] ?? RESUMO_VAZIO;
              const sit = situacaoDoAcesso(rep, logins[rep.rep_user_id ?? ""], ehDono);
              return (
                <Card key={rep.id} className={cn("p-4", !rep.is_active && "opacity-70")}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <button className="text-left font-medium hover:underline" onClick={() => editar(rep)}>
                        {rep.name}
                      </button>
                      <p className="truncate text-xs text-muted-foreground">
                        {[rep.region, rep.email].filter(Boolean).join(" · ") || "·"}
                      </p>
                    </div>
                    {acoes(rep)}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Carteira</p>
                      <p className="tabular-nums">{numero(s.clientes)} clientes</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Propostas abertas</p>
                      <p className="tabular-nums">{numero(s.propostasAbertas)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Vendas do mês</p>
                      <p className="tabular-nums">{dinheiro(s.vendasMes)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Comissão pendente</p>
                      <p className="tabular-nums">{dinheiro(s.comissaoPendente)}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                    <p className="text-xs text-muted-foreground">
                      {pct(rep.commission_percent)} de comissão · até {pct(rep.max_discount_percent)} de desconto
                    </p>
                    <Badge variant="outline" className={cn("border-transparent font-normal", sit.classe)}>
                      {sit.rotulo}
                    </Badge>
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}

      {!ehDono && representantes.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Criar o acesso ao app e trocar a senha de um representante é com o proprietário do estabelecimento.
        </p>
      )}

      <RepresentanteFormDialog
        open={formAberto}
        onOpenChange={setFormAberto}
        rep={editando}
        podeCriarAcesso={ehDono}
        salvando={criar.isPending || salvar.isPending}
        onSalvar={gravar}
      />

      <SenhaDialog
        modo="senha"
        rep={senhaDe}
        salvando={redefinirSenha.isPending}
        onClose={() => setSenhaDe(null)}
        onConfirmar={trocarSenha}
      />
      <SenhaDialog
        modo="acesso"
        rep={acessoDe}
        salvando={criarAcesso.isPending}
        onClose={() => setAcessoDe(null)}
        onConfirmar={liberarApp}
      />

      <CredenciaisDialog dados={credenciais} onClose={() => setCredenciais(null)} />

      <AlertDialog open={!!desativando} onOpenChange={(o) => !o && setDesativando(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desativar {desativando?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {ehDono
                ? "Ele deixa de entrar no app de vendas. "
                : "Ele deixa de ver os clientes, propostas e pedidos no app. "}
              Nada é apagado: a carteira, as propostas, os pedidos e as comissões dele continuam guardados, e você pode
              reativar quando quiser. Para passar os clientes a outro representante, use a tela de Clientes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={alternarAtivo.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (desativando) mudarAtivo(desativando, false);
              }}
              disabled={alternarAtivo.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {alternarAtivo.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Desativar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
