# Mesa Digital · plano do módulo

Autoatendimento por QR code no salão. O cliente aponta a câmera, informa nome e
celular, entra na mesa, vê o cardápio, pede e, no fim, fecha a conta para ver o
valor. O pagamento continua no caixa, como hoje.

Plano de 15/10/2026, montado a partir do mapeamento do código e do banco de
produção (mesas, comandas, cardápio, cozinha e pagamento). Acompanhamento em
[PROGRESSO.md](./PROGRESSO.md).

---

## 1. Decisões tomadas

| # | Decisão | Consequência no desenho |
|---|---|---|
| 1 | O administrador escolhe **um QR por mesa** ou **um QR geral**. Depois de gerado, o QR **não muda nunca** | Token permanente por mesa e um token geral por restaurante. O banco recusa alterar o token e recusa apagar o QR; só existe desativar. Com o QR geral, o cliente escolhe a mesa numa lista |
| 2 | O pedido **vai direto para a cozinha quando aprovado** | Toda pessoa que entra na mesa pelo QR é aprovada pelo garçom ou pelo caixa. Aprovada, os pedidos dela vão direto para a cozinha. Configurável para aprovar **todo** pedido |
| 3 | **Uma conta por mesa** | Todos que entram pelo mesmo QR de mesa pedem na mesma comanda. Cada pessoa fica registrada como participante (nome e celular), mas a conta é uma só |
| 4 | **Cardápio do Salão próprio**, montado do zero ou importado do delivery | Categorias e itens próprios (`mesa_cardapio_categorias` com id, `mesa_cardapio_itens`). Cada item aponta para um produto do cadastro do salão (`pdv_products`): é de lá que vêm o preço de salão, o centro de produção, a baixa de estoque e os dados fiscais. A importação cria categorias e itens a partir do delivery (`delivery_products.source_pdv_product_id`), trazendo nome da categoria, ordem, foto e descrição; **não** traz preço |
| 5 | **Sem pagamento pelo celular** | "Fechar a conta" mostra o valor detalhado (itens, taxa de serviço, total) e manda a mesa para a fila do caixa. Fins demonstrativos |
| 6 | **Sem WhatsApp** | O celular é só informado. Sem código de verificação, sem mensagem |

---

## 2. O que já existe e o que pesa no desenho

**Reaproveitado sem mudança:** mesas (`pdv_tables`), atendimento (`pdv_orders`),
comanda (`pdv_comandas`), itens (`pdv_comanda_items`), fila do caixa,
`PaymentDialog`, relatórios, NFC-e, fechamento de caixa, centros de produção e a
Print Bridge. A mesa aberta pelo QR é uma mesa como outra qualquer para o caixa e
para o garçom.

**O que impede o cliente anônimo de usar o caminho de hoje:**

1. **Lançar item é feito no navegador do garçom.** O preço (`unit_price`) vem do
   aparelho, e a expansão de opções e composição (`expandSelectedOptions.ts`,
   `expandComposition.ts`) e o centro de produção (`resolveProductionCenter.ts`)
   são resolvidos no cliente.
2. **Enviar para a cozinha é feito no navegador** (`sendToKitchenMutation`, em
   `use-pdv-comandas.ts`). Não há gatilho no banco para itens de mesa.
3. **Abrir a mesa são três escritas soltas** (order, mesa, comanda), sem
   transação e sem trava de "um atendimento aberto por mesa". Já existem 11
   atendimentos órfãos no Kōten.
4. **A comanda exige caixa aberto** (`pdv_next_comanda_number` lança erro).
5. **Mesas e comandas não geram evento ao vivo.** `pdv_comandas`, `pdv_tables` e
   `pdv_orders` estão fora da publicação `supabase_realtime`; o caixa só percebe
   itens.
6. **Status duplicados sem CHECK:** `fechada`/`fechado`, `aberta`/`aberto`.
7. **Nenhuma tabela do salão é legível sem login**, e isso deve continuar assim.

**O que NÃO serve de modelo:** o cardápio público do delivery grava pedido direto
nas tabelas com a chave anônima e deixa `delivery_orders`, `delivery_customers` e
`delivery_settings` (com a chave Pix) abertos a qualquer visitante. Ver seção 8.

**Modelo a seguir:** o módulo de ponto. Token no link, função `SECURITY DEFINER`
que valida tudo no servidor, sessão com prazo, e checagem do módulo no banco
(`ponto_abrir`, `ponto_bater`, `ponto_tem_modulo`).

