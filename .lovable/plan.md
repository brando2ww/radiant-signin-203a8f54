# Apresentação Comercial PDF — Velara Checklist & Avaliação

Apresentação **horizontal (16:9, 1920×1080)** em PDF, voltada para venda dos módulos a restaurantes. Tom comercial, visual, com seções ilustradas e linguagem de benefício (não técnica). Utilizar o logotipo da velara também nas paginas. 

## Estrutura dos 10 slides

1. **Capa** — Logo Velara, título "Operação impecável e clientes encantados", subtítulo "Módulos Checklist & Avaliação", tagline + visual hero.
2. **O problema** — Dores do restaurante: equipe sem padrão, retrabalho, falhas de higiene/abertura/fechamento, reviews negativos, clientes que somem.
3. **A solução Velara** — Duas frentes integradas: *Checklist* (padroniza a operação) + *Avaliação* (escuta o cliente e recupera detratores).
4. **Módulo Checklist — Visão geral** — O que é, para quem (abertura, fechamento, limpeza, segurança alimentar, manutenção), com mock da tela principal.
5. **Checklist — Funcionalidades**: editor de itens (texto, foto, assinatura, número), agendamentos recorrentes, execução mobile com PIN, evidências fotográficas, QR code por setor, biblioteca de templates, alertas de atraso, validade de itens, gestão de operadores.
6. **Checklist — Gestão e indicadores**: dashboard de saúde da operação, score por equipe/operador, pódio de performance, galeria de evidências, logs de acesso, relatórios de conformidade.
7. **Módulo Avaliação — Visão geral** — NPS + pesquisa pós-atendimento, link público, QR na mesa, integração com Google Reviews e iFood.
8. **Avaliação — Funcionalidades**: campanhas configuráveis, perguntas (estrelas, escolha, texto), cupons de recompensa automáticos, hub de clientes, deduplicação por telefone, relatórios por pergunta, painel de NPS, identificação de detratores.
9. **Resultados que o cliente vê** — Bloco de benefícios com números/impacto: redução de falhas operacionais, aumento de NPS, recuperação de detratores, mais reviews 5 estrelas, time mais engajado. Depoimento curto fictício/placeholder.
10. **Próximos passos / Call to action** — Como começar, planos, contato (WhatsApp, e-mail, site), QR code para agendar demonstração.

## Visual

- Paleta sóbria e comercial: fundo claro com seções escuras em capa/conclusão (estrutura "sandwich"), acento único da marca.
- Tipografia com personalidade no título + sans-serif limpa no corpo.
- Cada slide com **um elemento visual dominante**: mockup de tela, ícones em círculos coloridos, cards de estatística, ou hero image.
- Capa e slide final em fundo escuro; slides de conteúdo em fundo claro.

## Imagens das seções

Plano: capturar screenshots reais das telas (`/pdv/checklists`, `/pdv/checklists/equipe`, `/pdv/checklists/evidencias`, `/pdv/avaliacoes`, `/pdv/avaliacoes/clients`, `/pdv/avaliacoes/reports`) via browser do sandbox, com o usuário logado. Caso login não esteja disponível no preview, usar **mockups ilustrativos gerados** (frames de UI estilizados) para representar cada seção sem expor dados reais.

## Entregável

- Arquivo único `/mnt/documents/velara-checklist-avaliacao.pdf` (16:9, 10 páginas).
- Gerado via Python (`reportlab`) com imagens embutidas em alta resolução.
- QA visual obrigatório: render de cada página em JPG e revisão antes de entregar.

## Perguntas antes de gerar

1. **Imagens das telas**: posso usar **mockups ilustrativos** dos módulos (mais limpos, sem dados sensíveis) ou você prefere que eu tente capturar **screenshots reais** das telas do app? *(mockup é mais rápido e visualmente consistente; screenshot real exige credenciais de login no preview)*
2. **Contato / CTA do último slide**: qual WhatsApp, e-mail e site devo colocar? (Se não informar, uso placeholders `contato@velara.app` / site atual.)
3. **Logo Velara**: existe um arquivo de logo no projeto que eu deva usar? Se sim, qual caminho? (Caso contrário, faço lockup tipográfico "Velara".)