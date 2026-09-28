import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Copy, KeyRound, Loader2, Plus, QrCode, UserMinus } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { toast } from "sonner";
import { usePontoColaboradores, usePontoQuiosques, type PontoColaborador } from "@/hooks/use-ponto";

const CONTRATOS = [
  { valor: "clt", rotulo: "CLT" },
  { valor: "parcial", rotulo: "Tempo parcial" },
  { valor: "12x36", rotulo: "Escala 12x36" },
  { valor: "aprendiz", rotulo: "Jovem aprendiz" },
  { valor: "intermitente", rotulo: "Intermitente" },
];

const soDigitos = (v: string) => v.replace(/\D/g, "");

const formataCpf = (v: string | null) => {
  const d = soDigitos(v ?? "");
  return d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") : (v ?? "·");
};

/** Senha de quatro dígitos: é digitada no celular, em pé, com pressa. */
const senhaSugerida = () => String(Math.floor(1000 + Math.random() * 9000));

export default function PontoColaboradores() {
  const { colaboradores, isLoading, salvar, desligar, definirSenha, definirPin } = usePontoColaboradores();
  const { quiosques, criar: criarQuiosque } = usePontoQuiosques();
  const [aberto, setAberto] = useState(false);
  const [edicao, setEdicao] = useState<Partial<PontoColaborador>>({});
  const [acesso, setAcesso] = useState<{ nome: string; url: string; senha: string } | null>(null);
  const [desligando, setDesligando] = useState<PontoColaborador | null>(null);
  const [dataDesligamento, setDataDesligamento] = useState(() => new Date().toISOString().slice(0, 10));

  const ativos = useMemo(() => colaboradores.filter((c) => c.ativo), [colaboradores]);
  const inativos = useMemo(() => colaboradores.filter((c) => !c.ativo), [colaboradores]);

  const abrirNovo = () => {
    setEdicao({ nome: "", tipo_contrato: "clt", ativo: true });
    setAberto(true);
  };

  const gravar = async () => {
    if (!edicao.nome?.trim()) return;
    await salvar.mutateAsync({ ...edicao, nome: edicao.nome.trim(), cpf: soDigitos(edicao.cpf ?? "") || null } as any);
    setAberto(false);
    toast.success("Colaborador salvo");
  };

  const gerarAcesso = async (c: PontoColaborador) => {
    const senha = senhaSugerida();
    const r = await definirSenha.mutateAsync({ id: c.id, senha });
    // A mesma senha vale no tablet do salão: quem não tem celular bate por lá.
    await definirPin.mutateAsync({ id: c.id, pin: senha }).catch(() => undefined);
    setAcesso({
      nome: c.nome,
      url: `${window.location.origin}/ponto/${r.token}`,
      senha,
    });
  };

  const confirmarDesligamento = async () => {
    if (!desligando) return;
    await desligar.mutateAsync({ id: desligando.id, data: dataDesligamento });
    setDesligando(null);
    toast.success("Colaborador desligado. O histórico de ponto dele continua guardado.");
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Colaboradores</h1>
          <p className="text-sm text-muted-foreground">
            Quem bate ponto neste restaurante. Cada um recebe um link e uma senha.
          </p>
        </div>
        <Button onClick={abrirNovo}>
          <Plus className="mr-2 h-4 w-4" /> Novo colaborador
        </Button>
      </div>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>CPF</TableHead>
              <TableHead>Cargo</TableHead>
              <TableHead>Contrato</TableHead>
              <TableHead className="text-right">Acesso</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </TableCell>
              </TableRow>
            ) : ativos.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  Nenhum colaborador cadastrado ainda.
                </TableCell>
              </TableRow>
            ) : (
              ativos.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">
                    <button className="hover:underline" onClick={() => { setEdicao(c); setAberto(true); }}>
                      {c.nome}
                    </button>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{formataCpf(c.cpf)}</TableCell>
                  <TableCell>{c.cargo || "·"}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-[11px]">
                      {CONTRATOS.find((t) => t.valor === c.tipo_contrato)?.rotulo ?? c.tipo_contrato}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="outline" onClick={() => gerarAcesso(c)} disabled={definirSenha.isPending}>
                        <KeyRound className="mr-1.5 h-3.5 w-3.5" /> Gerar senha
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setDesligando(c)}>
                        <UserMinus className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {inativos.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-medium text-muted-foreground">Desligados</p>
          <Card className="divide-y">
            {inativos.map((c) => (
              <div key={c.id} className="flex items-center justify-between px-4 py-2 text-sm">
                <span>{c.nome}</span>
                <span className="text-muted-foreground">
                  saiu em {c.demissao ? new Date(c.demissao).toLocaleDateString("pt-BR") : "·"}
                </span>
              </div>
            ))}
          </Card>
          <p className="mt-2 text-xs text-muted-foreground">
            O ponto de quem saiu continua guardado: é a prova da jornada dele.
          </p>
        </div>
      )}

      <Card className="p-4">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <p className="font-medium">Tablet do salão</p>
            <p className="text-sm text-muted-foreground">
              Para quem não tem celular e para a cozinha sem sinal. A pessoa digita a mesma senha de
              quatro dígitos e tira a foto ali.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              await criarQuiosque.mutateAsync(`Tablet ${quiosques.length + 1}`);
              toast.success("Tablet criado");
            }}
          >
            <Plus className="mr-2 h-4 w-4" /> Novo tablet
          </Button>
        </div>
        {quiosques.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum tablet configurado.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {quiosques.map((q) => (
              <li key={q.id} className="flex items-center justify-between gap-3">
                <span>{q.nome}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/ponto-tablet/${q.token}`);
                    toast.success("Link do tablet copiado. Abra no aparelho e deixe fixo nesta tela.");
                  }}
                >
                  <Copy className="mr-1.5 h-3.5 w-3.5" /> copiar link
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Cadastro */}
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{edicao.id ? "Editar colaborador" : "Novo colaborador"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">Nome completo</Label>
              <Input value={edicao.nome ?? ""} onChange={(e) => setEdicao({ ...edicao, nome: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">CPF</Label>
              <Input
                inputMode="numeric"
                value={edicao.cpf ?? ""}
                onChange={(e) => setEdicao({ ...edicao, cpf: e.target.value })}
              />
              <p className="text-[11px] text-muted-foreground">
                É a chave que o contador reconhece sem combinar código.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Cargo</Label>
              <Input value={edicao.cargo ?? ""} onChange={(e) => setEdicao({ ...edicao, cargo: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Admissão</Label>
              <Input
                type="date"
                value={edicao.admissao ?? ""}
                onChange={(e) => setEdicao({ ...edicao, admissao: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Tipo de contrato</Label>
              <Select
                value={edicao.tipo_contrato ?? "clt"}
                onValueChange={(v) => setEdicao({ ...edicao, tipo_contrato: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CONTRATOS.map((t) => (
                    <SelectItem key={t.valor} value={t.valor}>{t.rotulo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(false)}>Cancelar</Button>
            <Button onClick={gravar} disabled={!edicao.nome?.trim() || salvar.isPending}>
              {salvar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Link e senha */}
      <Dialog open={!!acesso} onOpenChange={(o) => !o && setAcesso(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Acesso de {acesso?.nome}</DialogTitle>
          </DialogHeader>
          {acesso && (
            <div className="space-y-4">
              <div className="flex justify-center rounded-lg border bg-white p-4">
                <QRCodeCanvas value={acesso.url} size={160} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Senha</Label>
                <p className="text-center font-mono text-3xl font-semibold tracking-widest">{acesso.senha}</p>
              </div>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  navigator.clipboard.writeText(`${acesso.url}\nSenha: ${acesso.senha}`);
                  toast.success("Link e senha copiados");
                }}
              >
                <Copy className="mr-2 h-4 w-4" /> Copiar link e senha
              </Button>
              <p className="text-[11px] text-muted-foreground">
                Anote a senha agora: ela não fica guardada em texto, só o embaralhado dela. Para
                trocar, basta gerar de novo.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Desligamento */}
      <Dialog open={!!desligando} onOpenChange={(o) => !o && setDesligando(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Desligar {desligando?.nome}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Data do desligamento</Label>
              <Input type="date" value={dataDesligamento} onChange={(e) => setDataDesligamento(e.target.value)} />
            </div>
            <p className="text-xs text-muted-foreground">
              Ele para de bater ponto a partir daqui. Nada é apagado: o histórico dele continua
              disponível para o espelho e para a contabilidade.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDesligando(null)}>Cancelar</Button>
            <Button onClick={confirmarDesligamento} disabled={desligar.isPending}>
              {desligar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Desligar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
