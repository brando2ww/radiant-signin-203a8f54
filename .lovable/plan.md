## Objetivo

Permitir links amigáveis como `https://pdv.velaraia.app/cardapio/kotensushi` (em vez do UUID do usuário) e fazer com que, ao compartilhar o link no WhatsApp/Instagram/etc., a imagem de preview (Open Graph) seja o **logo do negócio**, e não a imagem padrão do PDV.

---

## Parte 1 — Slug amigável do cardápio

### Banco de dados (migration)
1. Adicionar coluna `slug TEXT UNIQUE` em `business_settings`.
2. Criar índice único `lower(slug)` para garantir unicidade case-insensitive.
3. Validar com trigger: apenas `[a-z0-9-]`, 3 a 40 caracteres, não pode começar/terminar com `-`.
4. Backfill: gerar slug inicial a partir de `business_name` (slugify) para registros existentes que tiverem nome; conflitos recebem sufixo numérico.
5. Política RLS: leitura pública do par (`slug`, `user_id`, `logo_url`, `business_name`, `business_description`, `cover_url`) para resolver o slug sem login (já existe leitura pública parcial — verificar e ajustar).

### Frontend — cadastro do slug
- Em `src/pages/pdv/...` (tela de personalização do delivery — rota atual `/pdv/delivery/personalizacao`): adicionar campo "Link personalizado do cardápio" mostrando o preview `pdv.velaraia.app/cardapio/<slug>`, com validação em tempo real (disponibilidade + formato) e botão "sugerir a partir do nome".
- Atualizar `PublicMenuLink.tsx` e `AppInstallGuide.tsx` para usar o slug quando existir, caindo de volta para `user.id` se não houver slug.

### Frontend — rota pública
- `src/App.tsx`: manter `/cardapio/:userId` e adicionar resolução por slug no próprio `PublicMenu.tsx`:
  - Se o parâmetro **não** for UUID, tratar como slug, consultar `business_settings` para obter o `user_id` correspondente; se não achar, mostrar 404.
  - Se for UUID, comportamento atual (compatibilidade com links já compartilhados).
- O mesmo aplicar nas rotas `/cardapio/:userId/instalar-app` (se existir).

---

## Parte 2 — Imagem de preview (Open Graph) com o logo do negócio

### Contexto técnico
O app é uma SPA: as meta tags em `index.html` são estáticas. Crawlers de WhatsApp/Facebook/Twitter **não executam JavaScript**, então alterar `<meta property="og:image">` em runtime via React não muda o preview. Para servir imagem dinâmica por estabelecimento precisamos interceptar requisições de bots no servidor.

### Solução
Criar Edge Function pública `og-cardapio` que:
1. Recebe `?slug=...` ou `?userId=...`.
2. Busca `logo_url`, `business_name`, `business_description` em `business_settings`.
3. Retorna um HTML mínimo com as meta tags Open Graph/Twitter apontando para o `logo_url` real do negócio, mais um `<meta http-equiv="refresh">` redirecionando navegadores reais para `/cardapio/<slug>`.

Roteamento para bots:
- Como o hosting da Lovable não permite reescritas server-side condicionais por User-Agent, a abordagem prática é: **gerar o link compartilhável apontando direto para a Edge Function pública**, ex.:
  `https://frbziqazwhymwsrtneoy.supabase.co/functions/v1/og-cardapio?slug=kotensushi`
  e essa função redireciona usuários reais para `https://pdv.velaraia.app/cardapio/kotensushi` enquanto serve OG tags ricas para crawlers.
- Em `PublicMenuLink.tsx`, mostrar dois links: o "link curto" (apontando para a edge function, ideal para WhatsApp/redes) e o "link direto" (rota `/cardapio/<slug>`). Por padrão, botões "copiar" e QR Code usarão o link curto, garantindo preview correto.

### Fallback estático
Atualizar `index.html` para usar uma imagem genérica do Velara (não a screenshot do login) como `og:image` padrão, melhorando o preview mesmo quando o slug não é resolvido.

---

## Resumo das mudanças

- **Migration**: coluna `slug` + índice + trigger de validação + backfill.
- **`business_settings` UI**: campo de slug com validação de disponibilidade.
- **`PublicMenu.tsx`**: resolver `:userId` como UUID ou slug.
- **`PublicMenuLink.tsx` / `AppInstallGuide.tsx` / `TaskQRCodeDialog.tsx`** (verificar): usar slug quando disponível.
- **Edge Function `og-cardapio`**: gera HTML com OG tags do logo do negócio e redireciona browsers para o cardápio.
- **`index.html`**: substituir `og:image` padrão por imagem genérica de marca.

## Ponto de decisão

O link compartilhável padrão será `https://pdv.velaraia.app/cardapio/<slug>` (curto e bonito, mas com OG tags **estáticas** — preview genérico do Velara), **ou** `https://<edge-function>?slug=<slug>` (URL menos bonita, mas com **logo do negócio** no preview)?

Se quiser o melhor dos dois mundos (URL curta + preview com logo), o caminho é configurar um domínio próprio com regra de reescrita por User-Agent — fora do escopo do hosting atual da Lovable.
