# Força de vendas do Velara · plano e contrato

Pedido do dono em 05/10/2026: um módulo dentro do PDV, multiempresa, com acesso de representante, produtos com imagem,
contas a receber e a pagar, cadastro de clientes, agenda, fornecedores, cobrança e proposta em PDF com a marca do
estabelecimento que vira pedido.

## Decisões do dono (05/10)

| Tema | Decisão |
|---|---|
| Cobrança | Asaas de cada empresa: cada estabelecimento conecta a própria conta (boleto, PIX, cartão, baixa automática) |
| Comissão | Percentual por representante sobre o que o cliente **pagou** (nasce quando a parcela é baixada) |
| Visão do representante | Só os clientes da carteira dele, e só as propostas, pedidos, agenda e comissões dele |
| Estoque | O pedido de venda **não** baixa estoque nesta versão |

Decisões de construção (padrões, revisáveis):
- Módulo `vendas` ("Força de vendas"), liberado por empresa em `tenant_modules` e conferido no banco em toda política.
- Dono, gerente e financeiro usam `/pdv/vendas/*` (computador). O representante usa `/representante/*` (celular, como o `/garcom`).
- Clientes, produtos, fornecedores e financeiro **reaproveitam as tabelas que já existem** (`pdv_customers`, `pdv_products`,
  `pdv_suppliers`, `pdv_financial_transactions`), com colunas novas. Nada paralelo.
- A proposta aprovada (pelo link público ou à mão) vira pedido e gera as parcelas no contas a receber.
- A proposta vai por link (`/proposta/:token`), porque o WhatsApp do Velara só manda texto. O PDF é gerado no navegador.

## Banco (aplicado em produção em 05/10, sem empresa com o módulo ligado)

`supabase/migrations/20261005120000_vendas_papel_representante.sql` (papel `representante` em `app_role`) e
`supabase/migrations/20261005120100_vendas_fundacao.sql`. Teste de ponta a ponta: `supabase/tests/vendas_fundacao.test.sql`
(36 checagens, roda numa transação desfeita).

- Acesso: `vendas_tem_modulo(owner)`, `vendas_gestor(owner)` (dono/gerente/financeiro), `vendas_rep_id()`,
  `vendas_e_representante()`, `vendas_da_carteira(owner, rep)`.
- Tabelas: `vendas_representantes`, `vendas_propostas` + `vendas_proposta_itens`, `vendas_pedidos` + `vendas_pedido_itens`,
  `vendas_comissoes`, `vendas_agenda`, `vendas_asaas`, `vendas_numeracao`.
- Colunas novas: `pdv_customers` (PF/PJ, CNPJ, razão social, IE, endereço, `representative_id`, prazo, limite, `asaas_customer_id`),
  `pdv_products` (`b2b_enabled`, `price_b2b`, `sku`, `sales_unit`, `min_qty`, `pack_qty`, `gallery`),
  `pdv_financial_transactions` (`vendas_pedido_id`, `representative_id`, `asaas_payment_id`, `asaas_status`, `charge_url`,
  `bank_slip_url`, `pix_payload`, `charged_at`).
- O banco calcula: número (`ORC-2026-0001`, `PED-2026-0001`), total de cada item e da proposta, dono (`user_id`), o
  representante da proposta/agenda/cliente quando quem grava é representante (e recusa cliente fora da carteira).
- RPCs: `vendas_converter_proposta(p_proposta)`, `vendas_cancelar_pedido(p_pedido, p_motivo)`,
  `vendas_proposta_publica(p_token)` e `vendas_proposta_responder(p_token, p_aprovar, p_nome, p_motivo)` (anônimas),
  `vendas_asaas_gravar` / `vendas_asaas_chave` (só servidor).
- Comissão: gatilho no financeiro (parcela de pedido baixada → `vendas_comissoes`; estorno cancela a pendente).
- Mudança de comportamento que veio junto: a equipe (não representante) passa a ver os clientes do estabelecimento, e
  gerente e financeiro passam a ver o financeiro (antes recebiam lista vazia).

## Telas (rotas já declaradas no esqueleto)

`src/pages/pdv/vendas/VendasRoutes.tsx` (gestão) e `src/pages/representante/RepresentanteApp.tsx` (representante).
Tipos comuns: `src/lib/vendas/types.ts`.

| Rota | Arquivo | Dono |
|---|---|---|
| /pdv/vendas | Painel.tsx | A |
| /pdv/vendas/representantes | Representantes.tsx | A |
| /pdv/vendas/clientes, /:id | Clientes.tsx, ClienteDetalhe.tsx | B |
| /pdv/vendas/produtos | Produtos.tsx | B |
| /pdv/vendas/fornecedores | Fornecedores.tsx | B |
| /pdv/vendas/propostas, /nova, /:id | Propostas.tsx, PropostaEditar.tsx | C |
| /pdv/vendas/pedidos, /:id | Pedidos.tsx, PedidoDetalhe.tsx | C |
| /proposta/:token (público) | src/pages/PublicProposta.tsx | C |
| /pdv/vendas/agenda | Agenda.tsx | D |
| /pdv/vendas/receber, /pagar, /cobrancas, /comissoes, /configuracoes | ContasReceber, ContasPagar, Cobrancas, Comissoes, Configuracoes | F |
| /representante (casca, Hoje, Clientes, Cliente, Catálogo) | RepresentanteApp.tsx, Hoje, Clientes, ClienteDetalhe, Catalogo | E |
| /representante/propostas, /nova, /:id, /pedidos | Propostas, PropostaEditar, Pedidos | C |
| /representante/agenda | Agenda | D |
| /representante/comissoes | Comissoes | F |
| functions vendas-asaas, vendas-asaas-webhook, vendas-enviar | supabase/functions/* | G |

## Estabelecimento de teste (dados fictícios)

"Distribuidora Teste · Velara Vendas" · dono `vendas-dono@teste.velara.local`, representante
`vendas-rep@teste.velara.local` (Rita, 5% de comissão, 10% de desconto máximo). 3 clientes B2B (2 na carteira da Rita),
3 produtos com preço de representante. As senhas não ficam no repositório.
