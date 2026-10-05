import { useEffect, useMemo, useState } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import RepHoje from "./Hoje";
import RepClientes from "./Clientes";
import RepClienteDetalhe from "./ClienteDetalhe";
import RepCatalogo from "./Catalogo";
import RepPropostas from "./Propostas";
import RepPropostaEditar from "./PropostaEditar";
import RepPedidos from "./Pedidos";
import RepAgenda from "./Agenda";
import RepComissoes from "./Comissoes";
import { useVendasRepSession } from "@/hooks/use-vendas-rep";
import { RepContextProvider, type RepContextValue } from "@/components/vendas/rep/RepContext";
import { RepTopBar } from "@/components/vendas/rep/RepTopBar";
import { RepBottomNav, RepMoreSheet } from "@/components/vendas/rep/RepBottomNav";
import { RepBlocked, RepLoading } from "@/components/vendas/rep/RepStatusScreens";

const PREVIEW_KEY = "velara:rep-preview";

function readPreviewChoice(): string | null | undefined {
  try {
    const v = sessionStorage.getItem(PREVIEW_KEY);
    if (v === null) return undefined;
    return v === "" ? null : v;
  } catch {
    return undefined;
  }
}

/**
 * App do representante (/representante), pensado para o celular (como o /garcom): barra do topo com a marca da
 * empresa, abas no rodapé (Hoje, Clientes, Catálogo, Propostas, Mais) e coluna da largura de um celular no computador.
 *
 * Entra: o representante (papel "representante" com cadastro ativo) e, em pré-visualização, o dono e o gerente.
 * Os demais papéis voltam para /pdv. As rotas abaixo são o contrato entre os agentes do módulo: não mudar caminhos.
 */
export default function RepresentanteApp() {
  const session = useVendasRepSession();
  const { pathname } = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const [previewChoice, setPreviewChoice] = useState<string | null | undefined>(readPreviewChoice);

  // Troca de tela no celular começa do topo.
  useEffect(() => {
    window.scrollTo(0, 0);
    setMoreOpen(false);
  }, [pathname]);

  const ctx = useMemo<RepContextValue | null>(() => {
    if (!session.ownerId) return null;
    if (session.access === "rep") {
      if (!session.myRep || !session.myRep.is_active) return null;
      return {
        ownerId: session.myRep.user_id,
        rep: session.myRep,
        repId: session.myRep.id,
        isPreview: false,
        previewReps: [],
        setPreviewRepId: () => {},
        brand: session.brand,
      };
    }
    if (session.access === "preview") {
      const reps = session.previewReps;
      // Sem escolha salva: o primeiro representante ativo (ou todos, se não houver nenhum).
      const fallback = reps.find((r) => r.is_active) ?? null;
      const chosen =
        previewChoice === undefined ? fallback : previewChoice === null ? null : reps.find((r) => r.id === previewChoice) ?? fallback;
      return {
        ownerId: session.ownerId,
        rep: chosen,
        repId: chosen?.id ?? null,
        isPreview: true,
        previewReps: reps,
        setPreviewRepId: (id) => {
          setPreviewChoice(id);
          try {
            sessionStorage.setItem(PREVIEW_KEY, id ?? "");
          } catch {
            /* prévia sem armazenamento: só não lembra a escolha */
          }
        },
        brand: session.brand,
      };
    }
    return null;
  }, [session.access, session.ownerId, session.myRep, session.previewReps, session.brand, previewChoice]);

  if (session.loading) return <RepLoading />;
  if (session.access === "denied") return <Navigate to="/pdv" replace />;
  if (session.access === "rep") {
    if (session.myRepError) return <RepBlocked reason="error" brand={session.brand} />;
    if (!session.myRep) return <RepBlocked reason="missing" brand={session.brand} />;
    if (!session.myRep.is_active) return <RepBlocked reason="inactive" brand={session.brand} />;
  }
  if (!ctx) return <RepLoading />;

  return (
    <RepContextProvider value={ctx}>
      <div className="min-h-[100dvh] bg-muted/40">
        <div data-representante-root className="relative mx-auto flex min-h-[100dvh] w-full max-w-[440px] flex-col bg-background sm:border-x sm:shadow-sm">
          <RepTopBar onOpenMenu={() => setMoreOpen(true)} />
          <main className="min-w-0 flex-1" style={{ paddingBottom: "calc(5.5rem + env(safe-area-inset-bottom))" }}>
            <Routes>
              <Route index element={<RepHoje />} />
              <Route path="clientes" element={<RepClientes />} />
              <Route path="clientes/:id" element={<RepClienteDetalhe />} />
              <Route path="catalogo" element={<RepCatalogo />} />
              <Route path="propostas" element={<RepPropostas />} />
              <Route path="propostas/nova" element={<RepPropostaEditar />} />
              <Route path="propostas/:id" element={<RepPropostaEditar />} />
              <Route path="pedidos" element={<RepPedidos />} />
              <Route path="agenda" element={<RepAgenda />} />
              <Route path="comissoes" element={<RepComissoes />} />
              <Route path="*" element={<Navigate to="/representante" replace />} />
            </Routes>
          </main>
          <RepBottomNav moreOpen={moreOpen} onOpenMore={() => setMoreOpen(true)} />
          <RepMoreSheet open={moreOpen} onOpenChange={setMoreOpen} />
        </div>
      </div>
    </RepContextProvider>
  );
}
