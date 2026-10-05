import { useEffect, useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { DocumentInput } from "@/components/ui/document-input";
import { PhoneInput } from "@/components/ui/phone-input";
import { CEPInput } from "@/components/ui/cep-input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useCEPLookup } from "@/hooks/use-cep-lookup";
import { useEstablishmentId } from "@/hooks/use-establishment-id";
import {
  buscarClienteMesmoDocumento,
  useSalvarVendasCliente,
  useVendasRepresentantesLista,
  type ClienteGravar,
} from "@/hooks/use-vendas-clientes";
import type { VendasCliente } from "@/lib/vendas/types";
import {
  CONDICOES_SUGERIDAS,
  UFS,
  cnpjValido,
  consultarCnpj,
  cpfValido,
  formatarCep,
  formatarCnpj,
  formatarCpf,
  soDigitos,
  tituloCaso,
} from "./cliente-utils";

export type ClienteDialogProps = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  cliente?: VendasCliente | null;
  /** "gestao": dono/gerente (escolhe representante e marca B2B). "representante": o cliente fica na carteira de quem cadastra. */
  mode: "gestao" | "representante";
  onSaved?: (c: VendasCliente) => void;
};

type Form = {
  person_type: "PJ" | "PF";
  cnpj: string;
  cpf: string;
  company_name: string;
  trade_name: string;
  state_registration: string;
  name: string;
  contact_name: string;
  whatsapp: string;
  phone: string;
  email: string;
  cep: string;
  street: string;
  address_number: string;
  complement: string;
  district: string;
  city: string;
  state: string;
  ibge_code: string;
  payment_terms: string;
  credit_limit: string;
  representative_id: string;
  is_b2b: boolean;
  notes: string;
};

const SEM_REP = "__nenhum__";

function formInicial(c?: VendasCliente | null): Form {
  return {
    person_type: c?.person_type ?? (c && c.cpf && !c.cnpj ? "PF" : "PJ"),
    cnpj: formatarCnpj(c?.cnpj),
    cpf: formatarCpf(c?.cpf),
    company_name: c?.company_name ?? "",
    trade_name: c?.trade_name ?? "",
    state_registration: c?.state_registration ?? "",
    name: c?.name ?? "",
    contact_name: c?.contact_name ?? "",
    whatsapp: c?.whatsapp ?? "",
    phone: c?.phone ?? "",
    email: c?.email ?? "",
    cep: formatarCep(c?.cep),
    street: c?.street ?? "",
    address_number: c?.address_number ?? "",
    complement: c?.complement ?? "",
    district: c?.district ?? "",
    city: c?.city ?? "",
    state: c?.state ?? "",
    ibge_code: c?.ibge_code ?? "",
    payment_terms: c?.payment_terms ?? "",
    credit_limit: c?.credit_limit != null ? String(c.credit_limit) : "",
    representative_id: c?.representative_id ?? SEM_REP,
    is_b2b: c ? c.is_b2b : true,
    notes: c?.notes ?? "",
  };
}

const vazioParaNull = (v: string) => (v.trim() === "" ? null : v.trim());

