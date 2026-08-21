# Templates para aprovação na Meta (WhatsApp Cloud API)

> **Estes templates NÃO valem para a SellGrid.** A SellGrid (Z-PRO) conecta um
> número comum de WhatsApp e envia texto livre — não há template a aprovar.
> O que está aqui só se aplica se/quando a Velara for para a **Cloud API oficial
> da Meta**, que exige app na Meta, verificação da empresa e número dedicado
> (o número usado lá **para de funcionar no aplicativo do celular**).

## Regras que reprovam (checadas em todos os textos abaixo)

- Variável **não pode** abrir nem fechar o corpo da mensagem.
- Parâmetro **não aceita** quebra de linha, tab, nem 4+ espaços seguidos ·
  é o que impede mandar a lista de itens dentro do texto.
- Duas variáveis não podem ficar coladas (`{{1}} {{2}}` precisa de texto entre elas).
- Categoria errada é reclassificada pela Meta, muda o preço e pode exigir opt-in.
- Template de **AUTHENTICATION** tem corpo fixo imposto pela Meta: não dá para
  manter o texto atual com emoji e assinatura.

---

## 1. Cotação para fornecedor

- **Nome:** `cotacao_fornecedor`
- **Categoria:** UTILITY
- **Idioma:** pt_BR

**Corpo:**
```
Olá, {{1}}! Você acabou de receber um pedido de cotação de orçamento.

Aqui é o {{2}}, portador do CNPJ {{3}}, da cidade de {{4}}.

Solicitamos, por gentileza, o retorno da cotação até {{5}}.

Número de itens a ser cotado: {{6}}

Ficamos no aguardo.
Cordialmente, {{7}}.

Toque no botão abaixo para informar seus preços.
```

**Botão:** URL dinâmica
- Texto: `Preencher orçamento`
- URL fixa no formulário da Meta: `https://pdv.velaraia.app/cotacao/`
- A Meta acrescenta o `{{1}}` no fim, resultando em `https://pdv.velaraia.app/cotacao/{{1}}`

**Variáveis:**

| # | Conteúdo | Amostra para a Meta |
|---|---|---|
| 1 | Nome do fornecedor | Fachini Bebidas |
| 2 | Nome do estabelecimento | La Vecchia Trattoria |
| 3 | CNPJ do estabelecimento | 65.822.837/0001-61 |
| 4 | Cidade do estabelecimento | Garibaldi |
| 5 | Prazo de retorno | 20/08/2026 às 18h |
| 6 | Quantidade de itens | 12 |
| 7 | Assinatura de quem envia | Ederson, Compras |
| botão | Token do link do fornecedor | 0bba9db6-616e-459e-ae03-3ed0cbd75adc |

**Prévia montada** (é assim que a Meta avalia):
```
Olá, Fachini Bebidas! Você acabou de receber um pedido de cotação de orçamento.

Aqui é o La Vecchia Trattoria, portador do CNPJ 65.822.837/0001-61, da cidade de Garibaldi.

Solicitamos, por gentileza, o retorno da cotação até 20/08/2026 às 18h.

Número de itens a ser cotado: 12

Ficamos no aguardo.
Cordialmente, Ederson, Compras.

Toque no botão abaixo para informar seus preços.
```

**Por que este texto passa nas regras que reprovam:**
- Não abre nem fecha o corpo com variável (`Olá, ` antes, e a frase do botão depois de `{{7}}.`).
- Nenhuma variável encostada em outra · sempre há texto entre elas.
- As quebras de linha estão no CORPO, o que é permitido. O que não pode é quebra
  de linha dentro do VALOR de uma variável — por isso a lista de itens vira o
  número em `{{6}}` e o detalhe vai todo para o link.

> A lista de itens sai do texto e vai toda para o link · o formulário público
> `/cotacao/:token` já existe e já é o caminho oficial de resposta.
> **Consequência:** o `default_message_template` que o lojista edita em
> Compras → Configurações deixa de valer neste canal.

---