---

## 3. Princípios

1. **O cliente nunca escreve em tabela.** Tudo passa por funções do banco com o
   token do QR e o token da sessão. Nenhuma policy nova para `anon`.
2. **O preço é do servidor.** O celular manda produto, quantidade, opções e
   observação; o banco calcula o valor a partir de `price_salon`.
3. **Mesmo caminho para garçom e cliente.** As funções de lançar item e enviar
   para a cozinha da Fase 0 passam a ser usadas também pelo app do garçom, para
   não manter duas regras de preço.
4. **Nada muda para o caixa.** A comanda pelo QR entra na mesma fila, com o
   selo "QR".

---

## 4. Experiência

### Cliente
1. Lê o QR. Abre `pdv.velaraia.app/m/<token>`, com logo e cores do restaurante.
2. **QR de mesa:** vê "Mesa 05". **QR geral:** escolhe a mesa numa lista.
3. Informa nome e celular, com o aviso de privacidade (LGPD: para que serve,
   por quanto tempo fica guardado).
4. Fica em "Aguardando o garçom liberar a mesa". Enquanto isso, já pode navegar
   no cardápio e montar o carrinho.
5. Liberado: envia o pedido, que sai na cozinha. Na tela: o que já foi pedido, o
   que está aguardando aprovação e o total parcial.
6. Botões fixos: **Chamar garçom** e **Fechar a conta**. Fechar mostra a conta
   detalhada e avisa "o pagamento é feito no caixa"; a mesa entra na fila do
   caixa.

**Situações tratadas:**
- **Caixa fechado:** "No momento os pedidos são feitos com o garçom." Não abre.
- **Mesa já aberta pelo garçom:** o cliente entra nela, como participante.
- **Segunda pessoa no mesmo QR:** também pede aprovação e entra na mesma conta.
- **Mesa fechada no caixa:** as sessões dela se encerram e a página volta ao início.
- **Sessão parada há muito tempo:** expira (padrão de 6 horas).

### Garçom e caixa
- **Painel "Mesa Digital"** no app do garçom e no salão do PDV, com som:
  - pessoas aguardando aprovação (nome, celular, mesa), com **Aprovar** e **Recusar**;
  - pedidos aguardando (só no modo "aprovar todo pedido");
  - chamados ("chamou o garçom", "pediu a conta"), com **Atendido**.
- Comanda com o selo **QR** e o celular de quem abriu.
- O garçom continua podendo lançar itens na mesma comanda.

### Administrador (`/pdv/mesa-digital`)
- **Configuração:** tipo de QR (por mesa ou geral), modo de aprovação, mensagem
  de boas-vindas, mostrar taxa de serviço na conta, tempo de sessão.
- **QR codes:** gerar o QR de cada mesa ou o geral, com aviso de que é
  definitivo. Cartaz em PDF para imprimir, um por mesa com o número, em lote.
  Mesa nova cadastrada depois ganha o próprio QR. Desativar um QR é possível;
  trocar, não.
- **Cardápio do Salão:** criar categorias, adicionar produtos do cadastro do
  salão, ordem, destaques, foto e descrição próprias. Botão "Importar do
  delivery", que monta categorias e itens a partir do cardápio do delivery
  (sem preços: o preço é sempre o de salão do produto).

---

## 5. Modelo de dados (novo)

Todas com `user_id` do dono, como o resto do PDV, e RLS só para
`authenticated` com `auth.uid() = user_id or is_establishment_member(user_id)`.

