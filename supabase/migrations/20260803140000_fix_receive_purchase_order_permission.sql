-- Recebimento de pedido de compra pelo painel estava quebrado com
-- "permission denied for function pdv_receive_purchase_order_core".
--
-- A migration 20260716130000 quebrou o núcleo em duas funções: o _core, que é
-- security definer e valida a posse do pedido na unha, e este wrapper, que só
-- resolve o auth.uid() e delega. O EXECUTE do _core foi revogado de
-- authenticated de propósito, para ninguém chamá-lo direto passando um
-- p_user_id arbitrário.
--
-- Só que o wrapper ficou security INVOKER: ele executa com o papel do usuário
-- logado, que é exatamente o papel sem permissão no _core. Resultado: todo
-- recebimento pelo painel falhava. O canal público (QR) não passa por aqui,
-- roda via service_role na edge purchase-order-receipt, e por isso continuava
-- funcionando, mascarando o problema.
--
-- Torná-lo security definer é o que a divisão pressupunha: o wrapper passa a
-- executar como dono e o _core segue inacessível diretamente pelo cliente. A
-- identidade continua vindo de auth.uid(), que lê o JWT e não depende do papel.
alter function public.pdv_receive_purchase_order(uuid, jsonb) security definer;

-- search_path fixo é obrigatório em security definer: sem isso, um schema
-- malicioso no search_path do chamador poderia sequestrar as referências.
alter function public.pdv_receive_purchase_order(uuid, jsonb) set search_path = public;
