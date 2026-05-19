import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, ReferenceLine, CartesianGrid } from "recharts";

interface Props {
  data: { date: string; label: string; rate: number | null; previous: number | null }[];
  target: number;
}

export function EvolutionChart({ data, target }: Props) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Evolução da taxa de conclusão</CardTitle>
      </CardHeader>
      <CardContent className="h-72 pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="label" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
            <YAxis domain={[0, 100]} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
            <Tooltip
              contentStyle={{
                background: "hsl(var(--popover))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 6,
                fontSize: 12,
              }}
              formatter={(v: any, name: string) => [v == null ? "—" : `${v}%`, name]}
            />
            <ReferenceLine y={target} stroke="hsl(var(--primary))" strokeDasharray="0" label={{ value: `Meta ${target}%`, fill: "hsl(var(--muted-foreground))", fontSize: 11, position: "insideTopRight" }} />
            <Line type="monotone" dataKey="previous" name="Período anterior" stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" dot={false} />
            <Line type="monotone" dataKey="rate" name="Conclusão" stroke="hsl(var(--foreground))" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
