Vou ajustar apenas `src/pages/pdv/evaluations/EvaluationsArte.tsx` para eliminar o corte real do conteúdo.

Plano:
1. Remover o `transform: scale()` do elemento que é exportado (`posterRef`) e aplicar a escala somente em um wrapper visual do preview. Assim PNG/PDF capturam o tamanho real sem corte.
2. Corrigir o container do preview para reservar exatamente a área escalada e centralizar sem esconder o rodapé.
3. Compactar proporcionalmente o conteúdo por tamanho:
   - A5 com padding menor, QR menor e rodapé dentro da folha.
   - 10×10 com layout próprio ainda mais compacto: logo menor, título menor, QR menor e rodapé mínimo.
4. Ajustar estilos de impressão para manter o tamanho da página (`A4`, `A5`, `100mm 100mm`) sem forçar `100vw/100vh`, evitando distorção/corte na impressão.

Resultado esperado: A5 e 10×10 aparecem completos no preview e também saem completos no PDF/PNG/impressão.