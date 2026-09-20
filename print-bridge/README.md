# Velara Print Bridge

Serviço Node.js que roda no PC do caixa (Windows/Linux) e imprime automaticamente
os itens lançados nos centros de produção. Escuta o Supabase Realtime e envia
comandos ESC/POS via TCP (porta 9100) para as impressoras térmicas configuradas
em cada centro.

## Arquitetura

```
Tablet do garçom → UPDATE pdv_comanda_items.sent_to_kitchen_at
                 → INSERT em pdv_print_jobs (snapshot do item)
                          ↓ Supabase Realtime (WebSocket)
                  Print Bridge (PC do caixa)
                          ↓ TCP :9100 (ESC/POS)
                  Impressora térmica do centro
                          ↓ UPDATE pdv_print_jobs.status = 'printed'|'failed'
```

A fila `pdv_print_jobs` é a fonte de verdade da impressão:
- Cada item enviado para cozinha vira um job com snapshot completo
- O bridge marca como `printing` → `printed` ou `failed`
- Se o bridge estiver offline, ao voltar reprocessa jobs `pending` das últimas 2h

## Requisitos

- Node.js 18 ou superior
- Windows 10/11 (Linux/macOS também funcionam)
- Impressoras térmicas na rede local com IP fixo, porta 9100 (ESC/POS)

## Instalação

1. Copie esta pasta `print-bridge/` para o PC do caixa.
2. Duplique `.env.example` como `.env` e preencha:
   ```
   SUPABASE_URL=https://frbziqazwhymwsrtneoy.supabase.co
   SUPABASE_ANON_KEY=<cole aqui a anon key>
   ESTABLISHMENT_NAME=Nome do Restaurante
   BRIDGE_HTTP_PORT=7777
   ```
3. Abra o Prompt de Comando na pasta e rode:
   ```
   npm install
   ```

## Maquininha (TEF)

Só preencha se esta instalação for cobrar no cartão pelo PDV. Sem `TEF_PROVIDER`
a ponte ignora a fila da maquininha e segue só imprimindo.

```
TEF_PROVIDER=http          # "simulado" para testar sem maquininha
TEF_HTTP_URL=http://127.0.0.1:9999/tef   # endereço do agente de TEF da loja
TEF_HTTP_TOKEN=            # se o agente exigir
TEF_TIMEOUT_MS=120000
```

O adaptador `http` manda para o agente:

```json
{ "operacao": "venda", "valor": 87.5, "modalidade": "credito",
  "parcelas": 1, "financiamento": "avista", "referencia": "<id do pedido>" }
```

e espera de volta:

```json
{ "aprovado": true, "nsu": "123456789", "autorizacao": "654321",
  "bandeira": "VISA", "cartao_final": "1234",
  "via_cliente": "...", "via_estabelecimento": "..." }
```

Cada TEF de mercado (Getnet local, ConnectTEF, PayGo, SiTef) tem o seu próprio
contrato. Quando o estabelecimento disser qual usa, o adaptador dele entra em
`lib/tef.js` ao lado dos dois que já existem, sem mexer em mais nada.

Do lado do PDV, a maquininha se liga em Integrações > Getnet.

## Execução manual

```
npm start
```

Saída esperada:

```
[HH:mm:ss] === Velara Print Bridge — Meu Restaurante ===
[HH:mm:ss] HTTP local em http://localhost:7777 (health, test-print)
[HH:mm:ss] → Conectando Realtime (print-bridge-1700000000000)...
[HH:mm:ss] ✓ Realtime conectado. Ouvindo INSERTs em pdv_order_items e pdv_comanda_items.
```

## Iniciar automaticamente com o Windows (pm2)

```
npm install -g pm2
pm2 start server.js --name velara-print-bridge
pm2 startup
pm2 save
```

Para ver os logs em tempo real: `pm2 logs velara-print-bridge`.

## Testar uma impressora específica

Na mesma máquina onde o bridge está rodando:

```
node test-print.js 192.168.1.51
node test-print.js 192.168.1.51 9100
```

Ou, a partir do painel do PDV (`/pdv/centros-producao`), clique em **Testar
impressora** no card do centro. O botão chama `POST http://localhost:7777/test-print`
do navegador do caixa.

## Endpoints HTTP locais

- `GET  http://localhost:7777/health` → `{ status: "ok" }`
- `POST http://localhost:7777/test-print` com body `{ "ip": "192.168.1.51", "port": 9100, "centerName": "Cozinha" }`

Estes endpoints são acessíveis apenas da própria máquina (bind em 127.0.0.1).

## Troubleshooting

- **"Print Bridge offline" no painel**: o serviço não está rodando. Rode `npm start`
  ou verifique o pm2 (`pm2 status`).
- **Timeout de conexão (5s)**: IP errado, impressora desligada ou fora da rede.
  Teste com `ping <ip>` e `telnet <ip> 9100`.
- **Impressora imprime lixo**: confirme que é ESC/POS e que está configurada como
  térmica (58 ou 80mm). Drivers Windows não são usados — o bridge conversa
  direto por TCP.
- **Realtime desconecta**: reconecta automaticamente com backoff 30s → 5min.
  Se persistir, verifique `SUPABASE_URL` e `SUPABASE_ANON_KEY`.

## Segurança

- O bridge usa apenas a `anon key` do Supabase — acesso somente às views
  `vw_print_bridge_order_items` e `vw_print_bridge_comanda_items`, que são
  `security_invoker` e respeitam RLS.
- O servidor HTTP faz bind em `127.0.0.1`, portanto não é acessível por outras
  máquinas da rede.
