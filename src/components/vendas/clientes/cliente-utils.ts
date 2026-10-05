import type { VendasCliente } from "@/lib/vendas/types";

export const soDigitos = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");

export function formatarCnpj(v: string | null | undefined): string {
  const d = soDigitos(v);
  if (d.length !== 14) return v ?? "";
  return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
}

export function formatarCpf(v: string | null | undefined): string {
  const d = soDigitos(v);
  if (d.length !== 11) return v ?? "";
  return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
}

export function formatarCep(v: string | null | undefined): string {
  const d = soDigitos(v);
  if (d.length !== 8) return v ?? "";
  return d.replace(/(\d{5})(\d{3})/, "$1-$2");
}

export function formatarTelefone(v: string | null | undefined): string {
  const d = soDigitos(v);
  if (d.length === 11) return d.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
  if (d.length === 10) return d.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
  return v ?? "";
}

/** CNPJ ou CPF do cliente, já formatado ("" quando não tem). */
export function documentoCliente(c: Pick<VendasCliente, "cnpj" | "cpf" | "person_type">): string {
  if (c.cnpj) return formatarCnpj(c.cnpj);
  if (c.cpf) return formatarCpf(c.cpf);
  return "";
}

/** "RUA X, 120 · Centro · Caxias do Sul/RS" (só as partes preenchidas). */
export function enderecoCliente(
  c: Pick<VendasCliente, "street" | "address_number" | "complement" | "district" | "city" | "state" | "cep">,
): string {
  const rua = [c.street, c.address_number].filter(Boolean).join(", ");
  const linha1 = [rua, c.complement].filter(Boolean).join(" ");
  const cidade = [c.city, c.state].filter(Boolean).join("/");
  return [linha1, c.district, cidade, c.cep ? `CEP ${formatarCep(c.cep)}` : ""].filter(Boolean).join(" · ");
}

/** Nomes que a Receita devolve em maiúsculas viram "Caxias do Sul". */
export function tituloCaso(v: string | null | undefined): string {
  const minusculas = new Set(["de", "da", "do", "das", "dos", "e", "em"]);
  return (v ?? "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((p, i) => (i > 0 && minusculas.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(" ");
}

/** Link do WhatsApp (wa.me) para o número do cliente, com DDI 55 quando faltar. */
export function linkWhatsApp(numero: string | null | undefined, mensagem?: string): string | null {
  const d = soDigitos(numero);
  if (d.length < 10) return null;
  const comPais = d.length <= 11 ? `55${d}` : d;
  return `https://wa.me/${comPais}${mensagem ? `?text=${encodeURIComponent(mensagem)}` : ""}`;
}

export const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN",
  "RS", "SC", "SE", "SP", "RO", "RR", "TO",
];

/** Sugestões de condição de pagamento (o campo é livre). */
export const CONDICOES_SUGERIDAS = ["À vista", "7 dias", "14 dias", "21 dias", "28 dias", "30 dias", "30/60", "30/60/90", "28/56/84"];

/** Dados que a BrasilAPI devolve para um CNPJ (só o que o cadastro usa). */
export type CnpjBrasilApi = {
  razao_social?: string;
  nome_fantasia?: string;
  cep?: string;
  descricao_tipo_de_logradouro?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  municipio?: string;
  uf?: string;
  codigo_municipio_ibge?: number | string;
  ddd_telefone_1?: string;
  email?: string | null;
  descricao_situacao_cadastral?: string;
};

/** Consulta pública da Receita pela BrasilAPI, direto do navegador. Devolve null quando não acha ou cai. */
export async function consultarCnpj(cnpj: string): Promise<CnpjBrasilApi | null> {
  const d = soDigitos(cnpj);
  if (d.length !== 14) return null;
  const controle = new AbortController();
  const limite = setTimeout(() => controle.abort(), 12000);
  try {
    const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${d}`, { signal: controle.signal });
    if (!r.ok) return null;
    return (await r.json()) as CnpjBrasilApi;
  } catch {
    return null;
  } finally {
    clearTimeout(limite);
  }
}

/** Validação dos dígitos verificadores do CNPJ. */
export function cnpjValido(v: string): boolean {
  const d = soDigitos(v);
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const calc = (base: string, pesos: number[]) => {
    const s = base.split("").reduce((acc, n, i) => acc + Number(n) * pesos[i], 0);
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = calc(d.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = calc(d.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return d1 === Number(d[12]) && d2 === Number(d[13]);
}

/** Validação dos dígitos verificadores do CPF. */
export function cpfValido(v: string): boolean {
  const d = soDigitos(v);
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const calc = (n: number) => {
    const s = d
      .slice(0, n)
      .split("")
      .reduce((acc, x, i) => acc + Number(x) * (n + 1 - i), 0);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}
