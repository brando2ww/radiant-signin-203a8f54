Plano para corrigir o travamento no Sheet de fornecedores:

1. Centralizar o fechamento do SupplierDialog
   - Criar um handler interno único no `SupplierDialog` para fechar o Sheet.
   - Usar esse mesmo handler tanto no `Sheet onOpenChange` quanto no botão `Cancelar`.
   - Isso corrige o ponto principal: hoje o botão `Cancelar` chama a prop diretamente e pula a limpeza defensiva que estava dentro do `onOpenChange` do Sheet.

2. Limpar resíduos do Radix com segurança
   - Adicionar uma função de cleanup que rode após o fechamento e também no unmount do componente.
   - Remover resíduos comuns quando não houver outro dialog aberto: `body.style.pointerEvents`, `body.style.overflow`, `data-scroll-locked` / atributos equivalentes deixados pelo lock de scroll.
   - Remover overlays órfãos fechados, caso algum `[data-radix-dialog-overlay]` / overlay com `data-state="closed"` permaneça bloqueando cliques.

3. Ajustar o estado da página de fornecedores
   - No `Suppliers.tsx`, trocar `onOpenChange={setDialogOpen}` por um handler próprio.
   - Quando fechar, garantir `dialogOpen=false` e limpar `selectedSupplier` depois de um pequeno delay, evitando o formulário de edição ficar preso enquanto o Sheet anima o fechamento.

4. Validar o comportamento
   - Testar o fluxo: abrir menu do fornecedor → Editar → Cancelar.
   - Confirmar que a página volta a aceitar cliques sem recarregar.
   - Conferir no DOM/body que não fica `pointer-events: none`, lock de scroll residual ou overlay bloqueando a tela.