# Mesa Digital · o que está pronto e o que falta

Acompanha o plano em [PLANO.md](./PLANO.md). Atualizado em 15/10/2026.

Legenda: **[x]** pronto e testado · **[~]** em andamento · **[ ]** não começou

## Decisões

| | Item | Situação |
|---|---|---|
| [x] | QR por mesa ou geral, escolha do administrador, definitivo depois de gerado | decidido em 15/10 |
| [x] | Aprovação: pessoa aprovada pelo garçom, pedidos dela direto para a cozinha (opcional aprovar todo pedido) | decidido em 15/10 |
| [x] | Uma conta por mesa | decidido em 15/10 |
| [x] | Sem pagamento pelo celular; fechar a conta só mostra o valor | decidido em 15/10 |
| [x] | Sem WhatsApp | decidido em 15/10 |
| [x] | Cardápio do Salão próprio, montado do zero ou importado do delivery; item aponta para o produto do salão | decidido em 15/10 |
| [ ] | Preço do módulo | |

## Fase 0 · Base

| | Item | Situação |
|---|---|---|
| [ ] | Índice de um atendimento aberto por mesa | bloqueado: 11 atendimentos vazios do Kōten (28/04 e 09/05, sem comanda nem item) precisam ser encerrados antes · aguardando autorização |
| [ ] | `pdv_abrir_atendimento` | |
| [x] | `pdv_lancar_itens` (preço, opções, composição, centro de produção no servidor) | no banco desde 15/10, só para quem está logado e é da loja; base interna `pdv_calcular_itens` sem acesso externo |
| [x] | `pdv_enviar_cozinha` | no banco desde 15/10; cupom com as mesmas 11 chaves de cabeçalho e 7 de item que o app gera |
| [~] | App (garçom, caixa e Comandas) usando as funções | `use-pdv-comandas.ts` trocado no branch `docs-mesa-digital`, build ok; **não publicado**: entra de manhã, fora do horário do salão |
| [x] | Teste contra o código atual do app | 1.211 cenários (Kōten Garibaldi e Farroupilha, La Vecchia, Sertão Adentro), 1.171 sub-itens: zero diferença de preço, centro ou observação; 50 diferenças só na ordem entre sub-itens de MESMA posição, que hoje já é aleatória. Lançamento + cupom testados de ponta a ponta numa transação desfeita |
| [ ] | `pdv_tables`, `pdv_comandas` e `pdv_orders` na publicação de realtime | |

## Fase 1 · QR e pedido

| | Item | Situação |
|---|---|---|
| [ ] | Tabelas `mesa_*` e colunas novas em comanda e item | |
| [ ] | Funções do cliente (`mesa_abrir`, `mesa_cardapio`, `mesa_entrar`, `mesa_estado`, `mesa_pedir`, `mesa_chamar`, `mesa_fechar_conta`) | |
| [ ] | Funções da equipe (aprovar/recusar sessão e pedido, atender chamado, gerar QR) | |
| [ ] | Página pública `/m/:token` | |
| [ ] | Painel de aprovação e chamados no app do garçom e no salão, com som | |
| [ ] | Configuração, geração do QR e cartaz em PDF | |
| [ ] | Registro do módulo `mesa` (tipo, rotas, menu, super admin, `mesa_tem_modulo`) | |

## Fase 2 · Cardápio do Salão

| | Item | Situação |
|---|---|---|
| [ ] | Montar do zero: categorias e itens próprios | |
| [ ] | Importar do delivery (sem preços) | |

## Fase 3 · Piloto

| | Item | Situação |
|---|---|---|
| [ ] | Kōten Garibaldi, uma mesa | |
| [ ] | Kōten Garibaldi, salão inteiro | |
