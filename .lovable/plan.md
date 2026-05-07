## Objetivo

Na página `/cardapio/:slug`, atualizar dinamicamente o `document.title` e o `<link rel="icon">` da aba do navegador com o nome e logo do restaurante, restaurando os valores padrão do Velara ao desmontar.

## Mudanças

### 1. `src/pages/PublicMenu.tsx`

Adicionar um `useEffect` que:

- Enquanto `resolvingHandle` for `true` → `document.title = "Carregando cardápio..."`.
- Se resolveu mas `userId` é nulo → `document.title = "Cardápio não encontrado"`.
- Quando `businessSettings` carregar (vamos passar a consumir `useBusinessSettings(userId)` diretamente em `PublicMenu`, já existe no hook `use-public-menu.ts`):
  - `document.title = businessSettings.business_name || "Cardápio"`.
  - Se `logo_url` existir, criar/atualizar `<link rel="icon">` no `<head>` apontando para `logo_url` (também atualizar `apple-touch-icon` para coerência mobile).
  - Se não houver `logo_url`, manter o favicon padrão Velara (não tocar).

Ao desmontar (cleanup do `useEffect`):

- Restaurar `document.title` para o valor original capturado no mount (provavelmente "Velara | PDV & Compras" definido em `index.html`).
- Restaurar `href` do `<link rel="icon">` para o valor original capturado no mount (favicon padrão Velara).
- Se criamos um novo `<link>` (não existia), removê-lo.

### 2. Sem alterações em `index.html`

O favicon padrão Velara já está configurado lá; o componente apenas lê o valor original do DOM no mount para poder restaurá-lo.

## Detalhes técnicos

- Capturar `originalTitle` e `originalFaviconHref` em `useRef` no primeiro render para evitar perdê-los entre re-renders.
- Usar `document.querySelector("link[rel~='icon']")` para encontrar o link existente; se não existir, criar e marcar uma flag para remoção no cleanup.
- A atualização do título/favicon roda como efeito separado dependendo de `resolvingHandle`, `userId` e `businessSettings?.business_name` / `businessSettings?.logo_url` para refletir as três fases (loading / not-found / loaded).
- Edge Function `og-cardapio` continua responsável pelo preview de compartilhamento (WhatsApp/Facebook); essa mudança só afeta a aba do navegador real do visitante.