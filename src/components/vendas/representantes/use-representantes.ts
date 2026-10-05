import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { startOfMonth } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEstablishmentId } from "@/hooks/use-establishment-id";
import { useUserModules } from "@/hooks/use-user-modules";
import { fetchAll } from "@/lib/reports/fetch-all";
import type { VendasRepresentante } from "@/lib/vendas/types";

/** Números de cada representante que aparecem na lista. */
export type RepResumo = {
  clientes: number;
  propostasAbertas: number;
  propostasValor: number;
  pedidosMes: number;
  vendasMes: number;
  comissaoPendente: number;
};

export const RESUMO_VAZIO: RepResumo = {
  clientes: 0,
  propostasAbertas: 0,
  propostasValor: 0,
  pedidosMes: 0,
  vendasMes: 0,
  comissaoPendente: 0,
};

/** Login do representante no app (linha de establishment_users). Só o dono enxerga. */
export type RepLogin = { id: string; user_id: string; is_active: boolean; email: string | null };

export type RepFormValues = {
  name: string;
  email: string;
  phone: string;
  document: string;
  region: string;
  commission_percent: number;
  max_discount_percent: number;
  notes: string;
};

const db = supabase as any;

/** Chama uma edge function e devolve a mensagem de erro do corpo (não o "non-2xx" genérico). */
async function invocar<T = any>(fn: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) {
    let msg = error.message;
    try {
      const ctx = (error as any).context;
      if (ctx && typeof ctx.json === "function") {
        const j = await ctx.json();
        msg = j?.error || j?.message || msg;
      }
    } catch {
      /* corpo não era JSON */
    }
    throw new Error(traduzirErro(msg));
  }
  if (data?.error) throw new Error(traduzirErro(String(data.error)));
  return data as T;
}

function traduzirErro(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("already") && (m.includes("registered") || m.includes("exists"))) {
    return "Este e-mail já tem cadastro no sistema. Use outro e-mail para o representante.";
  }
  if (m.includes("password") && m.includes("6")) return "A senha precisa ter pelo menos 6 caracteres.";
  if (m.includes("invalid") && m.includes("email")) return "E-mail inválido.";
  return msg;
}

const limpa = (v: string) => (v.trim() ? v.trim() : null);

function linhaDoForm(v: RepFormValues) {
  return {
    name: v.name.trim(),
    email: limpa(v.email.toLowerCase()),
    phone: limpa(v.phone),
    document: limpa(v.document),
    region: limpa(v.region),
    commission_percent: Number(v.commission_percent) || 0,
    max_discount_percent: Number(v.max_discount_percent) || 0,
    notes: limpa(v.notes),
  };
}

