"use strict";

// TEF: a ponte é quem fala com a maquininha.
//
// O PDV roda no navegador e navegador não fala com pinpad. Quem fala é um
// programa no computador da loja · esta ponte, que já existe, já tem fila com
// lease, reconexão e painel. Aqui ela ganha uma segunda fila: pdv_tef_requests.
//
// O provedor fica atrás de um adaptador. Quem conversa com a Getnet na prática
// é o TEF instalado no estabelecimento (Getnet local, ConnectTEF, PayGo ou
// SiTef, conforme o contrato), e cada um tem o seu jeito. Trocar de provedor
// mexe só neste arquivo.

const { config } = require("./config");
const { log } = require("./log");
const db = require("./db");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── Adaptadores ────────────────────────────────────────────────────────────

/**
 * Simulado: aprova sozinho depois de alguns segundos.
 * Serve para validar o caminho inteiro (caixa → fila → ponte → caixa) sem
 * maquininha na mesa. Nunca é o padrão: só entra com TEF_PROVIDER=simulado.
 */
const simulado = {
  nome: "simulado",
  async executar(pedido) {
    await sleep(3000);
    if (pedido.operation === "teste") {
      return { status: "approved", result: { mensagem: "Simulador respondendo" } };
    }
    const nsu = String(Date.now()).slice(-9);
    return {
      status: "approved",
      result: {
        nsu,
        autorizacao: String(Math.floor(Math.random() * 900000) + 100000),
        bandeira: "SIMULADO",
        cartao_final: "0000",
        modalidade: pedido.payment_type || "credito",
        parcelas: pedido.installments || 1,
        via_cliente: [
          "*** SIMULACAO ***",
          `VALOR ${Number(pedido.amount).toFixed(2)}`,
          `NSU ${nsu}`,
        ].join("\n"),
      },
    };
  },
};

/**
 * HTTP local: fala com o agente de TEF instalado na loja por HTTP.
 *
 * É o formato que a Velara espera do agente. Os TEF de mercado (ConnectTEF,
 * PayGo, SiTef, Getnet local) expõem interfaces parecidas, mas cada um com o
 * seu contrato · por isso o endereço, o caminho e o mapeamento dos campos são
 * configuráveis, e o que não encaixar vira um adaptador novo aqui.
 *
 *   POST {TEF_HTTP_URL}
 *   { operacao, valor, modalidade, parcelas, financiamento, referencia }
 *   → { aprovado: bool, nsu, autorizacao, bandeira, cartao_final, via_cliente,
 *       via_estabelecimento, mensagem }
 */
const httpLocal = {
  nome: "http",
  async executar(pedido) {
    const url = config.tefHttpUrl;
    if (!url) {
      return { status: "error", error: "TEF_HTTP_URL não configurado nesta instalação" };
    }
    const corpo = {
      operacao: pedido.operation,
      valor: Number(pedido.amount || 0),
      modalidade: pedido.payment_type || null,
      parcelas: pedido.installments || 1,
      financiamento: pedido.financing || "avista",
      referencia: pedido.id,
    };

    const controle = new AbortController();
    const prazo = setTimeout(() => controle.abort(), config.tefTimeoutMs);
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(config.tefHttpToken ? { Authorization: `Bearer ${config.tefHttpToken}` } : {}),
        },
        body: JSON.stringify(corpo),
        signal: controle.signal,
      });
      const texto = await r.text();
      let dados;
      try {
        dados = JSON.parse(texto);
      } catch {
        return { status: "error", error: `Resposta do TEF não é JSON: ${texto.slice(0, 200)}` };
      }
      if (!r.ok) {
        return { status: "error", error: dados?.mensagem || `TEF respondeu ${r.status}` };
      }
      if (dados.aprovado === false) {
        return {
          status: dados.cancelado ? "cancelled" : "denied",
          result: dados,
          error: dados.mensagem || "Transação não aprovada",
        };
      }
      return {
        status: "approved",
        result: {
          nsu: dados.nsu ?? null,
          autorizacao: dados.autorizacao ?? null,
          bandeira: dados.bandeira ?? null,
          cartao_final: dados.cartao_final ?? null,
          modalidade: dados.modalidade ?? pedido.payment_type,
          parcelas: dados.parcelas ?? pedido.installments,
          via_cliente: dados.via_cliente ?? null,
          via_estabelecimento: dados.via_estabelecimento ?? null,
        },
      };
    } catch (e) {
      const abortou = e?.name === "AbortError";
      return {
        status: abortou ? "error" : "error",
        error: abortou ? "A maquininha não respondeu no tempo esperado" : String(e?.message || e),
      };
    } finally {
      clearTimeout(prazo);
    }
  },
};

const adaptadores = { simulado, http: httpLocal };

function adaptadorAtivo() {
  return adaptadores[config.tefProvider] || null;
}

// ─── Laço ───────────────────────────────────────────────────────────────────

let timer = null;
let rodando = false;

async function cicloDeTef(deviceId) {
  if (rodando) return;
  const adaptador = adaptadorAtivo();
  if (!adaptador) return;

  rodando = true;
  try {
    const pedidos = await db.tefClaim(deviceId, 2);
    for (const pedido of pedidos) {
      log(`TEF · ${pedido.operation} ${Number(pedido.amount).toFixed(2)} (${adaptador.nome})`);
      let saida;
      try {
        saida = await adaptador.executar(pedido);
      } catch (e) {
        saida = { status: "error", error: String(e?.message || e) };
      }
      await db.tefFinish(pedido.id, saida.status, saida.result || null, saida.error || null);
      log(`TEF · ${pedido.operation} → ${saida.status}${saida.error ? ` (${saida.error})` : ""}`);
    }
  } catch (e) {
    log(`TEF · falha no ciclo: ${e?.message || e}`);
  } finally {
    rodando = false;
  }
}

function iniciar(deviceId) {
  if (!adaptadorAtivo()) {
    if (config.tefProvider) {
      log(`TEF · provedor "${config.tefProvider}" desconhecido; a fila não será atendida`);
    }
    return;
  }
  log(`TEF · atendendo a fila com o adaptador "${config.tefProvider}"`);
  timer = setInterval(() => cicloDeTef(deviceId), config.tefPollMs);
  timer.unref?.();
}

function parar() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { iniciar, parar, cicloDeTef, adaptadorAtivo };
