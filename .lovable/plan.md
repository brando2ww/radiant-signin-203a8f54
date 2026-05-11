## Problemas

1. **Preview cortando** — o pôster usa `width/height` fixos (ex.: A5 = 559×794) com `transform: scale(0.7/0.95)`. O `transform` apenas escala visualmente, mas a caixa de layout continua nas dimensões originais, então a coluna direita estoura, o `overflow-hidden` corta e o "10×10" e "A5" parecem quebrados.
2. **URL do rodapé enorme** — em A5 e Etiqueta 10×10, a URL pública (`...lovableproject.com/avaliacao/<uuid>`) quebra em 3 linhas e estoura o layout. O QR já carrega esse link, então a URL textual no rodapé não é essencial em formatos pequenos.
3. **Densidade de conteúdo no 10×10** — manter título grande + instrução + rodapé em uma etiqueta quadrada deixa tudo apertado. Esse formato pede uma versão "compacta".

## Correções

### 1. Wrapper escalonado
Envolver o `posterRef` num contêiner cujo `width/height` = dimensões originais × `scale`, para o navegador reservar exatamente o espaço pós-transform. Padrão:

```tsx
<div style={{ width: dim.w * dim.scale, height: dim.h * dim.scale }}>
  <div ref={posterRef} style={{ width: dim.w, height: dim.h, transform: `scale(${dim.scale})`, transformOrigin: "top left" }}>
    ...
  </div>
</div>
```

### 2. Rodapé enxuto
- Substituir a URL completa por apenas o domínio (`shortUrl.split("/")[0]`) em todos os tamanhos.
- Em Etiqueta 10×10, ocultar a linha do domínio (manter só nome do estabelecimento, opcional).

### 3. Layout específico do 10×10
- Reduzir título para 1 linha: "Avalie e ganhe um cupom" (mais curta) **ou** manter "Sua opinião vale um agrado" em fonte menor.
- QR maior proporcionalmente (ocupar ~65% da área).
- Remover instrução secundária ("Avalie e ganhe um cupom na hora") nesse tamanho — fica apenas "Aponte a câmera".
- Reduzir paddings e gaps verticais para garantir que tudo cabe.

### 4. PDF
Manter geração atual (`addImage(... 0, 0, pageW, pageH)`) — já respeita o `pdfFormat` por tamanho. Apenas garantir que o `posterRef` capturado mantém a proporção exata do papel (relação `w:h` já bate: A4 794:1123 ≈ 210:297; A5 559:794 ≈ 148:210; label 378:378 = 1:1).

## Arquivo

- **Edit** `src/pages/pdv/evaluations/EvaluationsArte.tsx` — wrapper escalonado, rodapé encurtado, layout condicional para tamanho `label`.

Sem mudanças em outros arquivos. Sem migrações.
