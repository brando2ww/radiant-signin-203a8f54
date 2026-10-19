import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Calendar,
  MessageCircle,
  MoreVertical,
  Send,
  CheckCircle,
  Clock,
  XCircle,
  FileText,
  Trash2,
  Eye,
  PackageCheck,
  Pencil,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { QuotationRequest, usePDVQuotations } from "@/hooks/use-pdv-quotations";
import { WhatsAppSendDialog } from "./WhatsAppSendDialog";
import { QuotationResponseDialog } from "./QuotationResponseDialog";
import { QuotationComparisonDialog } from "./QuotationComparisonDialog";
import { SendOrderDialog } from "./SendOrderDialog";
import { QuotationRequestDialog } from "./QuotationRequestDialog";
import { deferMenuAction } from "@/lib/ui/defer-menu-action";

interface QuotationRequestCardProps {
  quotation: QuotationRequest;
}

const statusConfig = {
  pending: {
    label: "Pendente",
    icon: Clock,
    variant: "secondary" as const,
  },
  in_progress: {
    label: "Em Andamento",
    icon: Send,
    variant: "default" as const,
  },
  completed: {
    label: "Finalizada",
    icon: CheckCircle,
    variant: "outline" as const,
  },
  cancelled: {
    label: "Cancelada",
    icon: XCircle,
    variant: "destructive" as const,
  },
};

