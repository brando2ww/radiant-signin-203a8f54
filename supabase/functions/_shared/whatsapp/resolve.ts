/**
 * Descobre por onde a mensagem sai.
 *
 * Antes, cada função repetia a busca da conexão com regras ligeiramente
 * diferentes e ordenava por `updated_at desc` — o que faria a conexão mais
 * recente decidir por um tenant que tenha duas (o caso "oficial para cotação,
 * QR para o dia a dia" que a API da Meta vai criar). Aqui a ordem é
 * determinística e o fallback para o dono do estabelecimento vale para todos.
 */
import type { Channel, ChannelError } from "./types.ts";
import { evolutionEnv } from "./evolution.ts";
import { sellGridEnv } from "./sellgrid.ts";

const notConfigured = (): ChannelError => ({
  error: {
    ok: false,
    status: "failed",
    errorCode: "evolution_not_configured",
    errorMessage: "WhatsApp não está configurado no servidor. Solicite ativação ao suporte.",
  },
});

const noConnection = (): ChannelError => ({
  error: {
    ok: false,
    status: "failed",
    errorCode: "no_connection",
    errorMessage: "Nenhuma conexão de WhatsApp ativa. Conecte em Integrações → WhatsApp.",
  },
});

/** Resolve o dono do estabelecimento a partir de qualquer usuário dele. */
async function resolveOwner(service: any, userId: string): Promise<string> {
  const { data } = await service.rpc("pdv_resolve_owner", { _user_id: userId });
  return (data as string) || userId;
}

export async function resolveTenantChannel(
  service: any,
  userId: string,
): Promise<Channel | ChannelError> {
  const env = evolutionEnv();
  const ownerId = await resolveOwner(service, userId);

  const { data: conn } = await service
    .from("whatsapp_connections")
    .select("id, instance_name, provider")
    .eq("user_id", ownerId)
    .eq("connection_status", "open")
    // Determinístico: quando houver mais de uma, a marcada como padrão manda.
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!conn) return noConnection();

  // SellGrid: canal da plataforma. Não há instância por cliente — a conexão só
  // registra que este estabelecimento optou por enviar pelo número da Velara.
  if (conn.provider === "sellgrid") {
    if (!sellGridEnv()) {
      return {
        error: {
          ok: false,
          status: "failed",
          errorCode: "sellgrid_not_configured",
          errorMessage: "Envio pelo número da Velara não está configurado no servidor.",
        },
      };
    }
    return { provider: "sellgrid", ownerId, connectionId: conn.id };
  }

  if (!env) return notConfigured();

  return {
    provider: "evolution",
    ownerId,
    connectionId: conn.id,
    instanceName: conn.instance_name,
    evolutionUrl: env.url,
    evolutionKey: env.key,
  };
}

/**
 * Canal da plataforma (2FA e verificação de número). Sai de um número da
 * Velara, não do estabelecimento — por isso não passa por whatsapp_connections.
 */
export function resolveGlobalChannel(): Channel | ChannelError {
  const env = evolutionEnv();
  const instanceName = Deno.env.get("EVOLUTION_INSTANCE_NAME");
  if (!env || !instanceName) return notConfigured();

  return {
    provider: "evolution",
    ownerId: null,
    connectionId: null,
    instanceName,
    evolutionUrl: env.url,
    evolutionKey: env.key,
  };
}
