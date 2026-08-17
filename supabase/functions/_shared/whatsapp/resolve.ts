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

  const { data: conns } = await service
    .from("whatsapp_connections")
    .select("id, instance_name, provider")
    .eq("user_id", ownerId)
    .eq("connection_status", "open");

  const list = (conns ?? []) as Array<{ id: string; instance_name: string | null; provider: string }>;

  // O número PRÓPRIO do cliente vence sempre. Quem já conectou por QR continua
  // enviando do número dele: trocar por baixo mudaria o remetente que o
  // fornecedor conhece e faria as respostas dele pararem de chegar ao lojista.
  const evolutionConn = list.find((c) => c.provider === "evolution");
  if (evolutionConn) {
    if (!env) return notConfigured();
    return {
      provider: "evolution",
      ownerId,
      connectionId: evolutionConn.id,
      instanceName: evolutionConn.instance_name ?? undefined,
      evolutionUrl: env.url,
      evolutionKey: env.key,
    };
  }

  // Sem número próprio: o número oficial da Velara é o padrão, mesmo que o
  // estabelecimento nunca tenha configurado nada. A linha em
  // whatsapp_connections deixa de ser pré-requisito — ela só existe para
  // registrar a escolha de quem clicou.
  const sellGridConn = list.find((c) => c.provider === "sellgrid");
  if (sellGridEnv()) {
    return { provider: "sellgrid", ownerId, connectionId: sellGridConn?.id ?? null };
  }

  // Sem número próprio E sem o canal da plataforma configurado: aí sim não há
  // por onde enviar.
  return list.length > 0 ? notConfigured() : noConnection();
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
