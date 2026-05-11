Adicionar uma assinatura discreta "powered by Velara" no rodapé da arte (todos os tamanhos: A4, A5 e 10×10), usando o logo `public/logo_velara_preto.png`.

Mudança em `src/pages/pdv/evaluations/EvaluationsArte.tsx` apenas:
- No componente `PosterContent`, abaixo do nome do estabelecimento (e do domínio quando exibido), adicionar uma linha centralizada com:
  - Texto pequeno em cinza: "powered by"
  - Logo Velara (`/logo_velara_preto.png`) com altura proporcional: 10px no 10×10, 14px no A5, 18px no A4.
- Manter o uso de `crossOrigin="anonymous"` para não quebrar o export PNG/PDF (`html-to-image`).
- Não altera layout principal, QR, headline, nem a faixa colorida.