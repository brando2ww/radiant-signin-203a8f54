import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  Bell, ChefHat, Loader2, Minus, Plus, Receipt, Search, ShoppingBag, Trash2, Users, UtensilsCrossed,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/format";
import {
  lerSessaoMesa, limparSessaoMesa, mesaAbrir, mesaCardapio, mesaChamar, mesaComandas, mesaEntrar, mesaEstado,
  mesaFecharConta, mesaPedir, salvarSessaoMesa, traduzErroMesa,
  type MesaAbertura, type MesaCardapio, type MesaComanda, type MesaComandas, type MesaEstado, type MesaProduto,
} from "@/hooks/use-mesa-digital";
import { ProdutoMesaSheet, type ItemCarrinho } from "@/components/mesa/ProdutoMesaSheet";
import { formatTableLabel } from "@/utils/formatTableNumber";

/**
 * Preço do prato na lista. Quando parte do preço vem de uma opção obrigatória (ex.: Tamanho: Meio ou Inteira, com o
 * prato a R$ 0 no cadastro), mostra "a partir de" o menor valor possível em vez de R$ 0,00.
 */
function precoNaLista(p: MesaProduto): string {
  let minimo = p.preco;
  let varia = false;
  for (const o of p.opcoes) {
    if (!o.obrigatorio && !(o.min > 0)) continue;
    const precos = o.itens.map((i) => i.preco ?? 0).sort((a, b) => a - b);
    if (!precos.length) continue;
    minimo += precos.slice(0, Math.max(1, o.min || 1)).reduce((a, b) => a + b, 0);
    if (precos[0] !== precos[precos.length - 1]) varia = true;
  }
  return varia ? `a partir de ${formatBRL(minimo)}` : formatBRL(minimo);
}

const CONSULTA_MS = 6000;

