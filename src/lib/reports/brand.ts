/**
 * Identidade Velara nos documentos exportados.
 *
 * Existia em duas cópias idênticas — purchase-reports/export.ts e
 * stock-count/export.ts — e uma terceira estava para nascer. Agora é daqui que
 * todo relatório tira logo, cor e rodapé, para o PDF de Compras e o de Clientes
 * chegarem iguais na mesa do gestor.
 */
import type jsPDF from "jspdf";
import logoVelara from "@/assets/logo_velara_preto.png";

/** Tinta da marca nos cabeçalhos de tabela. Igual à `--primary` do app. */
export const BRAND_INK: [number, number, number] = [30, 41, 59];
export const BRAND_MUTED: [number, number, number] = [244, 244, 245];

export interface LogoData {
  dataUrl: string;
  /** largura ÷ altura — fixar a altura e derivar a largura evita achatar a arte. */
  ratio: number;
}

let cache: Promise<LogoData | null> | null = null;

/**
 * jsPDF precisa dos bytes da imagem, não da URL servida pelo Vite.
 *
 * Cacheado no módulo: um relatório com várias exportações seguidas não deve
 * reler o arquivo toda vez. Falha vira `null` — relatório sem logo ainda é
 * relatório, e abortar por causa da arte seria pior.
 */
export function loadBrandLogo(): Promise<LogoData | null> {
  if (cache) return cache;
  cache = (async () => {
    try {
      const res = await fetch(logoVelara);
      const blob = await res.blob();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      const ratio = await new Promise<number>((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img.naturalHeight > 0 ? img.naturalWidth / img.naturalHeight : 1);
        img.onerror = () => resolve(1);
        img.src = dataUrl;
      });
      return { dataUrl, ratio };
    } catch {
      return null;
    }
  })();
  return cache;
}

/**
 * Rodapé em todas as páginas, escrito no fim porque só então se sabe o total.
 */
export function drawBrandFooter(doc: jsPDF, margin: number): void {
  const pages = doc.getNumberOfPages();
  const generated = new Date().toLocaleString("pt-BR");
  const w = doc.internal.pageSize.getWidth();
  const y = doc.internal.pageSize.getHeight() - 24;

  for (let p = 1; p <= pages; p += 1) {
    doc.setPage(p);
    doc.setFontSize(8);
    doc.setTextColor(130);
    doc.text(`Gerado pelo Velara em ${generated}`, margin, y);
    doc.text(`${p} de ${pages}`, w - margin, y, { align: "right" });
  }
  doc.setTextColor(0);
}

/** Nome de arquivo previsível: sem acento, sem espaço, minúsculo. */
export function slugifyFilename(...partes: (string | undefined | null)[]): string {
  return partes
    .filter(Boolean)
    .join("-")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\w-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}
