import { supabase } from "@/integrations/supabase/client";

/**
 * Clientes do delivery DESTA loja.
 *
 * `delivery_customers` é um cadastro global: o mesmo telefone pede em várias
 * lojas e a tabela não tem coluna de loja. Ler a tabela inteira mostrava os
 * clientes de todas as lojas para qualquer dono (vazamento de 23/10/2026).
 * O vínculo está em `delivery_clientes_loja` (pediu, juntou pontos ou
 * resgatou aqui). Lê em lotes porque a API corta em 1000 linhas.
 */
export async function buscarClientesDeliveryDaLoja<T = any>(
  ownerId: string,
  colunas = "*",
): Promise<T[]> {
  const clientes: T[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await supabase
      .from("delivery_clientes_loja" as any)
      .select(`customer:delivery_customers(${colunas})`)
      .eq("user_id", ownerId)
      .range(de, de + 999);
    if (error) throw error;
    clientes.push(...(data ?? []).map((r: any) => r.customer).filter(Boolean));
    if (!data || data.length < 1000) break;
  }
  return clientes;
}