| Tabela | Para quê | Campos principais |
|---|---|---|
| `mesa_config` | Configuração por restaurante | `user_id` (PK), `tipo_qr` (`por_mesa`/`geral`), `aprovacao` (`por_pessoa`/`todo_pedido`), `mensagem_boas_vindas`, `mostrar_taxa_servico`, `sessao_horas` |
| `mesa_qr_codes` | Os QR, permanentes | `id`, `user_id`, `tipo` (`mesa`/`geral`), `table_id` (nulo no geral), `token` (único, aleatório), `ativo`, `criado_em`. Um por mesa e um geral por restaurante. Gatilho recusa UPDATE do token e DELETE |
| `mesa_sessoes` | Cada pessoa que entrou | `id`, `user_id`, `qr_code_id`, `table_id`, `order_id`, `comanda_id`, `nome`, `celular`, `token_hash`, `status` (`aguardando`/`aprovada`/`recusada`/`encerrada`), `aprovada_por`, `aprovada_em`, `criada_em`, `ultimo_acesso`, `expira_em` |
| `mesa_pedidos` | Pedido do cliente antes de virar item | `id`, `sessao_id`, `comanda_id`, `status` (`aguardando`/`enviado`/`recusado`), `itens` (jsonb, como o cliente mandou), `total_calculado`, `criado_em`, `decidido_por`, `decidido_em` |
| `mesa_chamados` | Chamar garçom e pedir conta | `id`, `user_id`, `table_id`, `sessao_id`, `tipo` (`garcom`/`conta`), `status` (`aberto`/`atendido`), `criado_em`, `atendido_por`, `atendido_em` |
| `mesa_cardapio_categorias` | Categorias do Cardápio do Salão, próprias | `id`, `user_id`, `nome`, `descricao`, `foto_url`, `ordem`, `ativa`, `origem` (`manual`/`delivery`), `delivery_category_id` |
| `mesa_cardapio_itens` | Itens do Cardápio do Salão | `id`, `user_id`, `categoria_id`, `product_id` (→ `pdv_products`), `nome_exibido`, `descricao`, `foto_url`, `ordem`, `destaque`, `ativo`, `delivery_product_id` |

**Colunas novas em tabelas existentes:**
- `pdv_comandas.customer_phone`, `pdv_comandas.origem` (`garcom`/`caixa`/`qr`).
- `pdv_comanda_items.origem` e `pdv_comanda_items.mesa_pedido_id`.

**Por que o pedido fica em `mesa_pedidos` até ser aprovado:** se entrasse direto
em `pdv_comanda_items`, o gatilho de subtotal já somaria na comanda e o caixa
cobraria o que a cozinha nunca recebeu.

**Publicações:** `pdv_tables`, `pdv_comandas`, `pdv_orders`, `mesa_sessoes`,
`mesa_pedidos` e `mesa_chamados` entram em `supabase_realtime` (e em
`kvm_mirror`, se ainda estiver em uso).

---

## 6. Funções do banco

### Fase 0 · base compartilhada (usadas pelo garçom e pelo QR)

| Função | O que faz |
|---|---|
| `pdv_abrir_atendimento(owner, table_id, nome, telefone, origem)` | Em uma transação: confere caixa aberto, cria o `pdv_orders`, ocupa a mesa e cria a comanda. Se a mesa já tem atendimento aberto, devolve o existente. Respeita o índice novo de um atendimento aberto por mesa |
| `pdv_lancar_itens(comanda_id, itens jsonb, origem)` | Calcula preço a partir de `price_salon` e das opções, expande composição e opções vinculadas como filhos (regra de hoje: filho de composição a R$ 0), resolve o centro de produção e grava. É o porte para o servidor de `expandSelectedOptions.ts`, `expandComposition.ts` e `resolveProductionCenter.ts` |
| `pdv_enviar_cozinha(item_ids)` | Marca `sent_to_kitchen_at` e cria os `pdv_print_jobs` agrupados por comanda e centro, com o mesmo payload de hoje. Porte de `sendToKitchenMutation` |

O app do garçom passa a chamar essas três. Teste de aceite: para os 358
produtos do Kōten, o preço e os filhos gerados pelo servidor batem com os
gerados pelo código atual do navegador.

### Fase 1 · cliente (executáveis sem login, tudo validado por token)

| Função | Entrada | Saída e regras |
|---|---|---|
| `mesa_abrir(qr_token)` | token do QR | Restaurante (nome, logo, cores, mensagem), tipo do QR, a mesa (ou a lista de mesas no QR geral), se o caixa está aberto e se o módulo está ativo (`mesa_tem_modulo`) |
| `mesa_cardapio(qr_token)` | token do QR | Cardápio da mesa em JSON: categorias e produtos visíveis, preço de salão, opções e composição |
| `mesa_entrar(qr_token, table_id, nome, celular)` | | Cria a sessão em `aguardando` e devolve o token da sessão. Valida nome e celular, limita sessões por mesa e por minuto |
| `mesa_estado(sessao_token)` | | Status da sessão, itens já enviados, pedidos aguardando, total parcial e chamados abertos. O celular consulta a cada 5 segundos; sem realtime para anônimo |
| `mesa_pedir(sessao_token, itens jsonb, chave)` | | Recusa se a sessão não estiver aprovada. Calcula o total no servidor. No modo `por_pessoa`, chama `pdv_lancar_itens` e `pdv_enviar_cozinha` na hora; no `todo_pedido`, grava em `mesa_pedidos` como `aguardando`. A `chave` evita pedido duplicado por toque duplo |
| `mesa_chamar(sessao_token, tipo)` | | Cria o chamado `garcom`, sem duplicar enquanto houver um aberto |
| `mesa_fechar_conta(sessao_token)` | | Devolve a conta detalhada (itens, taxa de serviço calculada no servidor, total), passa a comanda para `aguardando_pagamento` e abre o chamado `conta` |

