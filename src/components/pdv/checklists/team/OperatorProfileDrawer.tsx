import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { SECTOR_LABELS, type ChecklistSector } from "@/hooks/use-checklists";
import { Pencil, KeyRound, Calendar, Clock, User, Award } from "lucide-react";
import * as Icons from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useOperatorAchievements } from "@/hooks/use-operator-achievements";
import type { Database } from "@/integrations/supabase/types";

type OperatorRow = Database["public"]["Tables"]["checklist_operators"]["Row"];

const ACCESS_LABELS: Record<string, string> = {
  operador: "Operador",
  lider: "Líder",
  gestor: "Gestor",
};

const SHIFT_LABELS: Record<string, string> = {
  manha: "Manhã",
  tarde: "Tarde",
  noite: "Noite",
  variavel: "Variável",
};

function getInitials(name: string) {
  return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  operator: OperatorRow | null;
  onEdit: () => void;
}

export function OperatorProfileDrawer({ open, onOpenChange, operator, onEdit }: Props) {
  const [tab, setTab] = useState("perfil");
  const op = operator;

  const { data: executions = [] } = useQuery({
    queryKey: ["operator-executions", op?.id],
    queryFn: async () => {
      if (!op) return [];
      const { data, error } = await supabase
        .from("checklist_executions")
        .select("*, checklists(name)")
        .eq("operator_id", op.id)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data;
    },
    enabled: !!op && open,
  });

  if (!op) return null;

  const avatarColor = (op as any).avatar_color || "#6366f1";
  const hiredAt = (op as any).hired_at;
  const defaultShift = (op as any).default_shift;
  const notes = (op as any).notes;

  const completedCount = executions.filter((e) => e.status === "concluido").length;
  const totalCount = executions.length;
  const completionRate = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const STATUS_LABELS: Record<string, { label: string; className: string }> = {
    concluido: { label: "Concluído", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300" },
    em_andamento: { label: "Em andamento", className: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" },
    pendente: { label: "Pendente", className: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300" },
    atrasado: { label: "Atrasado", className: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" },
    nao_iniciado: { label: "Não iniciado", className: "bg-gray-100 text-gray-700 dark:bg-gray-900 dark:text-gray-300" },
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center gap-4">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-lg shrink-0"
              style={{ backgroundColor: avatarColor }}
            >
              {getInitials(op.name)}
            </div>
            <div>
              <SheetTitle className="text-left">{op.name}</SheetTitle>
              <SheetDescription className="text-left">{op.role} · {SECTOR_LABELS[op.sector as ChecklistSector] || op.sector}</SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <Tabs value={tab} onValueChange={setTab} className="mt-6">
          <TabsList className="w-full">
            <TabsTrigger value="perfil" className="flex-1">Perfil</TabsTrigger>
            <TabsTrigger value="desempenho" className="flex-1">Desempenho</TabsTrigger>
            <TabsTrigger value="historico" className="flex-1">Histórico</TabsTrigger>
          </TabsList>

          {/* PERFIL */}
          <TabsContent value="perfil" className="space-y-4 mt-4">
            <Button variant="outline" size="sm" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5 mr-2" /> Editar dados
            </Button>

            <div className="space-y-3">
              <InfoRow icon={<User className="h-4 w-4" />} label="Cargo" value={op.role} />
              <InfoRow icon={<KeyRound className="h-4 w-4" />} label="PIN" value={`••••`} />
              <InfoRow label="Setor" value={SECTOR_LABELS[op.sector as ChecklistSector] || op.sector} />
              <InfoRow label="Nível de acesso" value={ACCESS_LABELS[op.access_level] || op.access_level} />
              <InfoRow label="Status" value={op.is_active ? "Ativo" : "Inativo"} />
              {defaultShift && (
                <InfoRow label="Turno padrão" value={SHIFT_LABELS[defaultShift] || defaultShift} />
              )}
              {hiredAt && (
                <InfoRow icon={<Calendar className="h-4 w-4" />} label="Data de entrada" value={format(new Date(hiredAt), "dd/MM/yyyy")} />
              )}
              {op.last_access_at && (
                <InfoRow
                  icon={<Clock className="h-4 w-4" />}
                  label="Último acesso"
                  value={formatDistanceToNow(new Date(op.last_access_at), { addSuffix: true, locale: ptBR })}
                />
              )}
              {notes && (
                <div className="pt-2">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Observação interna</p>
                  <p className="text-sm bg-muted/50 rounded-md p-3">{notes}</p>
                </div>
              )}
            </div>
          </TabsContent>

          {/* DESEMPENHO */}
          <TabsContent value="desempenho" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-3">
              <Card>
                <CardContent className="py-4 px-4 text-center">
                  <p className="text-3xl font-bold text-primary">{completionRate}%</p>
                  <p className="text-xs text-muted-foreground mt-1">Taxa de conclusão</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-4 px-4 text-center">
                  <p className="text-3xl font-bold">{completedCount}</p>
                  <p className="text-xs text-muted-foreground mt-1">Checklists concluídos</p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardContent className="py-4 px-4">
                <p className="text-sm font-medium mb-3">Conquistas</p>
                <AchievementsList operatorId={op?.id || null} />
              </CardContent>
            </Card>
          </TabsContent>

          {/* HISTÓRICO */}
          <TabsContent value="historico" className="space-y-2 mt-4">
            {executions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhuma execução registrada.</p>
            ) : (
              executions.map((ex) => {
                const st = STATUS_LABELS[ex.status] || { label: ex.status, className: "" };
                return (
                  <Card key={ex.id}>
                    <CardContent className="py-3 px-4 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{(ex as any).checklists?.name || "—"}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(ex.execution_date), "dd/MM/yyyy")}
                          {ex.started_at && ` · ${format(new Date(ex.started_at), "HH:mm")}`}
                        </p>
                      </div>
                      <Badge className={`text-[10px] border-0 ${st.className}`}>{st.label}</Badge>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

function InfoRow({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      {icon && <span className="text-muted-foreground">{icon}</span>}
      <span className="text-muted-foreground min-w-[120px]">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function AchievementsList({ operatorId }: { operatorId: string | null }) {
  const { data, isLoading } = useOperatorAchievements(operatorId);

  if (isLoading) {
    return <p className="text-xs text-muted-foreground">Carregando...</p>;
  }
  if (!data || data.length === 0) {
    return <p className="text-xs text-muted-foreground">Nenhuma conquista ainda.</p>;
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {data.map((a) => {
        const Icon = (Icons as any)[a.icon] || Award;
        return (
          <div
            key={a.id}
            className="flex flex-col items-center text-center gap-1 p-3 rounded-md border bg-muted/30"
          >
            <Icon className="h-6 w-6 text-primary" />
            <p className="text-xs font-medium leading-tight">{a.name}</p>
            <p className="text-[10px] text-muted-foreground">
              {format(new Date(a.awarded_at), "dd/MM/yyyy", { locale: ptBR })}
            </p>
          </div>
        );
      })}
    </div>
  );
}
