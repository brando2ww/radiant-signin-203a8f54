## Diagnóstico

Verifiquei que:

1. O slug `kotensushibargaribaldi` existe em `business_settings` com `logo_url` válido (Koten Sushi Bar).
2. A Edge Function `og-cardapio` **não está respondendo** quando chamada diretamente (retorna 404 — provavelmente nunca foi efetivamente deployada após a criação anterior).
3. Mesmo se estivesse deployada, o código atual tem um problema sutil: usa `<meta http-equiv="refresh" content="0; url=...">` **dentro do mesmo HTML que serve as OG tags**. O WhatsApp/Facebook **segue redirects** ao raspar Open Graph, então acabaria chegando no SPA `/cardapio/<slug>` (que é o `index.html` com o OG fallback da Velara) e usaria aquele preview, não o do restaurante.

É exatamente o sintoma reportado: o link abre, mas o preview no WhatsApp mostra "Velara | PDV & Compras" com logo da Velara.

## O que vou fazer

### 1. Reescrever `supabase/functions/og-cardapio/index.ts`

- Continuar usando `SUPABASE_SERVICE_ROLE_KEY` (bypassa RLS, query garantida).
- Buscar `business_settings` por `lower(slug) = lower($1)` (case-insensitive, igual à RPC `resolve_business_slug` já existente).
- Detectar se o requisitante é um **bot/scraper** via `User-Agent` (WhatsApp, facebookexternalhit, Twitterbot, Telegram, LinkedInBot, Slackbot, Discordbot, etc.).
  - **Bots:** retornam HTML com OG tags do restaurante e **sem redirect** — só meta tags, título e um `<a>` para o cardápio. Sem `meta refresh`, sem `window.location.replace`. Isso garante que o scraper fique nesta página e leia o OG correto.
  - **Humanos:** retornam HTTP `302` direto para `https://pdv.velaraia.app/cardapio/<slug>`. Mais rápido e sem flicker.
- Quando o slug não existir, ainda retornar fallback genérico Velara (com 200 + OG genérico) para bots, ou 302 para a home para humanos.
- Definir `og:image:width` / `og:image:height` (400x400) e `og:type=website`, `twitter:card=summary`.
- Cache curto (`max-age=300`) só para bots.

### 2. Garantir o deploy

O harness redeploya automaticamente as Edge Functions ao salvar. Após salvar, vou:
- Chamar `supabase--curl_edge_functions` com `User-Agent: facebookexternalhit/1.1` e validar que o HTML contém `og:title = "Koten Sushi Bar"` e `og:image` apontando para o logo do restaurante.
- Chamar sem User-Agent de bot e validar que recebe `302` para `/cardapio/kotensushibargaribaldi`.

### 3. Observação sobre cache do WhatsApp

Após o deploy, o WhatsApp pode continuar mostrando o preview antigo por algumas horas/dias por causa do cache interno deles. Vou orientar o usuário a:
- Testar com um link novo (ex.: adicionar `?v=2` ao final) para forçar nova raspagem; ou
- Usar o [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/) colando a URL `…/og-cardapio?slug=kotensushibargaribaldi` e clicando em **"Scrape Again"**.

## Arquivos afetados

- `supabase/functions/og-cardapio/index.ts` (reescrito)

Nada mais precisa mudar — o link compartilhável em `PublicMenuLink.tsx` e `public-menu-link.ts` já aponta corretamente para a Edge Function com `?slug=...`.