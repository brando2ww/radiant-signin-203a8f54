import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useFiscalConfig, type FiscalConfig } from "@/hooks/use-fiscal-config";
import { CheckCircle2, AlertCircle, Upload, FileCheck2, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function FiscalTab() {
  const { config, isLoading, save, isSaving, activate, isActivating, uploadCertificate, isUploading } =
    useFiscalConfig();

  const [form, setForm] = useState<Partial<FiscalConfig> & {
    senha_certificado?: string;
    csc_producao?: string;
    csc_homologacao?: string;
  }>({});

  useEffect(() => {
    if (config) setForm(config);
  }, [config]);

  const update = (key: string, value: any) => setForm((f) => ({ ...f, [key]: value }));

  if (isLoading) return <Skeleton className="h-96 w-full" />;

  const ativa = !!config?.focusnfe_empresa_id;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileCheck2 className="h-5 w-5" />
                Emissão Fiscal — FocusNFE
              </CardTitle>
              <CardDescription>
                Configure os dados fiscais do seu estabelecimento para emitir NFC-e, NF-e e NFS-e
              </CardDescription>
            </div>
            {ativa ? (
              <Badge variant="default" className="gap-1">
                <CheckCircle2 className="h-3 w-3" /> Empresa ativa
              </Badge>
            ) : (
              <Badge variant="secondary">Não ativada</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {config?.last_test_status === "erro" && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
              <AlertCircle className="h-4 w-4 mt-0.5 text-destructive" />
              <div>
                <div className="font-medium text-destructive">Erro na última ativação</div>
                <div className="text-muted-foreground">{config.last_test_message}</div>
              </div>
            </div>
          )}

          {/* Dados cadastrais */}
          <section id="section-dados" className="space-y-4 scroll-mt-24">
            <h3 className="font-semibold">Dados cadastrais</h3>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Razão Social *</Label>
                <Input value={form.razao_social || ""} onChange={(e) => update("razao_social", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Nome Fantasia</Label>
                <Input value={form.nome_fantasia || ""} onChange={(e) => update("nome_fantasia", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>CNPJ *</Label>
                <Input value={form.cnpj || ""} onChange={(e) => update("cnpj", e.target.value)} placeholder="00.000.000/0000-00" />
              </div>
              <div className="space-y-2">
                <Label>Inscrição Estadual</Label>
                <Input value={form.inscricao_estadual || ""} onChange={(e) => update("inscricao_estadual", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Inscrição Municipal</Label>
                <Input value={form.inscricao_municipal || ""} onChange={(e) => update("inscricao_municipal", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Regime Tributário</Label>
                <Select
                  value={String(form.regime_tributario || 1)}
                  onValueChange={(v) => update("regime_tributario", Number(v))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Simples Nacional</SelectItem>
                    <SelectItem value="2">Simples Nacional — excesso</SelectItem>
                    <SelectItem value="3">Regime Normal</SelectItem>
                    <SelectItem value="4">MEI</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Telefone</Label>
                <Input value={form.telefone || ""} onChange={(e) => update("telefone", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>E-mail</Label>
                <Input value={form.email || ""} onChange={(e) => update("email", e.target.value)} />
              </div>
            </div>
          </section>

          <Separator />

          {/* Endereço */}
          <section id="section-endereco" className="space-y-4 scroll-mt-24">
            <h3 className="font-semibold">Endereço</h3>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2 md:col-span-2">
                <Label>Logradouro *</Label>
                <Input value={form.logradouro || ""} onChange={(e) => update("logradouro", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Número *</Label>
                <Input value={form.numero || ""} onChange={(e) => update("numero", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Complemento</Label>
                <Input value={form.complemento || ""} onChange={(e) => update("complemento", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Bairro *</Label>
                <Input value={form.bairro || ""} onChange={(e) => update("bairro", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>CEP *</Label>
                <Input value={form.cep || ""} onChange={(e) => update("cep", e.target.value)} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Município *</Label>
                <Input value={form.municipio || ""} onChange={(e) => update("municipio", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>UF *</Label>
                <Input maxLength={2} value={form.uf || ""} onChange={(e) => update("uf", e.target.value.toUpperCase())} />
              </div>
              <div className="space-y-2">
                <Label>Cód. Município IBGE</Label>
                <Input value={form.codigo_municipio_ibge || ""} onChange={(e) => update("codigo_municipio_ibge", e.target.value)} />
              </div>
            </div>
          </section>

          <Separator />

          {/* Certificado */}
          <section id="section-certificado" className="space-y-4 scroll-mt-24">
            <h3 className="font-semibold">Certificado Digital A1</h3>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Arquivo .pfx</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="file"
                    accept=".pfx,.p12"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (f) await uploadCertificate(f);
                    }}
                    disabled={isUploading}
                  />
                  {config?.certificado_pfx_path && (
                    <Badge variant="outline" className="gap-1">
                      <Upload className="h-3 w-3" /> Enviado
                    </Badge>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Senha do certificado</Label>
                <Input
                  type="password"
                  value={form.senha_certificado || ""}
                  onChange={(e) => update("senha_certificado", e.target.value)}
                  placeholder={config?.certificado_pfx_path ? "Deixe em branco para manter" : ""}
                />
              </div>
            </div>
          </section>

          <Separator />

          {/* NFC-e CSC */}
          <section id="section-nfce" className="space-y-4 scroll-mt-24">
            <h3 className="font-semibold">NFC-e — CSC (obtido no portal do SEFAZ)</h3>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>CSC Produção</Label>
                <Input
                  type="password"
                  value={form.csc_producao || ""}
                  onChange={(e) => update("csc_producao", e.target.value)}
                  placeholder="Deixe em branco para manter"
                />
              </div>
              <div className="space-y-2">
                <Label>ID Token Produção</Label>
                <Input
                  type="number"
                  value={form.id_token_nfce_producao || ""}
                  onChange={(e) => update("id_token_nfce_producao", Number(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label>CSC Homologação</Label>
                <Input
                  type="password"
                  value={form.csc_homologacao || ""}
                  onChange={(e) => update("csc_homologacao", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>ID Token Homologação</Label>
                <Input
                  type="number"
                  value={form.id_token_nfce_homologacao || ""}
                  onChange={(e) => update("id_token_nfce_homologacao", Number(e.target.value))}
                />
              </div>
            </div>
          </section>

          <Separator />

          {/* Habilitação + Séries + Ambiente */}
          <section id="section-habilitacao" className="space-y-4 scroll-mt-24">
            <h3 className="font-semibold">Habilitação e ambiente</h3>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="flex items-center justify-between rounded-md border p-3">
                <Label>NFC-e</Label>
                <Switch checked={!!form.habilita_nfce} onCheckedChange={(c) => update("habilita_nfce", c)} />
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <Label>NF-e</Label>
                <Switch checked={!!form.habilita_nfe} onCheckedChange={(c) => update("habilita_nfe", c)} />
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <Label>NFS-e</Label>
                <Switch checked={!!form.habilita_nfse} onCheckedChange={(c) => update("habilita_nfse", c)} />
              </div>
              <div className="space-y-2">
                <Label>Série NFC-e</Label>
                <Input type="number" value={form.serie_nfce || 1} onChange={(e) => update("serie_nfce", Number(e.target.value))} />
              </div>
              <div className="space-y-2">
                <Label>Série NF-e</Label>
                <Input type="number" value={form.serie_nfe || 1} onChange={(e) => update("serie_nfe", Number(e.target.value))} />
              </div>
              <div className="space-y-2">
                <Label>Ambiente</Label>
                <Select
                  value={form.focusnfe_ambiente || "homologacao"}
                  onValueChange={(v) => update("focusnfe_ambiente", v)}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="homologacao">Homologação (testes)</SelectItem>
                    <SelectItem value="producao">Produção</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {form.focusnfe_ambiente === "producao" && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
                ⚠️ Ambiente de produção — notas emitidas têm validade fiscal real.
              </div>
            )}
          </section>

          <div className="flex flex-wrap justify-end gap-2 pt-4 border-t">
            <Button
              variant="outline"
              disabled={isSaving}
              onClick={async () => { await save(form); }}
            >
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar dados
            </Button>
            <Button
              disabled={isActivating || !form.cnpj || !form.razao_social}
              onClick={async () => {
                await save(form);
                await activate();
              }}
            >
              {isActivating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar e ativar na FocusNFE
            </Button>
          </div>

          <p className="text-xs text-muted-foreground pt-2">
            A conexão com a FocusNFE é gerenciada pela Velara. Você não precisa fornecer tokens — apenas seus dados fiscais e o certificado A1.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