export function useRepresentantes() {
  const { user } = useAuth();
  const { visibleUserId: owner } = useEstablishmentId();
  const { tenantId } = useUserModules();
  const qc = useQueryClient();
  /** Só o dono cria login, troca senha e desativa o acesso (as functions de usuário exigem o dono). */
  const ehDono = !!user?.id && !!owner && user.id === owner;

  const lista = useQuery({
    queryKey: ["vendas-representantes", owner],
    enabled: !!owner,
    queryFn: async (): Promise<VendasRepresentante[]> => {
      const { data, error } = await db
        .from("vendas_representantes")
        .select("*")
        .eq("user_id", owner)
        .order("name");
      if (error) throw error;
      return (data ?? []) as VendasRepresentante[];
    },
  });

  const resumo = useQuery({
    queryKey: ["vendas-representantes-resumo", owner],
    enabled: !!owner,
    queryFn: async (): Promise<Record<string, RepResumo>> => {
      const inicioMes = startOfMonth(new Date()).toISOString();
      const [clientes, propostas, pedidos, comissoes] = await Promise.all([
        fetchAll<{ id: string; representative_id: string }>((de, ate) =>
          db.from("pdv_customers").select("id, representative_id").eq("user_id", owner)
            .not("representative_id", "is", null).order("id").range(de, ate)),
        fetchAll<{ id: string; representative_id: string | null; total: number }>((de, ate) =>
          db.from("vendas_propostas").select("id, representative_id, total").eq("user_id", owner)
            .in("status", ["draft", "sent"]).order("id").range(de, ate)),
        fetchAll<{ id: string; representative_id: string | null; total: number }>((de, ate) =>
          db.from("vendas_pedidos").select("id, representative_id, total").eq("user_id", owner)
            .neq("status", "cancelled").gte("confirmed_at", inicioMes).order("id").range(de, ate)),
        fetchAll<{ id: string; representative_id: string; amount: number }>((de, ate) =>
          db.from("vendas_comissoes").select("id, representative_id, amount").eq("user_id", owner)
            .eq("status", "pending").order("id").range(de, ate)),
      ]);
      const out: Record<string, RepResumo> = {};
      const de = (id: string | null) => {
        if (!id) return null;
        return (out[id] ??= { ...RESUMO_VAZIO });
      };
      clientes.forEach((c) => { const r = de(c.representative_id); if (r) r.clientes += 1; });
      propostas.forEach((p) => {
        const r = de(p.representative_id);
        if (r) { r.propostasAbertas += 1; r.propostasValor += Number(p.total) || 0; }
      });
      pedidos.forEach((p) => {
        const r = de(p.representative_id);
        if (r) { r.pedidosMes += 1; r.vendasMes += Number(p.total) || 0; }
      });
      comissoes.forEach((c) => { const r = de(c.representative_id); if (r) r.comissaoPendente += Number(c.amount) || 0; });
      return out;
    },
  });

  const logins = useQuery({
    queryKey: ["vendas-representantes-logins", owner],
    enabled: !!owner && ehDono,
    queryFn: async (): Promise<Record<string, RepLogin>> => {
      const { data, error } = await supabase
        .from("establishment_users")
        .select("id, user_id, is_active, email")
        .eq("establishment_owner_id", owner!);
      if (error) throw error;
      const map: Record<string, RepLogin> = {};
      (data ?? []).forEach((l: any) => { map[l.user_id] = l as RepLogin; });
      return map;
    },
  });

  const atualizarTudo = () => {
    qc.invalidateQueries({ queryKey: ["vendas-representantes"] });
    qc.invalidateQueries({ queryKey: ["vendas-representantes-resumo"] });
    qc.invalidateQueries({ queryKey: ["vendas-representantes-logins"] });
    qc.invalidateQueries({ queryKey: ["establishment-users"] });
  };

  /** Cria o login (papel representante) e devolve a linha de establishment_users. */
  const criarLogin = async (v: { name: string; email: string; phone: string; senha: string; maxDesconto: number }) => {
    const r = await invocar<{ data: { id: string; user_id: string } }>("create-establishment-user", {
      display_name: v.name.trim(),
      email: v.email.trim().toLowerCase(),
      phone: v.phone.trim() || null,
      role: "representante",
      password: v.senha,
      max_discount_percent: v.maxDesconto,
    });
    const eu = r?.data;
    if (!eu?.user_id) throw new Error("O acesso não foi criado. Tente de novo.");
    // A function não grava o tenant no vínculo; os outros fluxos resolvem pelo dono, mas com ele
    // gravado a resolução do módulo do representante é direta.
    if (tenantId) {
      await supabase.from("establishment_users").update({ tenant_id: tenantId } as any).eq("id", eu.id);
    }
    return eu;
  };

  const criar = useMutation({
    mutationFn: async ({ valores, senha }: { valores: RepFormValues; senha: string | null }) => {
      if (!owner) throw new Error("Estabelecimento não identificado.");
      let eu: { id: string; user_id: string } | null = null;
      if (senha) {
        if (!ehDono) throw new Error("Só o proprietário pode criar o acesso do representante.");
        if (!valores.email.trim()) throw new Error("Informe o e-mail: é o login do representante.");
        eu = await criarLogin({
          name: valores.name,
          email: valores.email,
          phone: valores.phone,
          senha,
          maxDesconto: Number(valores.max_discount_percent) || 0,
        });
      }
      const { data, error } = await db
        .from("vendas_representantes")
        .insert({ ...linhaDoForm(valores), user_id: owner, rep_user_id: eu?.user_id ?? null })
        .select()
        .single();
      if (error) {
        // Sem o cadastro, o login ficaria solto: desfaz.
        if (eu) await invocar("delete-establishment-user", { establishment_user_id: eu.id }).catch(() => undefined);
        throw error;
      }
      return data as VendasRepresentante;
    },
    onSuccess: atualizarTudo,
  });

  const salvar = useMutation({
    mutationFn: async ({ rep, valores }: { rep: VendasRepresentante; valores: RepFormValues }) => {
      const linha = linhaDoForm(valores);
      // O e-mail é o login: com acesso criado, ele não muda por aqui.
      if (rep.rep_user_id) linha.email = rep.email;
      const { error } = await db.from("vendas_representantes").update(linha).eq("id", rep.id);
      if (error) throw error;
      // Mantém o nome e o telefone do usuário iguais aos do representante.
      const login = rep.rep_user_id ? logins.data?.[rep.rep_user_id] : undefined;
      if (ehDono && login) {
        await invocar("update-establishment-user", {
          establishment_user_id: login.id,
          display_name: linha.name,
          phone: linha.phone ?? "",
        }).catch(() => undefined);
      }
    },
    onSuccess: atualizarTudo,
  });

  const alternarAtivo = useMutation({
    mutationFn: async ({ rep, ativo }: { rep: VendasRepresentante; ativo: boolean }) => {
      const { error } = await db.from("vendas_representantes").update({ is_active: ativo }).eq("id", rep.id);
      if (error) throw error;
      const login = rep.rep_user_id ? logins.data?.[rep.rep_user_id] : undefined;
      if (ehDono && login) {
        const { error: e2 } = await supabase.from("establishment_users").update({ is_active: ativo }).eq("id", login.id);
        if (e2) throw e2;
      }
    },
    onSuccess: atualizarTudo,
  });

  const redefinirSenha = useMutation({
    mutationFn: async ({ rep, senha }: { rep: VendasRepresentante; senha: string }) => {
      const login = rep.rep_user_id ? logins.data?.[rep.rep_user_id] : undefined;
      if (!ehDono || !login) throw new Error("Só o proprietário redefine a senha do representante.");
      await invocar("update-establishment-user", { establishment_user_id: login.id, password: senha });
    },
    onSuccess: atualizarTudo,
  });

  /** Representante cadastrado sem acesso: cria o login agora e liga ao cadastro. */
  const criarAcesso = useMutation({
    mutationFn: async ({ rep, email, senha }: { rep: VendasRepresentante; email: string; senha: string }) => {
      if (!ehDono) throw new Error("Só o proprietário pode criar o acesso do representante.");
      const eu = await criarLogin({
        name: rep.name,
        email,
        phone: rep.phone ?? "",
        senha,
        maxDesconto: Number(rep.max_discount_percent) || 0,
      });
      const { error } = await db
        .from("vendas_representantes")
        .update({ rep_user_id: eu.user_id, email: email.trim().toLowerCase() })
        .eq("id", rep.id);
      if (error) {
        await invocar("delete-establishment-user", { establishment_user_id: eu.id }).catch(() => undefined);
        throw error;
      }
    },
    onSuccess: atualizarTudo,
  });

  return {
    owner,
    ehDono,
    representantes: lista.data ?? [],
    isLoading: lista.isLoading,
    error: lista.error as Error | null,
    resumo: resumo.data ?? {},
    resumoCarregando: resumo.isLoading,
    logins: logins.data ?? {},
    criar,
    salvar,
    alternarAtivo,
    redefinirSenha,
    criarAcesso,
  };
}

/** Senha provisória legível (sem 0/O, 1/l): o dono passa ao representante, que pode trocar depois. */
export function senhaProvisoria(): string {
  const letras = "abcdefghijkmnpqrstuvwxyz";
  const numeros = "23456789";
  const pick = (s: string) => s[Math.floor(Math.random() * s.length)];
  let out = pick("ABCDEFGHJKLMNPQRSTUVWXYZ");
  for (let i = 0; i < 4; i++) out += pick(letras);
  for (let i = 0; i < 4; i++) out += pick(numeros);
  return out;
}
