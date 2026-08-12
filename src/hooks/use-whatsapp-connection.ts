import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export type ConnectionStatus = 'disconnected' | 'connecting' | 'open';

export interface WhatsAppConnection {
  id: string;
  user_id: string;
  instance_name: string;
  connection_name: string | null;
  phone_number: string | null;
  connection_status: ConnectionStatus;
  profile_name: string | null;
  profile_picture_url: string | null;
  connected_at: string | null;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface QRCodeResponse {
  status: 'pending' | 'connected';
  qrcode?: string;
  /** Código de 8 caracteres do fluxo "vincular com número de telefone". */
  pairingCode?: string;
  profile_name?: string | null;
  profile_picture_url?: string | null;
  phone_number?: string | null;
}

export interface StatusResponse {
  status: string;
  qrcode?: string;
  /** Código de 8 caracteres do fluxo "vincular com número de telefone". */
  pairingCode?: string;
  message?: string;
  profile_name?: string | null;
  profile_picture_url?: string | null;
  phone_number?: string | null;
}

export interface GenerateQRCodeParams {
  connectionName: string;
  phoneNumber: string;
}

export function useWhatsAppConnection() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [pollError, setPollError] = useState<string | null>(null);
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentInstanceRef = useRef<string>('');
  const consecutiveErrorsRef = useRef(0);

  /**
   * O namespace de instâncias do Evolution é GLOBAL, não por estabelecimento.
   * Sem o id do usuário no nome, dois clientes que digitassem "Restaurante"
   * apontariam para a MESMA instância — e o webhook de entrada, que resolve o
   * estabelecimento pelo nome da instância, descartava a mensagem em silêncio.
   *
   * Só vale para conexões novas: renomear instância já conectada equivale a
   * recriar no Evolution, o que obrigaria o cliente a ler o QR de novo.
   */
  const generateInstanceName = (connectionName: string) => {
    if (!user) return '';
    const slug = connectionName.trim().replace(/[^\w\s-]/g, '').slice(0, 32);
    return `${slug}-${user.id.slice(0, 8)}`;
  };

  // Fetch current connection from database
  const { data: connection, isLoading } = useQuery({
    queryKey: ['whatsapp-connection', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from('whatsapp_connections')
        .select('*')
        .eq('user_id', user.id)
        .order('connection_status', { ascending: false })
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) { console.error('Error fetching connection:', error); return null; }
      return data as WhatsAppConnection | null;
    },
    enabled: !!user,
  });

  const isConnected = connection?.connection_status === 'open';

  // Generate QR Code
  const generateQRCode = useMutation({
    mutationFn: async (params: GenerateQRCodeParams) => {
      if (!user) throw new Error('User not authenticated');
      const instanceName = generateInstanceName(params.connectionName);
      currentInstanceRef.current = instanceName;
      consecutiveErrorsRef.current = 0;
      setPollError(null);

      setPairingCode(null);
      const { data, error } = await supabase.functions.invoke('whatsapp-qrcode/generate', {
        body: {
          userId: user.id,
          instanceName,
          connectionName: params.connectionName,
          phoneNumber: params.phoneNumber.replace(/\D/g, '')
        }
      });
      if (error) throw error;
      return data as QRCodeResponse;
    },
    onSuccess: (data) => {
      if (data.status === 'connected') {
        toast.success('WhatsApp já está conectado!');
        queryClient.invalidateQueries({ queryKey: ['whatsapp-connection'] });
      } else if (data.qrcode || data.pairingCode) {
        setQrCode(data.qrcode ?? null);
        setPairingCode(data.pairingCode ?? null);
        startPolling();
      }
    },
    onError: (error) => {
      console.error('Error generating QR code:', error);
      toast.error('Erro ao gerar QR Code. Tente novamente.');
    }
  });

  // Check connection status
  const checkStatus = useCallback(async () => {
    if (!user || !currentInstanceRef.current) return null;
    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-qrcode/status', {
        body: { userId: user.id, instanceName: currentInstanceRef.current }
      });
      if (error) throw error;
      consecutiveErrorsRef.current = 0;
      return data as StatusResponse;
    } catch (error) {
      consecutiveErrorsRef.current++;
      console.error('Error checking status:', error);
      if (consecutiveErrorsRef.current >= 5) {
        stopPolling();
        setPollError('Erro de comunicação. Tente gerar um novo QR Code.');
        toast.error('Falha na comunicação com o servidor.');
      }
      return null;
    }
  }, [user]);

  // Start polling
  const startPolling = useCallback(() => {
    setIsPolling(true);
    setPollError(null);
    consecutiveErrorsRef.current = 0;

    if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
    if (pollingTimeoutRef.current) clearTimeout(pollingTimeoutRef.current);

    pollingIntervalRef.current = setInterval(async () => {
      const status = await checkStatus();
      if (!status) return;

      if (status.status === 'open') {
        stopPolling();
        setQrCode(null);
        toast.success('WhatsApp conectado com sucesso!');
        queryClient.invalidateQueries({ queryKey: ['whatsapp-connection'] });
      } else if (status.status === 'pending' && (status.qrcode || status.pairingCode)) {
        // Backend sent a refreshed QR code
        setQrCode(status.qrcode ?? null);
        setPairingCode(status.pairingCode ?? null);
      } else if (status.status === 'stale' || status.status === 'disconnected') {
        stopPolling();
        setQrCode(null);
        setPollError(status.message || 'Conexão expirou. Gere um novo QR Code.');
        toast.info('QR Code expirado. Gere um novo para continuar.');
      }
    }, 3000);

    // Hard timeout after 2 minutes
    pollingTimeoutRef.current = setTimeout(() => {
      stopPolling();
      setQrCode(null);
      setPollError('Tempo esgotado. Gere um novo QR Code.');
      toast.info('QR Code expirado. Gere um novo para continuar.');
    }, 120000);
  }, [checkStatus, queryClient]);

  const stopPolling = useCallback(() => {
    setIsPolling(false);
    if (pollingIntervalRef.current) { clearInterval(pollingIntervalRef.current); pollingIntervalRef.current = null; }
    if (pollingTimeoutRef.current) { clearTimeout(pollingTimeoutRef.current); pollingTimeoutRef.current = null; }
  }, []);

  // Disconnect and delete
  const disconnect = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('User not authenticated');
      if (!connection?.instance_name) throw new Error('No connection found');
      const { data, error } = await supabase.functions.invoke('whatsapp-qrcode/delete', {
        body: { userId: user.id, instanceName: connection.instance_name }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('WhatsApp desconectado e instância removida');
      queryClient.invalidateQueries({ queryKey: ['whatsapp-connection'] });
    },
    onError: (error) => {
      console.error('Error deleting connection:', error);
      toast.error('Erro ao desconectar');
    }
  });

  useEffect(() => { return () => { stopPolling(); }; }, [stopPolling]);

  return {
    connection, isLoading, isConnected, qrCode, pairingCode, isPolling, pollError,
    isGenerating: generateQRCode.isPending,
    isDisconnecting: disconnect.isPending,
    generateQRCode: generateQRCode.mutate,
    disconnect: disconnect.mutate,
    stopPolling, setQrCode, setPollError
  };
}
