import { supabase } from "@/integrations/supabase/client";

/**
 * Acesso a `notas_fiscais`.
 *
 * A tabela existe em produção mas ainda não está no `types.ts` gerado, então o
 * postgrest-js não consegue inferir o shape e estoura com "type instantiation
 * is excessively deep" a cada encadeamento. Concentrar o cast aqui evita
 * espalhar `as any` pelos hooks — e deixa um único lugar para remover quando
 * os tipos forem regerados.
 *
 * O shape das linhas é garantido pelas interfaces locais de quem consome
 * (`FiscalCoupon`, `OrderNfce`, `NotaFiscal`).
 */
export function notasFiscais() {
  return supabase.from("notas_fiscais" as any) as any;
}
