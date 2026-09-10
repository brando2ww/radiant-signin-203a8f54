-- A trava do cliente final estava barrando a integração de marketplace.
--
-- delivery_guard_customer_confirmation() só libera a alteração quando
-- auth.uid() existe. Nas edge functions o acesso é por service_role, onde
-- auth.uid() é NULL — então TODA mudança de status vinda da plataforma
-- (confirmado, cancelado, despachado, concluído) era rejeitada com
-- "Cliente só pode confirmar recebimento".
--
-- Isso vale para o iFood e para a DeliveryMuch, e é mais uma razão de a
-- integração antiga nunca ter funcionado de ponta a ponta.
--
-- A trava existe para a política pública do cliente final, que roda como anon
-- ou como usuário autenticado que não é dono da loja. service_role não é
-- cliente final: é a própria plataforma escrevendo.
CREATE OR REPLACE FUNCTION public.delivery_guard_customer_confirmation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Integração/serviço: não é o cliente final.
  IF auth.role() = 'service_role' OR current_user IN ('postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  -- Restaurante autenticado (dono ou membro do estabelecimento).
  IF auth.uid() IS NOT NULL AND (
       NEW.user_id = auth.uid()
       OR public.is_establishment_member(NEW.user_id)
     ) THEN
    RETURN NEW;
  END IF;

  -- Cliente final: só pode confirmar o recebimento.
  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.payment_status IS DISTINCT FROM OLD.payment_status
     OR NEW.cashier_confirmed_at IS DISTINCT FROM OLD.cashier_confirmed_at
     OR NEW.payment_method IS DISTINCT FROM OLD.payment_method
     OR NEW.total IS DISTINCT FROM OLD.total
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
  THEN
    RAISE EXCEPTION 'Cliente só pode confirmar recebimento; alterações restritas';
  END IF;

  RETURN NEW;
END;
$function$;
