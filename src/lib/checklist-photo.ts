/** Reduz fotos de câmera antes do upload; não guarda imagens em localStorage. */
export async function prepareChecklistPhoto(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) throw new Error("Selecione uma imagem.");
  if (file.size > 30 * 1024 * 1024) throw new Error("A foto deve ter até 30 MB.");
  const source = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1600 / Math.max(source.width, source.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(source.width * scale));
    canvas.height = Math.max(1, Math.round(source.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Não foi possível preparar a foto. Tente outra imagem.");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.78));
    if (!blob) throw new Error("Não foi possível preparar a foto. Tente novamente.");
    return blob;
  } finally { source.close(); }
}
