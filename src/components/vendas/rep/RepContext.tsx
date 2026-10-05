import { createContext, useContext } from "react";
import type { VendasRepresentante } from "@/lib/vendas/types";
import type { RepBrand } from "@/hooks/use-vendas-rep";

/**
 * Contexto do app do representante, montado pela casca (RepresentanteApp). Qualquer página dentro de /representante
 * pode usar `useRepContext()` para saber de quem é a empresa, qual representante está na tela e se é pré-visualização.
 */
export type RepContextValue = {
  /** Dono do estabelecimento (a chave da empresa, user_id nas tabelas). */
  ownerId: string;
  /** Representante cujos dados a tela mostra: o próprio, ou o escolhido pelo dono na pré-visualização. */
  rep: VendasRepresentante | null;
  /** Atalho para rep?.id. Na pré-visualização sem representante escolhido é null (dados de todos). */
  repId: string | null;
  /** Dono ou gerente vendo o app como se fosse o representante. */
  isPreview: boolean;
  previewReps: VendasRepresentante[];
  setPreviewRepId: (id: string | null) => void;
  brand: RepBrand;
};

const RepContext = createContext<RepContextValue | null>(null);

export const RepContextProvider = RepContext.Provider;

export function useRepContext(): RepContextValue {
  const ctx = useContext(RepContext);
  if (!ctx) throw new Error("useRepContext precisa estar dentro do app do representante (/representante).");
  return ctx;
}

/** Versão que não quebra fora da casca (devolve null). */
export function useRepContextOptional(): RepContextValue | null {
  return useContext(RepContext);
}
