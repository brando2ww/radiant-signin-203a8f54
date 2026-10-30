# Supabase self-hosted (produção)

Desde a migração da nuvem (18/09/2026), o banco e as funções do Velara rodam
num Supabase self-hosted na VPS `kvmnexcharge` (179.199.153.230), no stack
`/opt/sb/velara-pdv`. Esta pasta guarda o que existe só no servidor, para não
se perder se ele precisar ser montado de novo.

## O que tem aqui

- `functions-main/index.ts` · roteador das funções (`volumes/functions/main/index.ts`
  no servidor). Valida o JWT e sobe um worker por função. Tem o ajuste de
  13/10/2026 que acabou com o corte das funções aos 60 s (envio de cotação
  pelo WhatsApp). Não é uma função: não publicar como `main`.
- `cron-jobs.sql` · as 6 tarefas agendadas criadas direto no banco, com as
  chaves trocadas por marcadores. As outras 5 estão nas migrations.

## Como publicar uma função

As funções em `supabase/functions/` vão por cópia, não pelo CLI:

```bash
scp supabase/functions/<nome>/index.ts kvmnexcharge:/opt/sb/velara-pdv/volumes/functions/<nome>/index.ts
```

O runtime lê o arquivo novo sozinho, mas um worker que já estava de pé segue
com o código antigo por até 150 s (`workerTimeoutMs`).

O servidor guarda as funções no formato baixado da nuvem (sem tipos e
reformatado). Comparando o código de 24/10/2026, todas batem com este
repositório. Só no servidor ficaram `hello` (exemplo) e
`whatsapp-notifications` (antiga, ninguém chama).

## Clientes das comandas e cashback

A migration `20261026150000_clientes_das_comandas.sql` deve ser aplicada no
PostgreSQL antes de publicar a interface que consulta `pdv_clientes_cashback`.
Ela importa somente os contatos históricos com nome e telefone válido, das
comandas e das sessões da Mesa Digital, e aplica a mesma regra aos novos preenchimentos.
O vínculo com a comanda é interno; nome e telefone ficam em `pdv_customers`.

O telefone é comparado por loja, sem máscara e sem o prefixo 55. Registros sem
nome ou sem telefone válido não são importados. Rótulos como "Mesa 4" ou
"Pessoa 1" não são considerados nomes de clientes.
A importação pode ser repetida e preserva campos já cadastrados, datas das
comandas e créditos existentes. Ela não cria créditos retroativos.

Para testar em um PostgreSQL local descartável, com `initdb`, `pg_ctl` e `psql`
no PATH: `node scripts/test-clientes-cashback.mjs`. O teste também verifica o
isolamento por loja, saldos vencidos/usados e a badge da interface.

`20261028110000_clientes_consumo_config_cashback.sql` acrescenta consultas de
consumo pago por telefone e canal, histórico de créditos e configuração de
cashback pelo proprietário ou gerente da loja. As consultas são paginadas na
interface e validam o estabelecimento no servidor. O histórico não soma de novo
o pedido-pai quando já há comandas; delivery conta pedidos pagos e concluídos.

Em **Clientes → Configurar cashback**, ou **Configurações → Frente de Caixa →
Cashback**, o estabelecimento pode mudar percentual, validade e ativação.
A ativação registra o início do programa: contas anteriores não geram crédito
retroativo. Alterações preservam os créditos emitidos e seus vencimentos.
Desativar e reativar inicia um novo período de geração, sem recuperar vendas
do intervalo desativado. A publicação da migration não ativa nenhuma loja.

`node scripts/test-clientes-consumo.mjs` testa as permissões reais dos RPCs,
geração e idempotência dos créditos, datas, canais, filtros e a seleção da fila
do caixa. A fila inclui comandas com itens salvos, mesmo sem envio à cozinha.

## Histórico de comandas fechadas

`20261028120000_historico_comandas_fechadas.sql` acrescenta dois RPCs somente
leitura para **Caixa → Histórico de comandas** (`/pdv/caixa/historico`). Inclui
comandas de mesa e avulsas de qualquer sessão de caixa, busca por cliente,
telefone, número ou mesa e período de fechamento no horário de São Paulo.
A paginação acontece no servidor; o total não é limitado às 1000 linhas do
PostgREST. Os detalhes carregam itens antigos, complementos, cancelamentos e
pagamentos independentemente das consultas de comandas ativas.

O valor recebido vem dos pagamentos vinculados ao atendimento ou dos movimentos
vinculados à comanda. As duas fontes não são somadas, pois podem representar a
mesma venda. Cobranças do atendimento são identificadas como compartilhadas;
ausência de vínculo antigo não é apresentada como pagamento zero ou como o
valor do consumo. A autorização exige vínculo com a loja e `view_history`.

`node scripts/test-historico-comandas.mjs` valida isolamento, permissões,
paginação acima de 1000 registros, datas, dados antigos e valores de cobrança
em um PostgreSQL descartável.
