# Velara PDV · terminal Getnet

App que roda **dentro da maquininha Getnet POS Digital**. O caixa manda o valor
pelo sistema, este app pega da fila e abre a aplicação de Pagamento da Getnet
pelo deeplink `getnet://pagamento/v1/payment`. No fim, devolve NSU, autorização,
bandeira e final do cartão para o pedido no Velara. Ninguém digita valor na
maquininha.

## Como conversa com o Velara

É a **mesma fila** que a ponte de impressão atende no computador da loja
(`pdv_tef_requests`), pelas mesmas funções:

- `tef_bridge_claim_batch(p_tenant, p_device, p_limit)` pega o próximo pedido
- `tef_bridge_finish(p_request_id, p_status, p_result, p_error)` devolve o resultado

Trocar de caminho (computador da loja ou maquininha) não muda nada no banco nem
na tela do caixa.

## Configurar no terminal

Abrir o app, tocar em **Configurar terminal** e informar:

- **Código do estabelecimento**: o UUID do restaurante (o mesmo usado na ponte
  de impressão), que aparece no Velara em Integrações > Getnet
- **Nome do terminal**: "Caixa 1", por exemplo

No Velara, em Integrações > Getnet, o provedor precisa ficar como
**maquininha (nuvem/terminal)** e a TEF ligada.

## Compilar

Não compila na máquina do dia a dia (sem SDK do Android). O APK sai pelo
GitHub Actions, no workflow `.github/workflows/pos-getnet.yml`:
rodar o workflow e baixar o artefato `velara-pos-getnet-apk`.

**A chave de assinatura é gerada na primeira compilação e vem no artefato
`chave-de-assinatura`.** Guardar e cadastrar como segredo `KEYSTORE_B64` e
`KEYSTORE_PASSWORD`: sem ela, a Getnet não aceita atualização deste mesmo app.
