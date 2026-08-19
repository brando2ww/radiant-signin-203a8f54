-- Guarda se o documento completo da NF-e recebida já foi liberado pelo SEFAZ.
--
-- O diagnóstico contra a Focus mostrou o que travava a entrada de compra: a
-- habilitação DF-e funciona (nfes_recebidas responde 200) e a ciência é aceita,
-- mas o XML devolvido ainda é o RESUMO (<resNFe>, ~450 bytes) enquanto o SEFAZ
-- não distribui o documento completo. A Focus informa isso em `nfe_completa`.
--
-- Sem gravar esse campo, a tela não tinha como distinguir "nota pronta para dar
-- entrada" de "nota que só existe como resumo" — e o operador ficava clicando
-- em dar entrada, sendo mandado dar ciência, e voltando ao mesmo lugar.

alter table public.pdv_invoices
  add column if not exists mde_nfe_completa boolean;

comment on column public.pdv_invoices.mde_nfe_completa is
  'true = XML completo disponível na Focus, dá para dar entrada. false = só o resumo; depende do SEFAZ distribuir depois da ciência.';

create index if not exists idx_pdv_invoices_mde_pronta
  on public.pdv_invoices (user_id, mde_nfe_completa)
  where source = 'mde';
