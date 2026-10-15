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
| [ ] | Cardápio sobre o cadastro do salão + importar organização do delivery | recomendado, falta confirmar |
| [ ] | Preço do módulo | |

## Fase 0 · Base

| | Item | Situação |
|---|---|---|
| [ ] | Índice de um atendimento aberto por mesa (e limpeza dos 11 órfãos do Kōten, com autorização) | |
| [ ] | `pdv_abrir_atendimento` | |
| [ ] | `pdv_lancar_itens` (preço, opções, composição, centro de produção no servidor) | |
| [ ] | `pdv_enviar_cozinha` | |
| [ ] | App do garçom usando as três funções | |
| [ ] | Teste: 358 produtos do Kōten com preço e filhos idênticos ao cálculo atual | |
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

## Fase 2 · Cardápio da mesa

| | Item | Situação |
|---|---|---|
| [ ] | Curadoria de categorias e produtos | |
| [ ] | Importar organização do delivery (sem preços) | |

## Fase 3 · Piloto

| | Item | Situação |
|---|---|---|
| [ ] | Kōten Garibaldi, uma mesa | |
| [ ] | Kōten Garibaldi, salão inteiro | |
