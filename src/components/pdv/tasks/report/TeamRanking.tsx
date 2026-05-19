import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { SECTOR_LABEL, type Sector } from "@/hooks/use-operational-report";

interface Props {
  rows: {
    operatorId: string;
    name: string;
    sector: Sector | null;
    avatarColor: string | null;
    total: number;
    onTime: number;
    score: number;
    delta: number | null;
  }[];
  onPick?: (operatorId: string) => void;
}

export function TeamRanking({ rows, onPick }: Props) {
  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Ranking da equipe</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Colaborador</TableHead>
              <TableHead>Setor</TableHead>
              <TableHead className="text-right">Tarefas</TableHead>
              <TableHead className="text-right">No prazo</TableHead>
              <TableHead className="text-right">Score</TableHead>
              <TableHead className="text-right">Variação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">
                  Nenhum colaborador com tarefas no período.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => {
              const initial = r.name.charAt(0).toUpperCase();
              return (
                <TableRow
                  key={r.operatorId}
                  className="cursor-pointer"
                  onClick={() => onPick?.(r.operatorId)}
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar className="h-7 w-7">
                        <AvatarFallback className="text-xs">{initial}</AvatarFallback>
                      </Avatar>
                      <span className="text-sm font-medium">{r.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {r.sector ? SECTOR_LABEL[r.sector] : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{r.total}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.onTime}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.score}</TableCell>
                  <TableCell className="text-right">
                    {r.delta == null ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : r.delta === 0 ? (
                      <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
                        <Minus className="h-3 w-3" />0
                      </span>
                    ) : (
                      <span className={cn("inline-flex items-center gap-0.5 text-xs", r.delta > 0 ? "text-emerald-500" : "text-destructive")}>
                        {r.delta > 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                        {Math.abs(r.delta)}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