### Fase 1 · equipe (exigem login e `is_establishment_member`)

| Função | O que faz |
|---|---|
| `mesa_aprovar_sessao(sessao_id)` | Chama `pdv_abrir_atendimento` (ou usa o atendimento aberto da mesa), liga a sessão à comanda e grava telefone e origem na comanda |
| `mesa_recusar_sessao(sessao_id)` | Encerra a sessão; o celular vê "não liberado, chame o garçom" |
| `mesa_aprovar_pedido(pedido_id)` / `mesa_recusar_pedido(pedido_id)` | Modo `todo_pedido`: lança e envia para a cozinha, ou descarta |
| `mesa_atender_chamado(chamado_id)` | Marca como atendido |
| `mesa_gerar_qr(table_id or null)` | Gera o QR definitivo. Recusa se já existir |

**Encerramento:** quando a comanda vira `fechada`/`fechado` ou `cancelada`, um
gatilho encerra as sessões ligadas a ela.

---

## 7. Fases

| Fase | Entrega | Critério de pronto |
|---|---|---|
| **0 · Base** | Índice de um atendimento aberto por mesa; as três funções compartilhadas; app do garçom usando-as; publicações de realtime; status tratados nas duas grafias | Garçom lança e imprime igual a hoje no Kōten; teste dos 358 produtos sem diferença de preço nem de filhos |
| **1 · QR e pedido** | Tabelas novas, funções do cliente e da equipe, página `/m/:token`, painel de aprovação e chamados no garçom e no salão, configuração e geração de QR com cartaz em PDF, registro do módulo `mesa` (tipo, rotas, menu, super admin, `mesa_tem_modulo`) | Mesa de teste: escaneia, entra, garçom aprova, pede, sai na impressora, chama o garçom, fecha a conta e o caixa recebe na fila com o valor certo |
| **2 · Cardápio do Salão** | Montar do zero (categorias e itens próprios), importar do delivery, visual do restaurante | O Kōten monta o cardápio do cliente sem as categorias internas ("Etapas", "Reposição", "Sub produtos") |
| **3 · Piloto** | Kōten Garibaldi, uma ou duas mesas primeiro, depois o salão | Uma semana sem pedido perdido, preço divergente ou mesa órfã |

**Fora deste escopo, por decisão:** pagamento pelo celular, WhatsApp e
verificação do celular, CRM e fidelidade pelo celular, tela de cozinha.

---

## 8. Riscos e cuidados

1. **QR geral permite pedido de fora do restaurante.** Mitigado pela aprovação
   de cada pessoa. É o motivo de não existir modo "sem aprovação".
2. **QR definitivo não pode ser revogado por troca.** Se um QR vazar, a única
   saída é desativar e imprimir outro para a mesma mesa como QR novo. Isso
   preserva a regra (o antigo nunca muda), mas exige reimprimir.
3. **Regra de preço em dois lugares durante a transição.** Por isso a Fase 0
   leva o garçom para as mesmas funções antes de o QR ir ao ar.
4. **Caixa fechado bloqueia a abertura.** É a regra atual da comanda; a página
   explica ao cliente.
5. **Carga no servidor:** o celular consulta o estado a cada 5 segundos. No
   pico do Kōten (cerca de 13 mesas e algumas pessoas por mesa) são poucas
   dezenas de consultas por minuto, leves. Medir no piloto.
6. **Brechas atuais, fora deste módulo:** anônimo lê e altera `delivery_orders`
   e `delivery_customers`, lê `delivery_settings` (chave Pix) e tem acesso total
   a `delivery_order_item_options`; `pdv_print_jobs` aberto a anônimo (a Print
   Bridge depende disso); funções `SECURITY DEFINER` executáveis por anônimo sem
   checar o dono (`pdv_next_comanda_number`, `pdv_ensure_counter_table`,
   `delivery_clone_options_from_pdv`, `tef_bridge_finish`). Recomendado tratar em
   paralelo, porque um QR público vai atrair mais tráfego para o domínio.
