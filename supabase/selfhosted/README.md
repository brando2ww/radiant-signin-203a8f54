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
