# Novo fluxo de identificação do cliente (cardápio público)

Substitui o atual `CustomerIdentification` (só telefone) por um fluxo de Login com três caminhos, espelhando o Bitbar, e cria autenticação dedicada de clientes (separada do usuário do PDV) para suportar fidelidade, histórico de pedidos e área "Minha conta".

## 1. Banco de dados (migração única)

Estender `delivery_customers` e amarrar a auth de cliente:

- Adicionar coluna `auth_user_id uuid` (nullable, UNIQUE) em `public.delivery_customers` — referência lógica a `auth.users.id` (sem FK).
- Adicionar `document_type text` (default `'CPF'`) e índice em `email` e `auth_user_id`.
- Trigger `handle_new_customer_user`: ao criar usuário em `auth.users` com `raw_user_meta_data.role = 'delivery_customer'`, faz upsert em `delivery_customers` (matching por telefone ou e-mail) e grava `auth_user_id`, `name`, `cpf`, `phone`, `birth_date`, `email`.
- Política RLS adicional em `delivery_customers`:
  - `SELECT/UPDATE` quando `auth_user_id = auth.uid()` (cliente vê e edita o próprio cadastro).
  - Mantém políticas existentes do dono do restaurante.
- Política em `delivery_orders` permitindo `SELECT` quando `customer_id IN (SELECT id FROM delivery_customers WHERE auth_user_id = auth.uid())` — habilita "Meus pedidos".

## 2. Componentes novos (cardápio público)

Diretório `src/components/public-menu/checkout/`:

- `LoginChoice.tsx` — tela inicial do dialog (foto 2): título "Login", botões **Comprar sem cadastro**, **Já sou cadastrado**, link **Cadastre-se**.
- `GuestCheckoutForm.tsx` — formulário "Comprar sem cadastro" (foto 3): Nome, Telefone, Documento + Tipo (CPF/CNPJ). Faz upsert em `delivery_customers` por telefone (sem criar conta).
- `CustomerLogin.tsx` — e-mail + senha (foto 4) via `supabase.auth.signInWithPassword`. Link "Esqueci minha senha" usa `resetPasswordForEmail` apontando para `/cardapio/<slug>/reset-password`.
- `CustomerSignUp.tsx` — cadastro completo (foto 5): Nome, CPF, Telefone, Data nasc., E-mail, Senha, Repetir senha. Chama `supabase.auth.signUp` com `options.data = { role: 'delivery_customer', name, cpf, phone, birth_date }` para o trigger popular `delivery_customers`. `emailRedirectTo = window.location.origin + '/cardapio/<slug>'`.

Validação com `zod` em `src/lib/validations/customer-auth.ts` (CPF, telefone BR, e-mail, senha mín. 8).

## 3. Integração no CheckoutFlow

Substituir o passo `phone` em `src/components/public-menu/CheckoutFlow.tsx`:

```text
phone (atual) → login (novo)
   ├─ Guest    → GuestCheckoutForm → confirma cliente
   ├─ Sign-in  → CustomerLogin     → carrega delivery_customers via auth_user_id
   └─ Sign-up  → CustomerSignUp    → cria auth + delivery_customers
```

Se já há sessão de cliente (`supabase.auth.getUser()` com `role=delivery_customer`), pula o passo `login` e vai direto para `address`.

`use-public-customer.ts` passa a ler também `supabase.auth.getSession()` antes do fallback em `localStorage`.

## 4. Área "Minha conta" do cliente

Rota nova `src/pages/public-menu/CustomerAccount.tsx` exposta dentro do cardápio (`/cardapio/<slug>/minha-conta`) com abas:

- **Perfil** — editar nome, CPF, telefone, data nasc., e-mail.
- **Meus pedidos** — lista `delivery_orders` do `customer_id` (status + total).
- **Fidelidade** — pontos e histórico de `delivery_loyalty_*` (já existente) filtrados por `customer_id`.

Header do cardápio público ganha botão **Minha conta** (avatar) quando há sessão; **Entrar** quando não há, abrindo o mesmo `LoginChoice` em modal.

Rota pública `/cardapio/<slug>/reset-password` reaproveita padrão padrão Supabase (`updateUser({ password })`).

## 5. Limpeza

- `CustomerIdentification.tsx` (telefone-only) é removido.
- Tipo `CheckoutStep` troca `"phone"` por `"login"`.
- Título do passo passa a ser "Login".

## Detalhes técnicos

- Sessão do cliente usa o mesmo `supabase` client; diferenciamos pelo `user_metadata.role = 'delivery_customer'` para que o restante do app (PDV) ignore essa sessão e o cliente não consiga acessar telas autenticadas do restaurante.
- `AuthContext` continua intacto — área do cliente usa um hook próprio `use-customer-auth.ts` para evitar acoplamento.
- Trigger `handle_new_customer_user` é `SECURITY DEFINER` com `search_path = public`, faz `UPSERT` em `delivery_customers` priorizando match por `phone`, depois por `email`.
- Não há mudança nos pedidos legados — `delivery_orders.customer_id` continua sendo `delivery_customers.id`; agora opcionalmente vinculado a um `auth_user_id`.

```text
┌─────────────────────────────────────────────┐
│                   LOGIN                     │
│  [ Comprar sem cadastro ]  ── GuestForm     │
│  [ Já sou cadastrado    ]  ── SignIn        │
│   Cadastre-se              ── SignUp        │
└─────────────────────────────────────────────┘
```