export function QuotationRequestCard({ quotation }: QuotationRequestCardProps) {
  const { updateStatus, deleteQuotation } = usePDVQuotations();
  const navigate = useNavigate();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [whatsappOpen, setWhatsappOpen] = useState(false);
  const [responseOpen, setResponseOpen] = useState(false);
  const [comparisonOpen, setComparisonOpen] = useState(false);
  const [orderOpen, setOrderOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  // Pedido de compra que saiu de fato. Rascunho é envio que falhou.
  const pedidosEnviados = (quotation.purchase_orders ?? []).filter(
    (po) => po.status !== "draft" && po.status !== "cancelled",
  );

  // "Finalizada" não diz se o pedido saiu: o comprador via o mesmo cartão
  // antes e depois de enviar, e clicava de novo.
  const status =
    pedidosEnviados.length > 0
      ? { label: "Pedido enviado", icon: PackageCheck, variant: "outline" as const }
      : statusConfig[quotation.status];
  const StatusIcon = status.icon;

  const totalItems = quotation.items?.length || 0;
  const totalResponses = quotation.items?.reduce(
    (sum, item) => sum + (item.responses?.length || 0),
    0
  ) || 0;

  // Get unique suppliers that have responded
  const respondedSuppliers = new Set(
    quotation.items?.flatMap(
      (item) => item.responses?.map((r) => r.supplier_id) || []
    ) || []
  );

  // Get all suppliers that should respond (from ingredient_suppliers)
  const totalExpectedSuppliers = new Set(
    quotation.items?.flatMap(
      (item) => item.responses?.map((r) => r.supplier_id) || []
    ) || []
  ).size;

  // Editar mexe nos itens e nos vínculos de fornecedor. Depois que alguém
  // respondeu, os preços recebidos estão pendurados nesses itens, então a
  // edição fica travada para não invalidar a cotação já em curso.
  const canEdit =
    totalResponses === 0 &&
    quotation.status !== "completed" &&
    quotation.status !== "cancelled";

  // Há vencedor selecionado? (habilita o envio do PEDIDO)
  const hasWinner = quotation.items?.some(
    (item) => item.responses?.some((r) => r.is_winner),
  ) ?? false;

  // Todo fornecedor vencedor já tem o pedido dele? Então não há o que enviar.
  const vencedores = new Set(
    quotation.items?.flatMap((item) =>
      (item.responses ?? []).filter((r) => r.is_winner).map((r) => r.supplier_id),
    ) ?? [],
  );
  const comPedido = new Set(pedidosEnviados.map((po) => po.supplier_id));
  const pedidoCompleto =
    hasWinner && Array.from(vencedores).every((id) => comPedido.has(id));

  const handleDelete = () => {
    deleteQuotation.mutate(quotation.id);
    setDeleteOpen(false);
  };

  return (
    <>
      <Card className="hover:shadow-md transition-shadow">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="font-semibold">{quotation.request_number}</span>
                <Badge
                  variant={status.variant}
                  className={
                    pedidosEnviados.length > 0
                      ? "whitespace-nowrap border-green-600/40 bg-green-50 text-green-700"
                      : undefined
                  }
                >
                  <StatusIcon className="h-3 w-3 mr-1" />
                  {status.label}
                </Badge>
                {respondedSuppliers.size > 0 && (
                  <Badge className="bg-primary text-primary-foreground">
                    {respondedSuppliers.size} resposta{respondedSuppliers.size > 1 ? "s" : ""}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-3 w-3" />
                {format(new Date(quotation.created_at), "dd/MM/yyyy", { locale: ptBR })}
                {quotation.deadline && (
                  <>
                    <span className="mx-1">•</span>
                    <span>Prazo: {format(new Date(quotation.deadline), "dd/MM/yyyy", { locale: ptBR })}</span>
                  </>
                )}
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {canEdit && (
                  <DropdownMenuItem onClick={() => deferMenuAction(() => setEditOpen(true))}>
                    <Pencil className="h-4 w-4 mr-2" />
                    Editar Cotação
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => deferMenuAction(() => setComparisonOpen(true))}>
                  <Eye className="h-4 w-4 mr-2" />
                  Ver Comparativo
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => deferMenuAction(() => setResponseOpen(true))}>
                  <FileText className="h-4 w-4 mr-2" />
                  Registrar Resposta
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {quotation.status === "pending" && (
                  <DropdownMenuItem
                    onClick={() =>
                      updateStatus.mutate({ id: quotation.id, status: "in_progress" })
                    }
                  >
                    <Send className="h-4 w-4 mr-2" />
                    Marcar Em Andamento
                  </DropdownMenuItem>
                )}
                {quotation.status === "in_progress" && (
                  <DropdownMenuItem
                    onClick={() =>
                      updateStatus.mutate({ id: quotation.id, status: "completed" })
                    }
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Marcar como Finalizada
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => deferMenuAction(() => setDeleteOpen(true))}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Excluir
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Items summary */}
          <div>
            <p className="text-sm text-muted-foreground mb-2">Itens:</p>
            <div className="flex flex-wrap gap-1">
              {quotation.items?.slice(0, 3).map((item) => (
                <Badge key={item.id} variant="outline" className="text-xs">
                  {item.ingredient?.name} ({item.quantity_needed} {item.unit})
                </Badge>
              ))}
              {(quotation.items?.length || 0) > 3 && (
                <Badge variant="outline" className="text-xs">
                  +{(quotation.items?.length || 0) - 3} mais
                </Badge>
              )}
            </div>
          </div>

          {pedidosEnviados.length > 0 && (
            <p className="text-sm text-green-700">
              {pedidosEnviados.length === 1 ? "Pedido " : "Pedidos "}
              {pedidosEnviados.map((po) => po.order_number).join(", ")}
              {pedidoCompleto ? "" : " · falta enviar a outros vencedores"}
            </p>
          )}

          {/* Responses info */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {respondedSuppliers.size > 0
                ? `${respondedSuppliers.size} fornecedor(es) responderam`
                : "Aguardando respostas dos fornecedores"}
            </span>
            {totalResponses > 0 && (
              <span className="text-muted-foreground">
                {totalResponses} item(ns) cotado(s)
              </span>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            {hasWinner ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => setComparisonOpen(true)}
                >
                  <Eye className="h-4 w-4 mr-2" />
                  Comparativo
                </Button>
                {pedidoCompleto ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 border-green-600/40 text-green-700 hover:bg-green-50"
                    onClick={() => navigate("/pdv/compras/pedidos")}
                  >
                    <PackageCheck className="h-4 w-4 mr-2" />
                    Ver pedidos
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => setOrderOpen(true)}
                  >
                    <PackageCheck className="h-4 w-4 mr-2" />
                    {pedidosEnviados.length > 0 ? "Enviar aos que faltam" : "Enviar Pedido"}
                  </Button>
                )}
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => setWhatsappOpen(true)}
                >
                  <MessageCircle className="h-4 w-4 mr-2" />
                  Enviar WhatsApp
                </Button>
                {totalResponses > 0 && (
                  <Button
                    variant="default"
                    size="sm"
                    className="flex-1"
                    onClick={() => setComparisonOpen(true)}
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    Ver Comparativo
                  </Button>
                )}
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Delete confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cotação?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. A cotação {quotation.request_number} será
              permanentemente excluída.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* WhatsApp Send Dialog */}
      <WhatsAppSendDialog
        open={whatsappOpen}
        onOpenChange={setWhatsappOpen}
        quotation={quotation}
      />

      {/* Response Dialog */}
      <QuotationResponseDialog
        open={responseOpen}
        onOpenChange={setResponseOpen}
        quotation={quotation}
      />

      {/* Comparison Dialog */}
      <QuotationComparisonDialog
        open={comparisonOpen}
        onOpenChange={setComparisonOpen}
        quotation={quotation}
      />

      {/* Send Order Dialog */}
      <SendOrderDialog
        open={orderOpen}
        onOpenChange={setOrderOpen}
        quotation={quotation}
      />

      {/* Edição da cotação. Só monta quando abre: o diálogo dispara a busca dos
          fornecedores vinculados, e são muitos cards nesta tela. */}
      {editOpen && (
        <QuotationRequestDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          quotation={quotation}
        />
      )}
    </>
  );
}
