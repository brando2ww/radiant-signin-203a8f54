import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishmentId } from "@/hooks/use-establishment-id";
import { fetchConsumoPorFichaTecnica } from "@/hooks/reports/use-stock-consumption";

/**
 * Relatórios de estoque: posição atual, giro e curva ABC.
 *
 * `pdv_stock_movements` NÃO tem `user_id` — o dono vem pelo insumo. Por isso
 * tudo aqui parte da lista de insumos do estabelecimento e filtra os
 * movimentos por esses ids; consultar a tabela direto devolveria movimento de
 * outro cliente ou nada, dependendo da RLS.
 *
 * CONSUMO NÃO SAI DO MOVIMENTO. Em produção há 277 entradas e 3 saídas por
 * venda em todo o histórico: a baixa automática praticamente não roda. O que
 * saiu é deduzido de venda × ficha técnica, igual ao CMV. As ENTRADAS seguem
 * vindo do movimento, porque essas a operação registra de fato.
 */

export interface StockPositionRow {
  id: string;
  name: string;
  unit: string;
  category: string | null;
  sector: string | null;
  currentStock: number;
  minStock: number;
  unitCost: number;
  /** Quanto o que está parado na prateleira vale. */
  value: number;
  status: "abaixo" | "zerado" | "ok";
  lastEntry: string | null;
}

export interface StockTurnoverRow {
  id: string;
  name: string;
  unit: string;
  category: string | null;
  /** Quanto entrou no período. */
  entradas: number;
  /** Quanto saiu, deduzido da ficha técnica dos produtos vendidos. */
  saidas: number;
  /** Custo do que saiu — é por aqui que a curva ABC ordena. */
  consumoValor: number;
  currentStock: number;
  /** Em quantos períodos o estoque atual se esgota no ritmo observado. */
  cobertura: number | null;
  /** Fatia acumulada do consumo — A até 80%, B até 95%, C o resto. */
  classe: "A" | "B" | "C";
}

export interface StockReportData {
  posicao: StockPositionRow[];
  giro: StockTurnoverRow[];
  totalEmEstoque: number;
  abaixoDoMinimo: number;
  zerados: number;
  semMovimento: StockPositionRow[];
  consumoTotal: number;
  /** Produtos vendidos sem ficha técnica: consumo que não dá para enxergar. */
  produtosSemFicha: number;
  receitaSemFicha: number;
}

const MOVIMENTO_SAIDA = ["saida_venda", "saida_perda"];