/** Cadastro do cliente B2B (pdv_customers). Usado na gestão (/pdv/vendas/clientes) e no app do representante. */
export function ClienteDialog({ open, onOpenChange, cliente, mode, onSaved }: ClienteDialogProps) {
  const { visibleUserId } = useEstablishmentId();
  const salvar = useSalvarVendasCliente();
  const { lookupCEP, isLoading: buscandoCep } = useCEPLookup();
  const [form, setForm] = useState<Form>(() => formInicial(cliente));
  const [buscandoCnpj, setBuscandoCnpj] = useState(false);
  const [verificando, setVerificando] = useState(false);
  const [erros, setErros] = useState<Partial<Record<keyof Form, string>>>({});
  const ultimoCep = useRef<string>("");

  useEffect(() => {
    if (open) {
      setForm(formInicial(cliente));
      setErros({});
      ultimoCep.current = soDigitos(cliente?.cep);
    }
  }, [open, cliente]);

  const set = <K extends keyof Form>(campo: K, valor: Form[K]) => {
    setForm((f) => ({ ...f, [campo]: valor }));
    if (erros[campo]) setErros((e) => ({ ...e, [campo]: undefined }));
  };

  const ehPJ = form.person_type === "PJ";

  const preencherPeloCep = async (cep: string) => {
    const d = soDigitos(cep);
    if (d.length !== 8 || d === ultimoCep.current) return;
    ultimoCep.current = d;
    const r = await lookupCEP(d);
    if (!r) return;
    setForm((f) => ({
      ...f,
      street: r.logradouro || f.street,
      district: r.bairro || f.district,
      city: r.localidade || f.city,
      state: r.uf || f.state,
      ibge_code: r.ibge || f.ibge_code,
    }));
  };

  const buscarCnpj = async () => {
    const d = soDigitos(form.cnpj);
    if (d.length !== 14) {
      setErros((e) => ({ ...e, cnpj: "Digite os 14 números do CNPJ." }));
      return;
    }
    if (!cnpjValido(d)) {
      setErros((e) => ({ ...e, cnpj: "CNPJ inválido: confira os números." }));
      return;
    }
    setBuscandoCnpj(true);
    const r = await consultarCnpj(d);
    setBuscandoCnpj(false);
    if (!r) {
      toast.error("Não foi possível consultar este CNPJ agora. Preencha os dados à mão.");
      return;
    }
    const rua = [r.descricao_tipo_de_logradouro, r.logradouro].filter(Boolean).join(" ");
    const cepD = soDigitos(r.cep);
    if (cepD.length === 8) ultimoCep.current = cepD;
    const telefone = soDigitos(r.ddd_telefone_1);
    setForm((f) => {
      const fantasia = r.nome_fantasia?.trim() || "";
      const razao = r.razao_social?.trim() || "";
      return {
        ...f,
        company_name: razao || f.company_name,
        trade_name: fantasia || f.trade_name,
        name: f.name.trim() ? f.name : tituloCaso(fantasia || razao),
        cep: cepD.length === 8 ? formatarCep(cepD) : f.cep,
        street: rua ? tituloCaso(rua) : f.street,
        address_number: r.numero?.trim() || f.address_number,
        complement: r.complemento?.trim() ? tituloCaso(r.complemento) : f.complement,
        district: r.bairro ? tituloCaso(r.bairro) : f.district,
        city: r.municipio ? tituloCaso(r.municipio) : f.city,
        state: r.uf || f.state,
        ibge_code: r.codigo_municipio_ibge ? String(r.codigo_municipio_ibge) : f.ibge_code,
        phone: f.phone || (telefone.length >= 10 ? formatarTelefoneLocal(telefone) : ""),
        email: f.email || (r.email ? r.email.toLowerCase() : ""),
      };
    });
    setErros({});
    const situacao = r.descricao_situacao_cadastral?.toUpperCase();
    if (situacao && situacao !== "ATIVA") {
      toast.warning(`Atenção: este CNPJ está "${tituloCaso(situacao)}" na Receita.`);
    } else {
      toast.success("Dados da Receita preenchidos. Confira antes de salvar.");
    }
  };

  const validar = (): Partial<Record<keyof Form, string>> => {
    const e: Partial<Record<keyof Form, string>> = {};
    const nome = form.name.trim() || (ehPJ ? form.trade_name.trim() || form.company_name.trim() : "");
    if (nome.length < 2) e.name = "Informe o nome do cliente.";
    if (ehPJ && form.cnpj && !cnpjValido(form.cnpj)) e.cnpj = "CNPJ inválido: confira os números.";
    if (!ehPJ && form.cpf && !cpfValido(form.cpf)) e.cpf = "CPF inválido: confira os números.";
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) e.email = "E-mail inválido.";
    const cep = soDigitos(form.cep);
    if (cep && cep.length !== 8) e.cep = "CEP com 8 números.";
    const wpp = soDigitos(form.whatsapp);
    if (wpp && wpp.length < 10) e.whatsapp = "Número incompleto.";
    return e;
  };

  const ocupado = salvar.isPending || verificando;

  const gravar = async () => {
    if (ocupado) return;
    const e = validar();
    setErros(e);
    if (Object.keys(e).length > 0) {
      toast.error("Confira os campos destacados.");
      return;
    }
    if (!visibleUserId) return;

    const cnpj = ehPJ ? soDigitos(form.cnpj) : "";
    const cpf = !ehPJ ? soDigitos(form.cpf) : "";
    const doc = cnpj || cpf;
    if (doc) {
      const campo = cnpj ? "cnpj" : "cpf";
      setVerificando(true);
      const repetido = await buscarClienteMesmoDocumento(visibleUserId, doc, cliente?.id).finally(() => setVerificando(false));
      if (repetido) {
        const msg = repetido.visivel
          ? `Já existe um cliente com este ${campo.toUpperCase()}: ${repetido.name}.`
          : `Este ${campo.toUpperCase()} já é cliente da empresa, em outra carteira. Fale com a gestão.`;
        setErros({ [campo]: repetido.visivel ? `Já cadastrado: ${repetido.name}.` : "Já cadastrado em outra carteira." });
        toast.error(msg);
        return;
      }
    }

    const nome = form.name.trim() || (ehPJ ? tituloCaso(form.trade_name.trim() || form.company_name.trim()) : "");
    const dados: ClienteGravar = {
      person_type: form.person_type,
      cnpj: cnpj || null,
      cpf: cpf || null,
      company_name: ehPJ ? vazioParaNull(form.company_name) : null,
      trade_name: ehPJ ? vazioParaNull(form.trade_name) : null,
      state_registration: vazioParaNull(form.state_registration),
      name: nome,
      contact_name: vazioParaNull(form.contact_name),
      whatsapp: vazioParaNull(form.whatsapp),
      phone: vazioParaNull(form.phone),
      email: form.email.trim() ? form.email.trim().toLowerCase() : null,
      cep: soDigitos(form.cep) || null,
      street: vazioParaNull(form.street),
      address_number: vazioParaNull(form.address_number),
      complement: vazioParaNull(form.complement),
      district: vazioParaNull(form.district),
      city: vazioParaNull(form.city),
      state: vazioParaNull(form.state)?.toUpperCase() ?? null,
      ibge_code: vazioParaNull(form.ibge_code),
      payment_terms: vazioParaNull(form.payment_terms),
      notes: vazioParaNull(form.notes),
    };
    if (mode === "gestao") {
      const limite = form.credit_limit === "" ? null : Number(form.credit_limit);
      dados.credit_limit = limite != null && Number.isFinite(limite) ? limite : null;
      dados.representative_id = form.representative_id === SEM_REP ? null : form.representative_id;
      dados.is_b2b = form.is_b2b;
    }

    try {
      const salvo = await salvar.mutateAsync({ id: cliente?.id ?? null, dados });
      toast.success(cliente ? "Cliente atualizado." : "Cliente cadastrado.");
      onSaved?.(salvo);
      onOpenChange(false);
    } catch (err: any) {
      const msg = String(err?.message ?? "");
      if (err?.code === "42501" || /row-level security|permission/i.test(msg)) {
        toast.error("Você não tem permissão para gravar este cliente.");
      } else {
        toast.error("Não foi possível salvar o cliente." + (msg ? ` ${msg}` : ""));
      }
    }
  };


  return (
    <Dialog open={open} onOpenChange={(v) => !ocupado && onOpenChange(v)}>
      <DialogContent className="max-h-[92vh] w-[calc(100vw-1.5rem)] max-w-2xl overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>{cliente ? "Editar cliente" : "Novo cliente"}</DialogTitle>
          <DialogDescription>
            {mode === "representante" && !cliente
              ? "O cliente entra na sua carteira."
              : "Cadastro do cliente para propostas, pedidos e cobranças."}
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-6"
          onSubmit={(ev) => {
            ev.preventDefault();
            gravar();
          }}
        >
          {/* Identificação */}
          <section className="space-y-3">
            <ToggleGroup
              type="single"
              value={form.person_type}
              onValueChange={(v) => v && set("person_type", v as Form["person_type"])}
              className="justify-start"
            >
              <ToggleGroupItem value="PJ" className="h-8 px-3 text-sm" aria-label="Pessoa jurídica">
                Pessoa jurídica
              </ToggleGroupItem>
              <ToggleGroupItem value="PF" className="h-8 px-3 text-sm" aria-label="Pessoa física">
                Pessoa física
              </ToggleGroupItem>
            </ToggleGroup>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {ehPJ ? (
                <Campo label="CNPJ" erro={erros.cnpj} className="sm:col-span-2">
                  <div className="flex gap-2">
                    <DocumentInput
                      documentType="cnpj"
                      value={form.cnpj}
                      onChange={(v) => set("cnpj", v)}
                      className="min-w-0 flex-1"
                      inputMode="numeric"
                    />
                    <Button type="button" variant="outline" onClick={buscarCnpj} disabled={buscandoCnpj} className="shrink-0">
                      {buscandoCnpj ? <Loader2 className="h-4 w-4 animate-spin sm:mr-2" /> : <Search className="h-4 w-4 sm:mr-2" />}
                      <span className="hidden sm:inline">Buscar CNPJ</span>
                    </Button>
                  </div>
                </Campo>
              ) : (
                <Campo label="CPF" erro={erros.cpf}>
                  <DocumentInput documentType="cpf" value={form.cpf} onChange={(v) => set("cpf", v)} inputMode="numeric" />
                </Campo>
              )}

              {ehPJ && (
                <>
                  <Campo label="Razão social">
                    <Input value={form.company_name} onChange={(e) => set("company_name", e.target.value)} />
                  </Campo>
                  <Campo label="Nome fantasia">
                    <Input value={form.trade_name} onChange={(e) => set("trade_name", e.target.value)} />
                  </Campo>
                </>
              )}
              <Campo label="Inscrição estadual" dica={ehPJ ? "Deixe em branco ou escreva ISENTO." : "Só para produtor rural."}>
                <Input value={form.state_registration} onChange={(e) => set("state_registration", e.target.value)} />
              </Campo>
              <Campo label="Nome do cliente *" erro={erros.name} dica="Como aparece nas listas e na proposta.">
                <Input value={form.name} onChange={(e) => set("name", e.target.value)} maxLength={120} />
              </Campo>
            </div>
          </section>

          {/* Contato */}
          <section className="space-y-3">
            <Titulo>Contato</Titulo>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Campo label="Pessoa de contato">
                <Input value={form.contact_name} onChange={(e) => set("contact_name", e.target.value)} />
              </Campo>
              <Campo label="WhatsApp" erro={erros.whatsapp}>
                <PhoneInput value={form.whatsapp} onChange={(v) => set("whatsapp", v)} inputMode="tel" />
              </Campo>
              <Campo label="Telefone">
                <PhoneInput value={form.phone} onChange={(v) => set("phone", v)} inputMode="tel" />
              </Campo>
              <Campo label="E-mail" erro={erros.email}>
                <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
              </Campo>
            </div>
          </section>

          {/* Endereço */}
          <section className="space-y-3">
            <Titulo>Endereço</Titulo>
            <div className="grid grid-cols-6 gap-3">
              <Campo label="CEP" erro={erros.cep} className="col-span-6 sm:col-span-2">
                <div className="relative">
                  <CEPInput
                    value={form.cep}
                    onChange={(v) => {
                      set("cep", v);
                      if (soDigitos(v).length === 8) preencherPeloCep(v);
                    }}
                    inputMode="numeric"
                  />
                  {buscandoCep && (
                    <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                  )}
                </div>
              </Campo>
              <Campo label="Rua" className="col-span-6 sm:col-span-4">
                <Input value={form.street} onChange={(e) => set("street", e.target.value)} />
              </Campo>
              <Campo label="Número" className="col-span-2">
                <Input value={form.address_number} onChange={(e) => set("address_number", e.target.value)} />
              </Campo>
              <Campo label="Complemento" className="col-span-4">
                <Input value={form.complement} onChange={(e) => set("complement", e.target.value)} />
              </Campo>
              <Campo label="Bairro" className="col-span-6 sm:col-span-2">
                <Input value={form.district} onChange={(e) => set("district", e.target.value)} />
              </Campo>
              <Campo label="Cidade" className="col-span-4 sm:col-span-3">
                <Input
                  value={form.city}
                  onChange={(e) => {
                    set("city", e.target.value);
                    set("ibge_code", "");
                  }}
                />
              </Campo>
              <Campo label="UF" className="col-span-2 sm:col-span-1">
                <Select value={form.state || undefined} onValueChange={(v) => set("state", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="UF" />
                  </SelectTrigger>
                  <SelectContent>
                    {UFS.map((uf) => (
                      <SelectItem key={uf} value={uf}>
                        {uf}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Campo>
            </div>
          </section>

          {/* Comercial */}
          <section className="space-y-3">
            <Titulo>Comercial</Titulo>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Campo label="Condição de pagamento" dica="Ex.: 28 dias, 30/60/90, à vista.">
                <Input
                  value={form.payment_terms}
                  onChange={(e) => set("payment_terms", e.target.value)}
                  list="vendas-condicoes-pagamento"
                />
                <datalist id="vendas-condicoes-pagamento">
                  {CONDICOES_SUGERIDAS.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </Campo>
              <Campo label="Limite de crédito" dica={mode === "representante" ? "Definido pela empresa." : undefined}>
                <CurrencyInput
                  value={form.credit_limit}
                  onChange={(v) => set("credit_limit", v)}
                  disabled={mode === "representante"}
                />
              </Campo>
              {mode === "gestao" && (
                <>
                  <SeletorRepresentante
                    valor={form.representative_id}
                    onChange={(v) => set("representative_id", v)}
                    atualId={cliente?.representative_id ?? null}
                  />
                  <div className="flex items-start justify-between gap-3 rounded-md border p-3">
                    <div>
                      <Label htmlFor="cliente-b2b" className="text-sm">
                        Cliente da Força de vendas
                      </Label>
                      <p className="text-xs text-muted-foreground">Aparece na lista de clientes B2B.</p>
                    </div>
                    <Switch id="cliente-b2b" checked={form.is_b2b} onCheckedChange={(v) => set("is_b2b", v)} />
                  </div>
                </>
              )}
              <Campo label="Observações" className="sm:col-span-2">
                <Textarea rows={3} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
              </Campo>
            </div>
          </section>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={ocupado}>
              Cancelar
            </Button>
            <Button type="submit" disabled={ocupado}>
              {ocupado && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function formatarTelefoneLocal(d: string) {
  if (d.length === 11) return d.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
  return d.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
}

function SeletorRepresentante({
  valor,
  onChange,
  atualId,
}: {
  valor: string;
  onChange: (v: string) => void;
  atualId: string | null;
}) {
  const { representantes, isLoading } = useVendasRepresentantesLista();
  const opcoes = representantes.filter((r) => r.is_active || r.id === atualId);
  return (
    <Campo label="Representante" dica="Quem atende este cliente.">
      <Select value={valor} onValueChange={onChange} disabled={isLoading}>
        <SelectTrigger>
          <SelectValue placeholder="Sem representante" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={SEM_REP}>Sem representante</SelectItem>
          {opcoes.map((r) => (
            <SelectItem key={r.id} value={r.id}>
              {r.name}
              {!r.is_active ? " (inativo)" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Campo>
  );
}

function Titulo({ children }: { children: React.ReactNode }) {
  return <h3 className="border-b pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{children}</h3>;
}

function Campo({
  label,
  erro,
  dica,
  className,
  children,
}: {
  label: string;
  erro?: string;
  dica?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`min-w-0 space-y-1.5 ${className ?? ""}`}>
      <Label className="text-sm">{label}</Label>
      {children}
      {erro ? (
        <p className="text-xs text-destructive">{erro}</p>
      ) : dica ? (
        <p className="text-xs text-muted-foreground">{dica}</p>
      ) : null}
    </div>
  );
}
