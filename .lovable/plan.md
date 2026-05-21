
## Objetivo

Ao clicar em **À Prazo** no `PaymentDialog`, abrir um segundo modal dedicado (`CreditSaleAuthDialog`) que exige:
1. Selecionar o cliente cadastrado (lista atual de `pdv_authorized_employees`).
2. Digitar a **senha de operador autorizado** (mesma lógica usada hoje no fluxo de desconto).
3. Justificativa obrigatória se o lançamento estourar o limite de crédito.

Hoje o seletor de cliente aparece embutido no `PaymentDialog`. Vamos extraí-lo para um modal separado, espelhando o padrão visual/UX do passo de autorização de desconto.

## Novo componente

**`src/components/pdv/cashier/CreditSaleAuthDialog.tsx`** (modal):

- Props: `open`, `onOpenChange`, `total`, `onConfirm(payload)`, `isProcessing`.
- Conteúdo:
  - Lista de clientes (`useAuthorizedEmployees`) com busca por nome — UI igual à atual seção inline.
  - Card do cliente selecionado: saldo atual, limite, novo saldo previsto, badge "Excede limite" quando aplicável.
  - Campo **Senha do operador** (`type=password`, `inputMode=numeric`) com botão **OK** que:
    - Consulta `establishment_users` filtrando por `establishment_owner_id` e `is_active`.
    - Valida `discount_password` (mesma coluna usada no desconto — fonte única de autorização operacional).
    - Marca autorizado e mostra "Autorizado por {display_name}".
  - Campo **Justificativa** (Textarea, mín. 10 caracteres) — exibido e obrigatório somente quando `creditNewDebt > credit_limit`.
- Botões:
  - **Cancelar** → fecha sem efeito.
  - **Confirmar Venda a Prazo** (disabled até cliente + senha autorizada + justificativa quando exigida).
- Ao confirmar, dispara `onConfirm({ employee_id, justification, authorizedBy })`.

## Alterações no `PaymentDialog.tsx`

- Remover a seção inline de seleção de cliente / justificativa do método fiado (linhas ~1949-2050 da renderização atual).
- O botão **À Prazo** deixa de selecionar `selectedMethod` permanentemente: apenas abre `CreditSaleAuthDialog` (`setCreditAuthOpen(true)`).
- `handleSubmitCreditSale` é chamado a partir do `onConfirm` do novo modal, recebendo os dados do payload. Continua usando `registerCreditSale` do `use-employee-consumption` (sem mudanças no hook nem no banco).
- Limpar estados `creditEmployeeId`, `creditEmployeeSearch`, justificativa e `selectedMethod` ao fechar o modal/finalizar.
- `creditBlocks` e o ramo `selectedMethod === "fiado"` em `canSubmit` deixam de ser necessários (a confirmação ocorre dentro do segundo modal).

## Fora de escopo

- Sem mudanças no schema, RPCs ou migrações.
- Sem mudanças na lógica de baixa de fiado (continua via F5 / "Quitar Saldo").
- Sem mudanças no fluxo de Dividir Pagamento (fiado segue desabilitado quando split está ativo).

## Diagrama do fluxo

```text
PaymentDialog
   └─ clica "À Prazo"
        └─ abre CreditSaleAuthDialog
              ├─ seleciona cliente
              ├─ digita senha → valida em establishment_users.discount_password
              ├─ (se exceder limite) preenche justificativa
              └─ Confirmar → registerCreditSale() → fecha ambos os modais
```
