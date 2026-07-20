import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

/**
 * Token do QR de recebimento. Um ativo por estabelecimento — "gerar novo" revoga
 * o anterior, que é como se corta um QR impresso que vazou.
 */
export function useReceiptLink() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: link, isLoading } = useQuery({
    queryKey: ['pdv-receipt-link', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from('pdv_receipt_links')
        .select('id, token, created_at')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const rotate = useMutation({
    // password só é exigido para REGERAR. Criar o primeiro QR é livre.
    mutationFn: async (password?: string) => {
      if (!user) throw new Error('Usuário não autenticado');

      // Regerar invalida o QR que já está impresso e colado na doca: um clique
      // solto derruba o recebimento de todo mundo até alguém reimprimir. Por
      // isso pede senha de gerente, o mesmo gesto da sangria e do caixa.
      if (link) {
        const { data: team } = await supabase
          .from('establishment_users')
          .select('display_name, discount_password')
          .eq('establishment_owner_id', user.id)
          .eq('is_active', true);

        const withPassword = (team ?? []).filter((u) => (u.discount_password ?? '') !== '');
        // Sem ninguém com senha, "Senha incorreta" seria um beco sem saída: o
        // lojista ficaria tentando adivinhar uma senha que não existe.
        if (withPassword.length === 0) throw new Error('SEM_SENHA_CADASTRADA');

        const manager = withPassword.find((u) => u.discount_password === password);
        if (!manager) throw new Error('SENHA_INVALIDA');
      }

      // Revoga antes de criar: o índice único parcial (um ativo por usuário)
      // rejeitaria o insert com o antigo ainda de pé.
      const { error: revokeError } = await supabase
        .from('pdv_receipt_links')
        .update({ is_active: false, revoked_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .eq('is_active', true);
      if (revokeError) throw revokeError;

      const { data, error } = await supabase
        .from('pdv_receipt_links')
        .insert({ user_id: user.id })
        .select('id, token, created_at')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pdv-receipt-link'] });
      toast.success('Novo QR gerado. O anterior deixou de funcionar.');
    },
    onError: (e: Error) => {
      if (e.message === 'SENHA_INVALIDA') return toast.error('Senha incorreta.');
      if (e.message === 'SEM_SENHA_CADASTRADA') {
        return toast.error(
          'Nenhum operador tem senha cadastrada. Defina uma em Configurações → Equipe.',
        );
      }
      toast.error('Não foi possível gerar o QR.');
    },
  });

  const receiptUrl = link ? `${window.location.origin}/recebimento/${link.token}` : null;

  return { link, receiptUrl, isLoading, rotate };
}