function mascaraCelular(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}`;
}

function semAcento(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export default function MesaDigitalPublica() {
  const { token: tokenBruto = "" } = useParams<{ token: string }>();
  const token = (tokenBruto.match(/[0-9a-f]{20}/i)?.[0] ?? tokenBruto).toLowerCase();

  const [abertura, setAbertura] = useState<MesaAbertura | null>(null);
  const [erroAbertura, setErroAbertura] = useState<string | null>(null);
  const [sessao, setSessao] = useState<string | null>(() => lerSessaoMesa(token));
  const [estado, setEstado] = useState<MesaEstado | null>(null);
  const [cardapio, setCardapio] = useState<MesaCardapio | null>(null);

  const [aba, setAba] = useState<"cardapio" | "conta">("cardapio");
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState<string | null>(null);
  const [produtoAberto, setProdutoAberto] = useState<MesaProduto | null>(null);
  const [carrinho, setCarrinho] = useState<(ItemCarrinho & { qtd: number })[]>([]);
  const [carrinhoAberto, setCarrinhoAberto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const chaveEnvio = useRef<string | null>(null);
  const [confirmarConta, setConfirmarConta] = useState(false);

  // entrada
  const [nome, setNome] = useState("");
  const [celular, setCelular] = useState("");
  const [mesaEscolhida, setMesaEscolhida] = useState<string>("");
  const [entrando, setEntrando] = useState(false);
  // Várias comandas na mesa (20/10/2026): a lista das abertas e a escolha (entrar numa ou abrir nova)
  const [lista, setLista] = useState<MesaComandas | null>(null);
  const [carregandoLista, setCarregandoLista] = useState(false);
  const [escolha, setEscolha] = useState<{ tipo: "nova" } | { tipo: "entrar"; comanda: MesaComanda } | null>(null);

  const cor = abertura?.restaurante?.cor || "#111827";

  // ── abertura do QR ──
  useEffect(() => {
    let vivo = true;
    mesaAbrir(token)
      .then((r) => {
        if (!vivo) return;
        if (r.error) setErroAbertura(traduzErroMesa(r.error));
        else setAbertura(r);
      })
      .catch(() => vivo && setErroAbertura(traduzErroMesa()));
    return () => {
      vivo = false;
    };
  }, [token]);

  useEffect(() => {
    if (abertura?.restaurante?.nome) document.title = abertura.restaurante.nome;
  }, [abertura]);

  // ── comandas abertas da mesa (antes de entrar) ──
  const mesaAtual = abertura?.tipo === "mesa" ? abertura.mesa?.id ?? null : mesaEscolhida || null;
  const carregarLista = useCallback(async () => {
    if (!abertura?.caixa_aberto || !mesaAtual) {
      setLista(null);
      return;
    }
    setCarregandoLista(true);
    try {
      const l = await mesaComandas(token, mesaAtual);
      setLista(l.error ? null : l);
    } catch {
      setLista(null);
    } finally {
      setCarregandoLista(false);
    }
  }, [abertura?.caixa_aberto, mesaAtual, token]);

  useEffect(() => {
    if (sessao) return;
    setEscolha(null);
    carregarLista();
  }, [sessao, carregarLista]);

  // ── estado da mesa (consulta periódica enquanto a página está à vista) ──
  const atualizar = useCallback(async () => {
    if (!sessao) return;
    try {
      const e = await mesaEstado(sessao);
      if (e.error) {
        limparSessaoMesa(token);
        setSessao(null);
        setEstado(null);
        return;
      }
      setEstado(e);
    } catch {
      /* sem rede: tenta de novo na próxima volta */
    }
  }, [sessao, token]);

  useEffect(() => {
    if (!sessao) return;
    atualizar();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") atualizar();
    }, CONSULTA_MS);
    const aoVoltar = () => document.visibilityState === "visible" && atualizar();
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [sessao, atualizar]);

  // ── cardápio ──
  useEffect(() => {
    if (!sessao || cardapio) return;
    mesaCardapio(token)
      .then((c) => (c.error ? toast.error(traduzErroMesa(c.error)) : setCardapio(c)))
      .catch(() => toast.error("Não consegui carregar o cardápio. Puxe a tela para atualizar."));
  }, [sessao, token, cardapio]);

  const categorias = useMemo(() => {
    if (!cardapio) return [];
    const q = semAcento(busca.trim());
    return cardapio.categorias
      .filter((c) => !categoria || c.nome === categoria || q)
      .map((c) => ({
        ...c,
        produtos: q
          ? c.produtos.filter((p) => semAcento(`${p.nome} ${p.descricao ?? ""}`).includes(q))
          : c.produtos,
      }))
      .filter((c) => c.produtos.length > 0);
  }, [cardapio, busca, categoria]);

  // ── ações ──
  const entrar = async () => {
    const mesaId = abertura?.tipo === "mesa" ? abertura.mesa?.id ?? null : mesaEscolhida || null;
    if (abertura?.tipo === "geral" && !mesaId) return toast.error("Escolha a sua mesa.");
    setEntrando(true);
    try {
      const r = await mesaEntrar(
        token,
        mesaId,
        nome,
        celular,
        escolha?.tipo === "entrar" ? { comandaId: escolha.comanda.id } : { nova: true },
      );
      if (r.error === "comanda_fechando" || r.error === "comanda_invalida") {
        setEscolha(null);
        carregarLista();
      }
      if (r.error || !r.sessao) return toast.error(traduzErroMesa(r.error));
      salvarSessaoMesa(token, r.sessao);
      setSessao(r.sessao);
    } catch {
      toast.error(traduzErroMesa());
    } finally {
      setEntrando(false);
    }
  };

  const adicionarAoCarrinho = (item: ItemCarrinho) => {
    setCarrinho((c) => [...c, { ...item, qtd: item.pedido.quantity }]);
    setProdutoAberto(null);
    chaveEnvio.current = null; // carrinho mudou: é outro pedido
    toast.success("Adicionado ao pedido");
  };

  const mudarQtd = (chave: string, delta: number) => {
    chaveEnvio.current = null;
    setCarrinho((c) =>
      c
        .map((i) => (i.chave === chave ? { ...i, qtd: Math.min(20, i.qtd + delta) } : i))
        .filter((i) => i.qtd > 0),
    );
  };

  const totalCarrinho = carrinho.reduce((s, i) => s + i.precoUnitario * i.qtd, 0);
  const qtdCarrinho = carrinho.reduce((s, i) => s + i.qtd, 0);

  const enviar = async () => {
    if (!sessao || carrinho.length === 0) return;
    // A mesma chave em todas as tentativas deste carrinho: se a rede cair
    // depois de o servidor gravar, o reenvio não duplica o pedido.
    chaveEnvio.current ??= crypto.randomUUID();
    setEnviando(true);
    try {
      const r = await mesaPedir(
        sessao,
        carrinho.map((i) => ({ ...i.pedido, quantity: i.qtd })),
        chaveEnvio.current,
      );
      if (r.error) return toast.error(traduzErroMesa(r.error, r.detalhe));
      setCarrinho([]);
      chaveEnvio.current = null;
      setCarrinhoAberto(false);
      setAba("conta");
      toast.success("Pedido enviado para a cozinha!");
      atualizar();
    } catch {
      toast.error("Sem conexão. Toque em enviar de novo: o pedido não vai duplicar.");
    } finally {
      setEnviando(false);
    }
  };

  const chamarGarcom = async () => {
    if (!sessao) return;
    const r = await mesaChamar(sessao).catch(() => ({ error: "x" }));
    if (r.error) return toast.error(traduzErroMesa(r.error));
    toast.success("O garçom foi chamado.");
    atualizar();
  };

  const fecharConta = async () => {
    if (!sessao) return;
    setConfirmarConta(false);
    try {
      const e = await mesaFecharConta(sessao);
      if (e.error) return toast.error(traduzErroMesa(e.error));
      setEstado(e);
      setAba("conta");
    } catch {
      toast.error(traduzErroMesa());
    }
  };

  const recomecar = () => {
    limparSessaoMesa(token);
    setSessao(null);
    setEstado(null);
    setCarrinho([]);
    setLista(null); // a lista volta do servidor, com quem entrou depois
  };

  // ── telas ──
  if (erroAbertura) {
    return (
      <Tela>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
          <UtensilsCrossed className="h-10 w-10 text-muted-foreground" />
          <p className="text-base">{erroAbertura}</p>
        </div>
      </Tela>
    );
  }

  if (!abertura) {
    return (
      <Tela>
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </Tela>
    );
  }

  const r = abertura.restaurante;

  if (estado?.status === "encerrada") {
    return (
      <Tela>
        <Topo r={r} cor={cor} />
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
          <p className="text-lg font-semibold">Obrigado pela visita!</p>
          <p className="text-sm text-muted-foreground">Esta conta foi encerrada.</p>
          <Button variant="outline" onClick={recomecar}>Começar de novo</Button>
        </div>
      </Tela>
    );
  }

  // Entrada: com comanda aberta na mesa, a lista para entrar numa ou abrir nova; depois, nome e celular
  if (!sessao) {
    const comandasAbertas = lista?.comandas ?? [];
    const mostrarLista = !escolha && comandasAbertas.length > 0;
    const nomeDa = (c: MesaComanda) => c.nome ?? `Comanda ${c.numero}`;
    const titulo = mostrarLista
      ? "Esta mesa já tem comanda aberta"
      : escolha?.tipo === "entrar"
        ? `Entrar na comanda de ${nomeDa(escolha.comanda)}`
        : comandasAbertas.length > 0
          ? "Abrir uma comanda nova"
          : "Faça seu pedido pelo celular";
    return (
      <Tela>
        <Topo r={r} cor={cor} />
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-5 py-6">
          <div>
            <p className="text-sm text-muted-foreground">
              {abertura.tipo === "mesa" ? `Você está na ${formatTableLabel(abertura.mesa?.numero)}` : "Bem-vindo!"}
            </p>
            <h1 className="text-2xl font-bold">{titulo}</h1>
            {abertura.mensagem && !mostrarLista && <p className="mt-2 text-sm text-muted-foreground">{abertura.mensagem}</p>}
          </div>

          {!abertura.caixa_aberto ? (
            <div className="rounded-xl border bg-muted/40 p-4 text-sm">
              {traduzErroMesa("caixa_fechado")}
            </div>
          ) : (
            <>
              {abertura.tipo === "geral" && (
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium">Sua mesa</span>
                  <select
                    value={mesaEscolhida}
                    onChange={(e) => {
                      setMesaEscolhida(e.target.value);
                      setEscolha(null);
                    }}
                    className="h-12 w-full rounded-xl border bg-background px-3 text-base"
                  >
                    <option value="">Escolha a mesa</option>
                    {(abertura.mesas ?? []).map((m) => (
                      <option key={m.id} value={m.id}>{formatTableLabel(m.numero)}</option>
                    ))}
                  </select>
                </label>
              )}

              {carregandoLista && !lista && mesaAtual ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : mostrarLista ? (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Entre na sua comanda para ver o que já foi pedido e pedir de novo, ou abra uma comanda nova.
                  </p>
                  <div className="divide-y rounded-xl border">
                    {comandasAbertas.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        disabled={c.fechando}
                        onClick={() => setEscolha({ tipo: "entrar", comanda: c })}
                        className="flex w-full items-center gap-3 p-4 text-left disabled:opacity-60"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{nomeDa(c)}</p>
                          <p className="text-sm text-muted-foreground">
                            Comanda {c.numero} · {c.itens} {c.itens === 1 ? "item" : "itens"} · {formatBRL(c.total)}
                          </p>
                        </div>
                        {c.fechando ? (
                          <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">Pedindo a conta</span>
                        ) : (
                          <span className="shrink-0 text-sm font-semibold" style={{ color: cor }}>Entrar</span>
                        )}
                      </button>
                    ))}
                  </div>
                  <Button
                    type="button"
                    onClick={() => setEscolha({ tipo: "nova" })}
                    className="h-12 w-full rounded-full text-base text-white"
                    style={{ background: cor }}
                  >
                    <Plus className="mr-2 h-4 w-4" /> Abrir nova comanda
                  </Button>
                </div>
              ) : (
                <form
                  className="space-y-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    entrar();
                  }}
                >
                  <label className="block space-y-1.5">
                    <span className="text-sm font-medium">Seu nome</span>
                    <Input
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                      autoComplete="given-name"
                      className="h-12 rounded-xl text-base"
                      maxLength={60}
                    />
                  </label>
                  <label className="block space-y-1.5">
                    <span className="text-sm font-medium">Celular com DDD</span>
                    <Input
                      value={celular}
                      onChange={(e) => setCelular(mascaraCelular(e.target.value))}
                      inputMode="tel"
                      autoComplete="tel"
                      placeholder="(54) 99999-0000"
                      className="h-12 rounded-xl text-base"
                    />
                  </label>
                  <Button
                    type="submit"
                    disabled={entrando || nome.trim().length < 2 || celular.replace(/\D/g, "").length < 10}
                    className="h-12 w-full rounded-full text-base text-white"
                    style={{ background: cor }}
                  >
                    {entrando ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : escolha?.tipo === "entrar" ? (
                      "Entrar na comanda"
                    ) : comandasAbertas.length > 0 ? (
                      "Abrir minha comanda"
                    ) : (
                      "Abrir a mesa e ver o cardápio"
                    )}
                  </Button>
                  {comandasAbertas.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setEscolha(null)}
                      className="w-full text-center text-sm font-medium text-muted-foreground underline-offset-4 hover:underline"
                    >
                      Voltar para as comandas da mesa
                    </button>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Usamos seu nome e celular só para identificar o seu pedido nesta visita.
                  </p>
                </form>
              )}
            </>
          )}
        </div>
      </Tela>
    );
  }

  const contaPedida = !!estado?.conta_pedida;
  const itensConta = estado?.itens ?? [];

  return (
    <Tela>
      <Topo
        r={r}
        cor={cor}
        subtitulo={
          estado
            ? `${formatTableLabel(estado.mesa)}${estado.comanda_numero ? ` · Comanda ${estado.comanda_numero}` : ""} · ${estado.nome}`
            : undefined
        }
      />

      <div className="sticky top-0 z-20 grid grid-cols-2 border-b bg-background">
        {(["cardapio", "conta"] as const).map((a) => (
          <button
            key={a}
            onClick={() => setAba(a)}
            className={cn("py-3 text-sm font-medium", aba === a ? "border-b-2" : "text-muted-foreground")}
            style={aba === a ? { borderColor: cor, color: cor } : undefined}
          >
            {a === "cardapio" ? "Cardápio" : `Minha conta${itensConta.length ? ` (${itensConta.length})` : ""}`}
          </button>
        ))}
      </div>

      {contaPedida && (
        <div className="bg-amber-50 px-5 py-3 text-sm text-amber-900">
          Conta pedida. O pagamento é feito no caixa. Para pedir mais, chame o garçom.
        </div>
      )}

      {aba === "cardapio" ? (
        <div className="flex-1 pb-28">
          <div className="space-y-3 px-4 pt-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar no cardápio"
                className="h-11 rounded-full pl-9"
              />
            </div>
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
              {[null, ...(cardapio?.categorias.map((c) => c.nome) ?? [])].map((c) => (
                <button
                  key={c ?? "todas"}
                  onClick={() => setCategoria(c)}
                  className={cn(
                    "shrink-0 rounded-full border px-3 py-1.5 text-sm",
                    categoria === c ? "border-transparent text-white" : "",
                  )}
                  style={categoria === c ? { background: cor } : undefined}
                >
                  {c ?? "Tudo"}
                </button>
              ))}
            </div>
          </div>

          {!cardapio ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            categorias.map((c) => (
              <section key={c.nome} className="px-4 pt-5">
                <h2 className="mb-2 text-base font-bold">{c.nome}</h2>
                <div className="divide-y rounded-xl border">
                  {c.produtos.map((p) => (
                    <button
                      key={p.id}
                      disabled={contaPedida}
                      onClick={() => setProdutoAberto(p)}
                      className="flex w-full gap-3 p-3 text-left disabled:opacity-60"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{p.nome}</p>
                        {p.descricao && (
                          <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{p.descricao}</p>
                        )}
                        <p className="mt-1 text-sm font-semibold">{precoNaLista(p)}</p>
                      </div>
                      {p.foto && <img src={p.foto} alt="" loading="lazy" className="h-20 w-20 shrink-0 rounded-lg object-cover" />}
                    </button>
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      ) : (
        <div className="flex-1 space-y-4 px-4 pb-40 pt-4">
          <div className="flex items-center justify-between gap-3 rounded-xl border p-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">{estado?.comanda_numero ? `Comanda ${estado.comanda_numero}` : "Sua comanda"}</p>
              <p className="text-xs text-muted-foreground">Os pedidos e a conta abaixo são desta comanda.</p>
            </div>
            <Button variant="outline" size="sm" className="shrink-0 rounded-full" onClick={recomecar}>
              <Users className="mr-1.5 h-4 w-4" /> Comandas da mesa
            </Button>
          </div>
          {itensConta.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Nada pedido ainda nesta comanda.</p>
          ) : (
            <div className="divide-y rounded-xl border">
              {itensConta.map((i) => (
                <div key={i.id} className="flex gap-3 p-3">
                  <span className="text-sm font-semibold">{i.quantidade}x</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{i.nome}</p>
                    {i.subitens.length > 0 && (
                      <p className="text-xs text-muted-foreground">{i.subitens.join(", ")}</p>
                    )}
                    {i.obs && <p className="text-xs text-muted-foreground">{i.obs}</p>}
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                      <ChefHat className="h-3 w-3" /> {i.enviado ? "Enviado à cozinha" : "Lançado"}
                    </p>
                  </div>
                  <span className="text-sm">{formatBRL(i.subtotal)}</span>
                </div>
              ))}
            </div>
          )}

          {estado && itensConta.length > 0 && (
            <div className="space-y-1 rounded-xl bg-muted/40 p-4 text-sm">
              <div className="flex justify-between"><span>Subtotal</span><span>{formatBRL(estado.subtotal)}</span></div>
              {estado.taxa_servico > 0 && (
                <div className="flex justify-between">
                  <span>Taxa de serviço{abertura.taxa_servico ? ` (${abertura.taxa_servico}%)` : ""}</span>
                  <span>{formatBRL(estado.taxa_servico)}</span>
                </div>
              )}
              <div className="flex justify-between pt-1 text-base font-bold">
                <span>Total</span><span>{formatBRL(estado.total)}</span>
              </div>
              {contaPedida && (
                <p className="pt-2 text-xs text-muted-foreground">Valor para conferência. O pagamento é feito no caixa.</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Barra de baixo: carrinho, garçom e conta */}
      <div className="fixed inset-x-0 bottom-0 z-30 space-y-2 border-t bg-background px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
        {carrinho.length > 0 && !contaPedida && (
          <Button
            onClick={() => setCarrinhoAberto(true)}
            className="h-12 w-full justify-between rounded-full px-5 text-base text-white"
            style={{ background: cor }}
          >
            <span className="flex items-center gap-2"><ShoppingBag className="h-4 w-4" /> Ver pedido ({qtdCarrinho})</span>
            <span>{formatBRL(totalCarrinho)}</span>
          </Button>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" className="h-11 rounded-full" onClick={chamarGarcom} disabled={estado?.chamado_aberto}>
            <Bell className="mr-2 h-4 w-4" /> {estado?.chamado_aberto ? "Garçom chamado" : "Chamar garçom"}
          </Button>
          <Button
            variant="outline"
            className="h-11 rounded-full"
            onClick={() => (contaPedida ? setAba("conta") : setConfirmarConta(true))}
            disabled={itensConta.length === 0}
          >
            <Receipt className="mr-2 h-4 w-4" /> {contaPedida ? "Ver a conta" : "Fechar a conta"}
          </Button>
        </div>
      </div>

      <ProdutoMesaSheet
        produto={produtoAberto}
        cor={cor}
        onFechar={() => setProdutoAberto(null)}
        onAdicionar={adicionarAoCarrinho}
      />

      <Sheet open={carrinhoAberto} onOpenChange={setCarrinhoAberto}>
        <SheetContent side="bottom" className="flex max-h-[85vh] flex-col rounded-t-2xl">
          <SheetHeader className="text-left">
            <SheetTitle>Seu pedido</SheetTitle>
          </SheetHeader>
          <div className="min-h-0 flex-1 divide-y overflow-y-auto">
            {carrinho.map((i) => (
              <div key={i.chave} className="flex gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{i.nome}</p>
                  {i.resumo && <p className="text-xs text-muted-foreground">{i.resumo}</p>}
                  <p className="mt-1 text-sm">{formatBRL(i.precoUnitario * i.qtd)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => mudarQtd(i.chave, -1)} className="rounded-full border p-1">
                    {i.qtd === 1 ? <Trash2 className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
                  </button>
                  <span className="w-5 text-center text-sm font-semibold">{i.qtd}</span>
                  <button onClick={() => mudarQtd(i.chave, 1)} className="rounded-full border p-1">
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <Button
            className="h-12 w-full rounded-full text-base text-white"
            style={{ background: cor }}
            disabled={enviando || carrinho.length === 0}
            onClick={enviar}
          >
            {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : `Enviar para a cozinha · ${formatBRL(totalCarrinho)}`}
          </Button>
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmarConta} onOpenChange={setConfirmarConta}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Fechar a conta?</AlertDialogTitle>
            <AlertDialogDescription>
              Você vai ver o valor final e a mesa vai para o caixa. Depois disso, novos pedidos só com o garçom.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={fecharConta} style={{ background: cor }}>Fechar a conta</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Tela>
  );
}

function Tela({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-[100dvh] flex-col bg-background text-foreground">{children}</div>;
}

function Topo({ r, cor, subtitulo }: { r: MesaAbertura["restaurante"]; cor: string; subtitulo?: string }) {
  return (
    <header className="relative">
      {r.capa_url ? (
        <img src={r.capa_url} alt="" className="h-28 w-full object-cover" />
      ) : (
        <div className="h-16 w-full" style={{ background: cor }} />
      )}
      <div className="flex items-center gap-3 px-4 py-3">
        {r.logo_url && <img src={r.logo_url} alt="" className="-mt-10 h-14 w-14 rounded-full border-4 border-background object-cover" />}
        <div className="min-w-0">
          <p className="truncate font-bold">{r.nome}</p>
          {subtitulo && <p className="truncate text-sm text-muted-foreground">{subtitulo}</p>}
        </div>
      </div>
    </header>
  );
}
