Tornar todos os cards do Dashboard de Avaliações clicáveis, navegando para a página correspondente, com cursor pointer e hover sutil.

## Mapeamento de cliques

- NPS Global → `/pdv/avaliacoes/relatorios/por-pergunta?tipo=nps`
- Média Geral → `/pdv/avaliacoes/relatorios/por-pergunta`
- Campanhas Ativas → `/pdv/avaliacoes/campanhas`
- Aniversariantes do Mês → `/pdv/avaliacoes/clientes/aniversariantes`
- Promotores → `/pdv/avaliacoes/relatorios/por-pergunta?nps=promoters`
- Neutros → `/pdv/avaliacoes/relatorios/por-pergunta?nps=neutrals`
- Detratores → `/pdv/avaliacoes/relatorios/por-pergunta?nps=detractors`
- Total de Respostas → `/pdv/avaliacoes/relatorios/por-pergunta`
- Cadastros (únicos) → `/pdv/avaliacoes/clientes/gestao`
- Cupons Gerados → `/pdv/avaliacoes/cupons/gestao`
- Cupons Utilizados → `/pdv/avaliacoes/cupons/validacao`

Observação: o módulo não tem uma página dedicada de "Respostas". O destino mais próximo com listagem por resposta filtrável é "Por Pergunta", então ele recebe os cliques de Promotores/Neutros/Detratores e Total de Respostas via querystring. Os filtros via URL serão lidos pela página alvo em uma etapa futura, se necessário; por ora, o Dashboard apenas envia o parâmetro.

## Comportamento visual

- Cursor `pointer` em todos os cards.
- Hover: `hover:shadow-md` + `hover:border-foreground/20` com `transition-all`. Sem alteração de cor de fundo nem de texto, mantendo o padrão neutro do sistema.
- Card inteiro clicável (envolver `<Card>` em `<button>` ou usar `onClick` no próprio Card, mantendo acessibilidade com `role="button"` e `tabIndex={0}`).
- Acessibilidade: tecla Enter/Espaço também ativa a navegação.

## Implementação técnica

- `DashboardKPICards.tsx`:
  - Adicionar `useNavigate` do react-router-dom.
  - Criar um wrapper `ClickableCard` interno que recebe `to` e renderiza `<Card>` com `onClick`, `cursor-pointer`, `hover:shadow-md hover:border-foreground/20 transition-all`, `role="button"`, `tabIndex={0}` e handler de teclado.
  - Aplicar a todos os 11 cards com seus respectivos destinos.
  - Remover a prop `onNpsClick` (não será mais usada para abrir dialog) — manter o componente `NPSDetailDialog` no Dashboard apenas se ainda houver outro gatilho; caso contrário, remover seu uso e o estado `npsFilter` em `EvaluationsDashboard.tsx`.

- `EvaluationsDashboard.tsx`:
  - Remover `npsFilter`, `setNpsFilter`, render de `NPSDetailDialog` e a prop `onNpsClick`.

Sem mudanças de cor, mantendo a paleta neutra do sistema.