## 2. Pedido ao fornecedor vencedor

- **Nome:** `pedido_fornecedor`
- **Categoria:** UTILITY
- **Idioma:** pt_BR

**Corpo:**
```
Olá, {{1}}! Aqui é do {{2}}. Fechamos o pedido {{3}} com você: {{4}} item(ns), total de {{5}}, com entrega prevista em {{6}}. Os detalhes seguem no link abaixo.
```

**Botão:** URL dinâmica · texto `Ver pedido`, URL `https://pdv.velaraia.app/pedido/{{1}}`

| # | Conteúdo | Exemplo |
|---|---|---|
| 1 | Nome do fornecedor | Pescados do Porto |
| 2 | Nome do estabelecimento | La Vecchia Trattoria |
| 3 | Número do pedido | PC-2026-0042 |
| 4 | Quantidade de itens | 7 |
| 5 | Valor total | R$ 4.670,90 |
| 6 | Prazo de entrega | 2 dias |

> **Depende de trabalho novo:** a página pública de pedido (`/pedido/:token`)
> ainda não existe. Só o recibo de recebimento existe hoje. Sem ela, use o
> template sem botão e mande os detalhes por outro meio.

---

## 3. Relatório de tarefas (o piloto recomendado)

- **Nome:** `relatorio_tarefas`
- **Categoria:** UTILITY
- **Idioma:** pt_BR

**Corpo:**
```
Relatório de tarefas de {{1}}: {{2}} de {{3}} concluídas, o que dá {{4}} do total. Ficaram pendentes {{5}} tarefa(s). Veja o detalhe por turno no aplicativo.
```

**Botão:** URL estática · texto `Abrir no Velara`, URL `https://pdv.velaraia.app/pdv/tarefas`

| # | Conteúdo | Exemplo |
|---|---|---|
| 1 | Data do relatório | 11/08/2026 |
| 2 | Tarefas concluídas | 18 |
| 3 | Total de tarefas | 21 |
| 4 | Percentual | 86% |
| 5 | Pendentes | 3 |

> **Muda o comportamento:** hoje o relatório sai em 4 a 5 mensagens (cabeçalho,
> uma por turno, rodapé). Na Cloud API cada uma seria um template cobrado, e
> mandar template **não** abre janela de texto livre — a janela só abre quando o
> destinatário responde. Por isso o relatório colapsa em uma mensagem só, com o
> detalhe por turno na tela.

---

## 4. Código de verificação (2FA)

- **Nome:** `codigo_verificacao`
- **Categoria:** AUTHENTICATION
- **Idioma:** pt_BR

Na categoria AUTHENTICATION a Meta **impõe** o corpo. No formulário você marca
as opções, não escreve o texto:

- Corpo: `{{1}} é seu código de verificação.`
- Marcar: *Add security recommendation* → acrescenta "Por segurança, não compartilhe este código."
- Marcar: *Code expiration minutes* = `10` → acrescenta "Este código expira em 10 minutos."
- Botão: `Copy code` (recomendado)

| # | Conteúdo | Exemplo |
|---|---|---|
| 1 | Código de 6 dígitos | 483920 |

> O texto atual (cadeado, "Velara - Sua plataforma financeira", "não
> compartilhe com ninguém") **desaparece**. Não há como preservar.
>
> **Não migre o 2FA junto com o resto.** Se este template for reprovado ou
> pausado pela Meta, ninguém entra no sistema. Só depois de aprovado e testado,
> e com o fallback por e-mail funcionando.

---

## Depois da aprovação

O envio por template não é o mesmo que o de texto: muda o corpo da requisição
(`type: "template"` com `components`), e é preciso guardar o nome, o idioma e o
status de cada template para não tentar enviar um que foi pausado. A tabela
`whatsapp_templates` do plano existe para isso.

Ordem sugerida de submissão: **relatório de tarefas primeiro** (destinatário é o
próprio gestor, 1 por dia, risco baixo se algo der errado), depois cotação, e o
2FA por último.