export function useStockReports(startDate: Date, endDate: Date) {
  const { visibleUserId } = useEstablishmentId();

  return useQuery<StockReportData>({
    queryKey: ["report-stock", visibleUserId, startDate.toISOString(), endDate.toISOString()],
    enabled: !!visibleUserId,
    queryFn: async () => {
      const { data: insumos, error } = await supabase
        .from("pdv_ingredients")
        .select("id, name, unit, category, sector, current_stock, min_stock, unit_cost, average_cost, last_entry_date")
        .eq("user_id", visibleUserId!)
        .order("name");
      if (error) throw error;

      const lista = insumos ?? [];
      const categorias = await nomesDeCategoria(visibleUserId!, lista);

      const posicao: StockPositionRow[] = lista.map((i) => {
        // Custo médio é o que reflete o que se pagou de verdade; o unit_cost é
        // só o último preço digitado e superestima estoque antigo.
        const custo = Number(i.average_cost) || Number(i.unit_cost) || 0;
        const estoque = Number(i.current_stock) || 0;
        const minimo = Number(i.min_stock) || 0;
        return {
          id: i.id,
          name: i.name,
          unit: i.unit,
          category: categorias.get(i.id) ?? null,
          sector: i.sector ?? null,
          currentStock: estoque,
          minStock: minimo,
          unitCost: custo,
          value: estoque * custo,
          status: estoque <= 0 ? "zerado" : minimo > 0 && estoque < minimo ? "abaixo" : "ok",
          lastEntry: i.last_entry_date ?? null,
        };
      });

      const porId = new Map(posicao.map((p) => [p.id, p]));
      const ids = posicao.map((p) => p.id);

      const [movimentos, consumo] = await Promise.all([
        buscarMovimentos(ids, startDate, endDate),
        fetchConsumoPorFichaTecnica(
          visibleUserId!,
          startDate.toISOString(),
          endDate.toISOString(),
        ),
      ]);

      const agregado = new Map<string, { entradas: number; saidas: number; valor: number }>();
      const garantir = (id: string) => {
        const a = agregado.get(id) ?? { entradas: 0, saidas: 0, valor: 0 };
        agregado.set(id, a);
        return a;
      };

      // ENTRADAS vêm do movimento: compra e nota a operação registra de fato.
      movimentos.forEach((m) => {
        const p = porId.get(m.ingredient_id);
        if (!p) return;
        const atual = garantir(m.ingredient_id);
        const qtd = Math.abs(Number(m.quantity) || 0);
        if (m.type === "entrada") {
          atual.entradas += qtd;
        } else if (m.type === "ajuste" && Number(m.quantity) > 0) {
          atual.entradas += qtd;
        } else if (MOVIMENTO_SAIDA.includes(m.type) || m.type === "ajuste") {
          // Perda e ajuste negativo NÃO são consumo de venda: entram no valor
          // porque saíram do estoque, mas a quantidade de saída por venda vem
          // da ficha técnica, logo abaixo. Somar as duas contaria duas vezes o
          // que a baixa automática porventura tenha registrado.
          atual.valor += qtd * (Number(m.unit_cost) || p.unitCost);
        }
      });

      // SAÍDAS vêm da ficha técnica dos produtos vendidos.
      consumo.quantidade.forEach((qtd, ingredienteId) => {
        if (!porId.has(ingredienteId)) return;
        garantir(ingredienteId).saidas += qtd;
      });
      consumo.valor.forEach((valor, ingredienteId) => {
        if (!porId.has(ingredienteId)) return;
        garantir(ingredienteId).valor += valor;
      });

      const consumoTotal = [...agregado.values()].reduce((s, a) => s + a.valor, 0);

      const ordenado = posicao
        .map((p) => {
          const a = agregado.get(p.id) ?? { entradas: 0, saidas: 0, valor: 0 };
          return { p, a };
        })
        .sort((x, y) => y.a.valor - x.a.valor);

      let acumulado = 0;
      const giro: StockTurnoverRow[] = ordenado.map(({ p, a }) => {
        acumulado += a.valor;
        const fatia = consumoTotal > 0 ? acumulado / consumoTotal : 1;
        return {
          id: p.id,
          name: p.name,
          unit: p.unit,
          category: p.category,
          entradas: a.entradas,
          saidas: a.saidas,
          consumoValor: a.valor,
          currentStock: p.currentStock,
          cobertura: a.saidas > 0 ? p.currentStock / a.saidas : null,
          classe: fatia <= 0.8 ? "A" : fatia <= 0.95 ? "B" : "C",
        };
      });

      // Parado é o que não teve movimento nenhum no período mas ocupa dinheiro.
      const semMovimento = posicao.filter(
        (p) => !agregado.has(p.id) && p.value > 0,
      );

      return {
        posicao,
        giro,
        totalEmEstoque: posicao.reduce((s, p) => s + p.value, 0),
        abaixoDoMinimo: posicao.filter((p) => p.status === "abaixo").length,
        zerados: posicao.filter((p) => p.status === "zerado").length,
        semMovimento,
        consumoTotal,
        produtosSemFicha: consumo.produtosSemFicha,
        receitaSemFicha: consumo.receitaSemFicha,
      };
    },
  });
}

/**
 * `pdv_ingredients.category` guarda o NOME ou o ID, dependendo de quem gravou:
 * o diálogo de insumo grava o nome, a importação de NF-e grava o id. Resolver
 * para o nome é o denominador comum — a mesma armadilha que fez a lista de
 * categorias da contagem de estoque aparecer vazia.
 */
async function nomesDeCategoria(
  ownerId: string,
  insumos: Array<{ id: string; category: string | null }>,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const { data } = await supabase
    .from("pdv_ingredient_categories")
    .select("id, name")
    .eq("user_id", ownerId);

  const porId = new Map((data ?? []).map((c) => [String(c.id), c.name]));
  const nomes = new Set((data ?? []).map((c) => c.name));

  insumos.forEach((i) => {
    const bruto = (i.category ?? "").trim();
    if (!bruto) return;
    out.set(i.id, porId.get(bruto) ?? (nomes.has(bruto) ? bruto : bruto));
  });
  return out;
}

/** O `in` do PostgREST tem limite prático de URL — daí os blocos. */
async function buscarMovimentos(ids: string[], start: Date, end: Date) {
  const saida: Array<{ ingredient_id: string; type: string; quantity: number; unit_cost: number | null }> = [];
  const bloco = 200;
  for (let i = 0; i < ids.length; i += bloco) {
    const { data, error } = await supabase
      .from("pdv_stock_movements")
      .select("ingredient_id, type, quantity, unit_cost")
      .in("ingredient_id", ids.slice(i, i + bloco))
      .gte("created_at", start.toISOString())
      .lte("created_at", end.toISOString());
    if (error) throw error;
    saida.push(...((data ?? []) as typeof saida));
  }
  return saida;
}
