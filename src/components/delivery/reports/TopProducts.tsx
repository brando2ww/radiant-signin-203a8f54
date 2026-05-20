import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { TopProduct } from "@/hooks/use-delivery-reports";
import { TrendingUp } from "lucide-react";
import { formatBRL } from "@/lib/format";
import { ProductSalesDrawer } from "./ProductSalesDrawer";

interface TopProductsProps {
  products: TopProduct[];
  userId: string;
  startDate: Date;
  endDate: Date;
}

export const TopProducts = ({ products, userId, startDate, endDate }: TopProductsProps) => {
  const [category, setCategory] = useState<string>("all");
  const [selected, setSelected] = useState<TopProduct | null>(null);

  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => p.category && set.add(p.category));
    return Array.from(set).sort();
  }, [products]);

  const filtered = useMemo(
    () => (category === "all" ? products : products.filter((p) => p.category === category)),
    [products, category]
  );

  const maxQty = filtered.reduce((m, p) => Math.max(m, p.quantity), 0);

  return (
    <Card id="top-products">
      <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Produtos Mais Vendidos
        </CardTitle>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Filtrar por categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as categorias</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        {filtered.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            Nenhum produto vendido no período
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]">#</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead className="w-[260px]">Quantidade</TableHead>
                <TableHead className="text-right">Receita</TableHead>
                <TableHead className="text-right w-[110px]">% Receita</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((product, index) => {
                const ratio = maxQty > 0 ? (product.quantity / maxQty) * 100 : 0;
                return (
                  <TableRow
                    key={product.productId}
                    className="cursor-pointer hover:bg-muted/40"
                    onClick={() => setSelected(product)}
                  >
                    <TableCell className="font-medium text-muted-foreground">{index + 1}</TableCell>
                    <TableCell className="font-medium">{product.productName}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {product.category ?? "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Progress value={ratio} className="h-2 flex-1" />
                        <span className="text-sm tabular-nums w-10 text-right">
                          {product.quantity}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatBRL(product.revenue)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {product.revenueShare.toFixed(1)}%
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <ProductSalesDrawer
        product={selected}
        userId={userId}
        startDate={startDate}
        endDate={endDate}
        onClose={() => setSelected(null)}
      />
    </Card>
  );
};
