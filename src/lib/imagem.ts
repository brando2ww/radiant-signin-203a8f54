/**
 * Imagem no tamanho em que aparece na tela (20/10/2026). As fotos do armazenamento do Velara saem pelo serviço de
 * redimensionamento do Supabase (imgproxy), em WebP e na largura pedida, em vez do arquivo original: havia foto de
 * 13 MB num cartão de 100 px (12 MB viram 16 KB a 400 px e 57 KB a 900 px, sem perda visível).
 * A largura pedida deve ser ~2x a largura exibida, para ficar nítida em tela de celular.
 * Endereço de fora (blob:, data:, outros sites) volta igual; Unsplash ganha a largura pelo próprio parâmetro.
 */
export function imagemNoTamanho(url: string | null | undefined, largura: number, qualidade = 75): string | undefined {
  if (!url) return undefined;
  const supabase = url.match(/^(https?:\/\/[^/]+)\/storage\/v1\/object\/public\/([^?#]+)/);
  if (supabase) {
    const caminho = supabase[2];
    // SVG e GIF não passam pelo redimensionamento
    if (/\.(svg|gif)$/i.test(caminho)) return url;
    return `${supabase[1]}/storage/v1/render/image/public/${caminho}?width=${Math.round(largura)}&quality=${qualidade}`;
  }
  if (/^https:\/\/images\.unsplash\.com\//.test(url)) {
    try {
      const u = new URL(url);
      u.searchParams.set("w", String(Math.round(largura)));
      u.searchParams.set("q", String(qualidade));
      u.searchParams.set("auto", "format");
      return u.toString();
    } catch {
      return url;
    }
  }
  return url;
}
