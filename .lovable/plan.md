## Ajuste no Print Bridge — tamanho da MESA

No cupom de teste o nome da mesa saiu enorme (8x). Vou reduzir pela metade, mantendo a hierarquia visual: MESA continua maior que a comanda, mas sem ocupar a folha toda.

### Alteração

**Arquivo:** `print-bridge/server.js` (função `buildReceipt`)

Trocar o byte de tamanho da MESA:
- Antes: `push(GS, 0x21, 0x77)` → 8x largura × 8x altura (gigante)
- Depois: `push(GS, 0x21, 0x33)` → 4x largura × 4x altura (metade)

Hierarquia final do cupom:
- Estabelecimento (KOTENGARIBALDI): 2x (`0x11`)
- **MESA: 4x (`0x33`)** ← alterado
- Comanda (nome): 2x (`0x11`)
- Itens: 1x destaque (`0x01`)

### Próximo passo no caixa

Como o `server.js` roda via pm2, depois que eu salvar a alteração você precisa baixar o arquivo atualizado para o computador do caixa e rodar:

```
pm2 restart velara-print-bridge
pm2 logs velara-print-bridge
```

Aí faz um novo teste de impressão para validar o novo tamanho.
