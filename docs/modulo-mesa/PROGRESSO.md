# Mesa Digital · o que está pronto e o que falta

Acompanha o plano em [PLANO.md](./PLANO.md). Atualizado em 15/10/2026.

Legenda: **[x]** pronto e testado · **[~]** em andamento · **[ ]** não começou

## Decisões

| | Item | Situação |
|---|---|---|
| [x] | QR por mesa ou geral, escolha do administrador, definitivo depois de gerado | decidido em 15/10 |
| [x] | Sem aprovação: o pedido do cliente vai automático para a cozinha | revisto em 16/10 |
| [x] | Uma conta por mesa | decidido em 15/10 |
| [x] | Sem pagamento pelo celular; fechar a conta só mostra o valor | decidido em 15/10 |
| [x] | Sem WhatsApp | decidido em 15/10 |
| [x] | Cardápio do Salão próprio, montado do zero ou importado do delivery; item aponta para o produto do salão | decidido em 15/10 |
| [ ] | Preço do módulo | |

## Fase 0 · Base

| | Item | Situação |
|---|---|---|
| [x] | Índice de um atendimento aberto por mesa | 16/10: 11 atendimentos vazios do Kōten cancelados com autorização; `uniq_pdv_orders_um_aberto_por_mesa` criado |
| [x] | `pdv_abrir_atendimento_interno` | 16/10, dentro da base da Fase 1 |
| [x] | `pdv_lancar_itens` (preço, opções, composição, centro de produção no servidor) | no banco desde 15/10, só para quem está logado e é da loja; base interna `pdv_calcular_itens` sem acesso externo |
| [x] | `pdv_enviar_cozinha` | no banco desde 15/10; cupom com as mesmas 11 chaves de cabeçalho e 7 de item que o app gera |
| [x] | App (garçom, caixa e Comandas) usando as funções | publicado em 16/10 às 10h55 (commit ec623c73) |
| [x] | Teste contra o código atual do app | 1.211 cenários (Kōten Garibaldi e Farroupilha, La Vecchia, Sertão Adentro), 1.171 sub-itens: zero diferença de preço, centro ou observação; 50 diferenças só na ordem entre sub-itens de MESMA posição, que hoje já é aleatória. Lançamento + cupom testados de ponta a ponta numa transação desfeita |
| [x] | `pdv_tables`, `pdv_comandas` e `pdv_orders` na publicação de realtime | 16/10, com `mesa_chamados` e `mesa_sessoes` |

## Fase 1 · QR e pedido

| | Item | Situação |
|---|---|---|
| [x] | Tabelas `mesa_*` e colunas novas em comanda e item | 16/10 (`20261016120000_mesa_digital_base.sql`) |
| [x] | Funções do cliente (`mesa_abrir`, `mesa_cardapio`, `mesa_entrar`, `mesa_estado`, `mesa_pedir`, `mesa_chamar`, `mesa_fechar_conta`) | 16/10; testadas como anônimo numa transação desfeita (entrar, pedir R$ 197 com combo e Poke, toque duplo, etapa obrigatória, 2ª pessoa na mesma conta, cupom, chamar, fechar conta, bloqueios depois de fechar, QR imutável) |
| [x] | Funções da equipe (gerar QR, desativar QR, atender chamado) | 16/10; sem aprovar/recusar, por decisão |
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
