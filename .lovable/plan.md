## Mover header para dentro da coluna esquerda

O header atualmente é uma faixa full-width no topo, ocupando largura inteira. O usuário quer que ele tenha apenas a largura da coluna esquerda (Movimentações), liberando o espaço acima das colunas central (Ações) e direita (Salão) para que essas duas "subam" e quase encostem no header global do sistema.

**Arquivo:** `src/pages/pdv/Cashier.tsx` (linhas 268–277)

Reestruturar o JSX:

```tsx
return (
  <div className="w-full px-4 md:px-6 lg:px-8 py-4 h-[calc(100vh-3.5rem)] overflow-hidden flex flex-col gap-4">
    <div className="grid grid-cols-1 lg:grid-cols-[6fr_5fr_9fr] gap-4 flex-1 min-h-0">
      {/* Coluna esquerda: header + movimentações empilhados */}
      <div className="flex flex-col gap-4 min-h-0">
        <CashierHeader
          isOpen={!!activeSession}
          openedAt={activeSession?.opened_at || null}
        />
        <Card className="flex flex-col min-h-0 flex-1">
          {/* ...CardHeader + CardContent existentes... */}
        </Card>
      </div>

      {/* Sidebar de Ações (sobe até o topo) */}
      <Card className="flex flex-col min-h-0 overflow-hidden">
        ...
      </Card>

      {/* Painel Salão/Delivery (sobe até o topo) */}
      <Card className="flex flex-col min-h-0 overflow-hidden p-0">
        ...
      </Card>
    </div>

    {/* Footer permanece igual */}
    <CashierSummaryFooter ... />
    {/* ...dialogs... */}
  </div>
);
```

### Resultado

- O `CashierHeader` agora fica restrito à largura da coluna esquerda (6/20 do grid ≈ 30% da tela).
- As colunas central (Ações Rápidas) e direita (Salão/Delivery) ganham ~80px de altura extra, encostando praticamente no header global do app.
- Layout responsivo (`<lg`) continua empilhado naturalmente porque `grid-cols-1` empilha tudo verticalmente.

Nenhuma outra alteração — apenas mover o `<CashierHeader>` para dentro do primeiro filho do grid e envolver Movimentações com a wrapper flex-col.