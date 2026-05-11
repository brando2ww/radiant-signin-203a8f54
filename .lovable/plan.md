## Página dedicada — Arte para o caixa

Nova rota `/pdv/avaliacoes/arte` com preview ao vivo, escolha de tamanho e download em PDF/PNG. A arte usa logo + nome do estabelecimento + QR Code da campanha + frase **"Sua opinião vale um agrado"**, com detalhes na cor primária do app.

## Layout da arte (1 padrão único)

```text
┌────────────────────────────┐
│        [LOGO MARCA]        │   ← logo do estabelecimento (ou placeholder com nome)
│                            │
│   Sua opinião vale         │   ← título grande, peso forte
│   um agrado                │
│                            │
│   ┌──────────────────┐     │
│   │                  │     │
│   │     QR CODE      │     │   ← QR grande, centralizado, em card branco com sombra
│   │                  │     │
│   └──────────────────┘     │
│                            │
│   Aponte a câmera          │   ← instrução curta
│   e ganhe um cupom         │
│                            │
│  ━━━━━━━━━━━━━━━━━━━━     │   ← barra fina na cor primária
│   Nome do estabelecimento  │
│   pdv.velaraia.app/...     │   ← URL curta em mono
└────────────────────────────┘
```

Cabeçalho e barra inferior usam a cor primária do app (`hsl(var(--primary))`); fundo branco para impressão econômica em qualquer impressora. Tipografia padrão do sistema, sem cores extras.

## Funcionamento

- Seletor de **campanha** (dropdown — usa `useEvaluationCampaigns`, padrão = primeira ativa).
- Tabs de **tamanho**: A4, A5, Etiqueta 10×10 cm.
- Toggle "Destaque colorido" (ON por padrão): aplica faixa superior na cor primária; OFF deixa 100% preto e branco para impressão econômica.
- Botões: **Imprimir**, **Baixar PNG**, **Baixar PDF**.
- Preview escalonado centralizado (segue o padrão de `ChecklistQrPosterDialog`).
- URL do QR: `${window.location.origin}/avaliacao/${campaignId}` (mesma já usada em `CampaignDetail`).
- Logo via `useBusinessSettings().logo_url`; fallback = nome do estabelecimento em tipografia grande.

## Acesso

- Adicionar item **"Arte para o caixa"** em `EvaluationsSubNav` (ícone `Printer` ou `QrCode`), apontando para `arte`.
- Adicionar atalho secundário no card de campanha (`CampaignDetail.tsx`) → botão "Gerar arte" que navega para `/pdv/avaliacoes/arte?campaign=<id>`.

## Arquivos

- **Novo** `src/pages/pdv/evaluations/EvaluationsArte.tsx` — página com seletor de campanha/tamanho + preview + ações (PNG/PDF/imprimir). Reaproveita `qrcode.react`, `html-to-image` e `jspdf` (já instalados).
- **Edit** `src/pages/pdv/EvaluationsLayout.tsx` — registrar `<Route path="arte" element={<EvaluationsArte />} />`.
- **Edit** `src/components/pdv/evaluations/EvaluationsSubNav.tsx` — adicionar item "Arte para o caixa".
- **Edit** `src/components/pdv/evaluations/CampaignDetail.tsx` — botão "Gerar arte" no header do card.

Sem migrações, sem novas dependências.
