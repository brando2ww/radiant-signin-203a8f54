/** Telefone do cliente (cashback, 20/10/2026). */

/** Só os números (DDD + número, sem o 55 do país); vazio ou incompleto vira null. */
export function telefoneSoNumeros(v?: string | null): string | null {
  let d = (v ?? "").replace(/\D/g, "");
  if (/^55\d{10,11}$/.test(d)) d = d.slice(2);
  return /^\d{10,11}$/.test(d) ? d : null;
}

/** (54) 99999-0000 enquanto digita. */
export function mascaraTelefone(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** Para mostrar: (54) 99999-0000. */
export function formatarTelefone(v?: string | null) {
  const d = telefoneSoNumeros(v);
  return d ? mascaraTelefone(d) : "";
}
