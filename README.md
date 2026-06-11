# Velara PDV

Aplicação web full stack para gestão de pedidos, ponto de venda (PDV) e operações de delivery. Desenvolvida com foco em performance, organização de código e manutenibilidade.

## Stack

- **Frontend:** React 18 + TypeScript + Vite
- **UI:** shadcn/ui + Tailwind CSS + Radix UI
- **Backend/BaaS:** Supabase (PostgreSQL, Auth, Storage, Edge Functions)
- **State management:** TanStack Query
- **Forms:** React Hook Form + Zod

## Pré-requisitos

- Node.js 18+ e npm

## Setup local

```sh
# Instalar dependências
npm install

# Iniciar servidor de desenvolvimento
npm run dev
```

O servidor sobe em `http://localhost:8080`.

## Build de produção

```sh
npm run build
```

Os artefatos ficam em `dist/`.

## Estrutura principal

```
src/
  components/    # Componentes reutilizáveis
  pages/         # Rotas da aplicação
  hooks/         # Custom hooks
  integrations/  # Clientes de serviços externos (Supabase)
supabase/
  functions/     # Edge Functions (Deno)
  migrations/    # Migrações SQL
```

## Variáveis de ambiente

Crie um arquivo `.env.local` na raiz com:

```env
VITE_SUPABASE_URL=<sua-url-supabase>
VITE_SUPABASE_ANON_KEY=<sua-chave-anon>
```
