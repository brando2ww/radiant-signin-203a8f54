import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";

export function usePDVCmv(selectedMonth?: Date) {
  const { user } = useAuth();
  const refDate = selectedMonth || new Date();

  const { data, isLoading } = useQuery({
    queryKey: ["pdv-cmv", user?.id, format(refDate, "yyyy-MM")],
    queryFn: async () => {
      if (!user) throw new Error("Usuário não autenticado");

      // Get all recipes with ingredient costs
      const { data: recipes } = await supabase
        .from("pdv_product_recipes")
        .select("product_id, quantity, pdv_ingredients(id, unit_cost, name, category)");

      const recipeCostMap: Record<string, number> = {};
      const ingredientCategoryTotals: Record<string, number> = {};

      (recipes || []).forEach((r: any) => {
        const cost = Number(r.quantity) * Number(r.pdv_ingredients?.unit_cost || 0);
        recipeCostMap[r.product_id] = (recipeCostMap[r.product_id] || 0) + cost;
      });

      // Get products with prices
      const { data: products } = await supabase
        .from("pdv_products")
        .select("id, name, price_salon, price_balcao, category")
        .eq("user_id", user.id);

      const productIds = (products || []).map((p) => p.id);

      // Compositions (kits/combos) for these products — para custo recursivo
      const compositionMap: Record<string, { child_product_id: string; quantity: number }[]> = {};
      if (productIds.length) {
        const { data: comps } = await supabase
          .from("pdv_product_compositions")
          .select("parent_product_id, child_product_id, quantity")
          .in("parent_product_id", productIds);
        (comps || []).forEach((c: any) => {
          if (!compositionMap[c.parent_product_id]) compositionMap[c.parent_product_id] = [];
          compositionMap[c.parent_product_id].push({
            child_product_id: c.child_product_id,
            quantity: Number(c.quantity) || 0,
          });
        });
      }

      // Custo unitário recursivo (receita + composição), com memoização e proteção contra ciclo
      const costMemo = new Map<string, number>();
      const computeCost = (pid: string, visited: Set<string>): number => {
        if (visited.has(pid)) return 0;
        if (costMemo.has(pid)) return costMemo.get(pid)!;
        visited.add(pid);
        const recipeCost = recipeCostMap[pid] || 0;
        let compCost = 0;
        const children = compositionMap[pid] || [];
        for (const ch of children) {
          compCost += ch.quantity * computeCost(ch.child_product_id, new Set(visited));
        }
        const total = recipeCost + compCost;
        costMemo.set(pid, total);
        return total;
      };

      // Calculate per-product CMV
      const productCmvList = (products || [])
        .map((p) => {
          const cost = computeCost(p.id, new Set());
          const price = Number(p.price_salon || p.price_balcao || 0);
          const margin = price > 0 ? ((price - cost) / price) * 100 : 0;
          return { id: p.id, name: p.name, category: p.category, cost, price, margin };
        })
        .filter((p) => p.cost > 0)
        .sort((a, b) => b.margin - a.margin);


      // Current month revenue + cmv from sold items
      const ms = format(startOfMonth(refDate), "yyyy-MM-dd");
      const me = format(endOfMonth(refDate), "yyyy-MM-dd");

      const { data: pdvOrders } = await supabase
        .from("pdv_orders")
        .select("total")
        .eq("user_id", user.id)
        .eq("status", "closed")
        .gte("closed_at", ms)
        .lte("closed_at", me + "T23:59:59");

      const totalRevenue = (pdvOrders || []).reduce((s, o) => s + Number(o.total), 0);

      const { data: orderItems } = await supabase
        .from("pdv_order_items")
        .select("product_id, quantity")
        .gte("created_at", ms)
        .lte("created_at", me + "T23:59:59");

      let totalCmv = 0;
      (orderItems || []).forEach((item: any) => {
        const unitCost = computeCost(item.product_id, new Set());
        if (unitCost > 0) {
          totalCmv += unitCost * Number(item.quantity);

          // Track by ingredient category (apenas parcela de receita direta deste produto)
          const recipe = (recipes || []).filter((r: any) => r.product_id === item.product_id);
          recipe.forEach((r: any) => {
            const cat = r.pdv_ingredients?.category || "Outros";
            const rCost = Number(r.quantity) * Number(r.pdv_ingredients?.unit_cost || 0) * Number(item.quantity);
            ingredientCategoryTotals[cat] = (ingredientCategoryTotals[cat] || 0) + rCost;
          });
        }
      });


      const cmvPercent = totalRevenue > 0 ? (totalCmv / totalRevenue) * 100 : 0;
      const grossMargin = 100 - cmvPercent;

      // Evolution last 6 months
      const evolution: { month: string; cmv: number; revenue: number }[] = [];
      for (let i = 5; i >= 0; i--) {
        const m = subMonths(refDate, i);
        const mStart = format(startOfMonth(m), "yyyy-MM-dd");
        const mEnd = format(endOfMonth(m), "yyyy-MM-dd");

        const { data: mOrders } = await supabase
          .from("pdv_orders")
          .select("total")
          .eq("user_id", user.id)
          .eq("status", "closed")
          .gte("closed_at", mStart)
          .lte("closed_at", mEnd + "T23:59:59");

        const { data: mItems } = await supabase
          .from("pdv_order_items")
          .select("product_id, quantity")
          .gte("created_at", mStart)
          .lte("created_at", mEnd + "T23:59:59");

        const mRev = (mOrders || []).reduce((s, o) => s + Number(o.total), 0);
        let mCmv = 0;
        (mItems || []).forEach((item: any) => {
          const unitCost = computeCost(item.product_id, new Set());
          if (unitCost > 0) mCmv += unitCost * Number(item.quantity);
        });


        evolution.push({ month: format(m, "MMM/yy"), cmv: mCmv, revenue: mRev });
      }

      // Previous month comparison
      const prevMonth = subMonths(refDate, 1);
      const prevData = evolution.length >= 2 ? evolution[evolution.length - 2] : null;
      const prevCmvPct = prevData && prevData.revenue > 0 ? (prevData.cmv / prevData.revenue) * 100 : 0;
      const prevMargin = 100 - prevCmvPct;

      // Classification
      const classify = (margin: number) => {
        if (margin >= 70) return "otima";
        if (margin >= 50) return "boa";
        if (margin >= 30) return "regular";
        return "baixa";
      };

      const classification = { otima: 0, boa: 0, regular: 0, baixa: 0 };
      productCmvList.forEach((p) => {
        classification[classify(p.margin)]++;
      });

      const avgMargin = productCmvList.length > 0
        ? productCmvList.reduce((s, p) => s + p.margin, 0) / productCmvList.length
        : 0;
      const bestMargin = productCmvList.length > 0 ? productCmvList[0].margin : 0;
      const worstMargin = productCmvList.length > 0 ? productCmvList[productCmvList.length - 1].margin : 0;

      return {
        totalCmv,
        totalRevenue,
        cmvPercent,
        grossMargin,
        evolution,
        ingredientCategoryTotals,
        productCmvList,
        classification,
        avgMargin,
        bestMargin,
        worstMargin,
        prevCmvPct,
        prevRevenue: prevData?.revenue || 0,
        prevMargin,
        analyzedCount: productCmvList.length,
      };
    },
    enabled: !!user,
  });

  return { data, isLoading };
}
