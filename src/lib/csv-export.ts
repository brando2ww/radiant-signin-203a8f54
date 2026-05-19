// Shared CSV download helper.
// - Prepends UTF-8 BOM so Excel (BR) renders acentos corretamente.
// - Sets proper MIME with charset.
// - Appends/removes the anchor and revokes the object URL.

export function downloadCsv(filename: string, lines: string[] | string): void {
  const content = Array.isArray(lines) ? lines.join("\n") : lines;
  const blob = new Blob(["\ufeff" + content], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
