## Trocar URL para `/pdv/venda-a-prazo`

Mudar a rota e manter compatibilidade com a URL antiga (links salvos / favoritos não quebram).

### Mudanças

1. **`src/pages/PDV.tsx`** — rota principal passa a ser `venda-a-prazo`. Adicionar `<Route path="funcionarios-consumo" element={<Navigate to="/pdv/venda-a-prazo" replace />} />` como alias de redirecionamento.

2. **`src/components/pdv/PDVHeaderNav.tsx`** — `url: "/pdv/venda-a-prazo"`.

3. **`src/hooks/use-user-role.ts`** — atualizar a entrada `"/pdv/funcionarios-consumo"` para `"/pdv/venda-a-prazo"` na lista de paths permitidos.

Nenhuma mudança em banco, hooks, RPCs ou nomes internos (tabelas continuam `pdv_authorized_employees`, etc.).
