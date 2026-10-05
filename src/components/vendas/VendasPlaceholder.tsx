export function VendasPlaceholder({ title }: { title: string }) {
  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">Em construção.</p>
    </div>
  );
}
