/**
 * Fila de batidas que não subiram.
 *
 * A reclamação que derruba os concorrentes é sempre a mesma: "bati e sumiu".
 * Por isso a batida entra na fila ANTES de tentar a rede, e só sai de lá
 * quando o servidor confirma. O que o colaborador vê na tela é o estado da
 * fila, não o resultado da requisição.
 */
const CHAVE_SESSAO = "ponto:sessao:";
const CHAVE_FILA = "ponto:fila:";

export interface BatidaPendente {
  id: string;
  marcado_em: string;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  tentativas: number;
}

function ler<T>(chave: string, padrao: T): T {
  try {
    const cru = localStorage.getItem(chave);
    return cru ? (JSON.parse(cru) as T) : padrao;
  } catch {
    return padrao;
  }
}

function gravar(chave: string, valor: unknown) {
  try {
    localStorage.setItem(chave, JSON.stringify(valor));
  } catch {
    // Modo privado ou disco cheio: a batida ainda vai tentar subir agora.
  }
}

export function salvarSessao(token: string, sessao: unknown) {
  gravar(CHAVE_SESSAO + token, sessao);
}

export function lerSessao<T>(token: string): T | null {
  return ler<T | null>(CHAVE_SESSAO + token, null);
}

export function limparSessao(token: string) {
  try {
    localStorage.removeItem(CHAVE_SESSAO + token);
  } catch {
    /* nada a fazer */
  }
}

export function lerFila(sessionToken: string): BatidaPendente[] {
  return ler<BatidaPendente[]>(CHAVE_FILA + sessionToken, []);
}

export function enfileirar(sessionToken: string, batida: BatidaPendente) {
  const fila = lerFila(sessionToken);
  fila.push(batida);
  gravar(CHAVE_FILA + sessionToken, fila);
}

export function removerDaFila(sessionToken: string, id: string) {
  gravar(CHAVE_FILA + sessionToken, lerFila(sessionToken).filter((b) => b.id !== id));
}

export function marcarTentativa(sessionToken: string, id: string) {
  gravar(
    CHAVE_FILA + sessionToken,
    lerFila(sessionToken).map((b) => (b.id === id ? { ...b, tentativas: b.tentativas + 1 } : b)),
  );
}

/**
 * Identificação do aparelho. Não é impressão digital de rastreamento: é um
 * número aleatório guardado no próprio aparelho, que serve para o gestor ver
 * quando alguém bateu de um celular diferente do de sempre.
 */
export function idDoAparelho(): string {
  const chave = "ponto:aparelho";
  try {
    const guardado = localStorage.getItem(chave);
    if (guardado) return guardado;
    const novo = crypto.randomUUID();
    localStorage.setItem(chave, novo);
    return novo;
  } catch {
    return "sem-id";
  }
}
