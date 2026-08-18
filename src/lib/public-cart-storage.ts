/**
 * Carrinho do cardápio público, guardado no navegador.
 *
 * Existe por dois motivos. O primeiro é um defeito antigo: o carrinho vivia só
 * em memória, então o cliente que abrisse "Meus pontos" e voltasse perdia tudo
 * que já tinha escolhido. O segundo é o resgate de fidelidade — ele acontece em
 * outra rota (/meus-pontos) e precisa de um lugar para depositar o item que o
 * cardápio vai encontrar quando o cliente voltar.
 *
 * A chave inclui o estabelecimento: quem pede em dois restaurantes no mesmo
 * navegador não pode misturar os carrinhos.
 */
import type { CartItem } from "@/pages/PublicMenu";

const key = (userId: string) => `velara:cart:${userId}`;

export function loadCart(userId: string | null | undefined): CartItem[] {
  if (!userId) return [];
  try {
    const raw = localStorage.getItem(key(userId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // Storage indisponível (navegação privada, cota) não pode derrubar o menu.
    return [];
  }
}

export function saveCart(userId: string | null | undefined, cart: CartItem[]): void {
  if (!userId) return;
  try {
    if (cart.length === 0) localStorage.removeItem(key(userId));
    else localStorage.setItem(key(userId), JSON.stringify(cart));
  } catch {
    /* ignora */
  }
}

/** Acrescenta um item ao carrinho guardado, sem precisar do estado do menu. */
export function appendToStoredCart(userId: string, item: CartItem): void {
  saveCart(userId, [...loadCart(userId), item]);
}

/** Já existe um resgate no carrinho? Um por pedido, para não sair de graça. */
export function hasPrizeInStoredCart(userId: string): boolean {
  return loadCart(userId).some((i) => !!i.prizeId);
}
