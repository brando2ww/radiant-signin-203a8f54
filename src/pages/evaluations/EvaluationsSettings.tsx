import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { LogOut, Moon, Sun, Palette, Type, Image as ImageIcon, Save, Upload, ExternalLink } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { useBusinessSettings } from "@/hooks/use-business-settings";
import { useSupabaseUpload } from "@/hooks/use-supabase-upload";

export default function EvaluationsSettings() {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const { settings, loading: loadingSettings, saving, saveSettings } = useBusinessSettings();
  const { uploadFile, uploading } = useSupabaseUpload({ bucket: "business-logos", folder: user?.id });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Theme toggle
  const isDark = document.documentElement.classList.contains("dark");
  const [darkMode, setDarkMode] = useState(isDark);

  // Personalization state
  const [logoUrl, setLogoUrl] = useState("");
  const [bgColor, setBgColor] = useState("#f8fafc");
  const [welcomeMessage, setWelcomeMessage] = useState("");
  const [thankYouMessage, setThankYouMessage] = useState("");
  const [googleReviewUrl, setGoogleReviewUrl] = useState("");

  useEffect(() => {
    if (settings) {
      setLogoUrl(settings.logo_url || "");
      setBgColor((settings as any).background_color || "#f8fafc");
      setWelcomeMessage(settings.welcome_message || "");
      setThankYouMessage(settings.thank_you_message || "");
      setGoogleReviewUrl(settings.google_review_url || "");
    }
  }, [settings]);

  const toggleTheme = (checked: boolean) => {
    setDarkMode(checked);
    if (checked) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    localStorage.setItem("theme", checked ? "dark" : "light");
  };

  const handleSignOut = async () => {
    try {
      setIsLoading(true);
      navigate("/");
      await signOut();
    } catch (error: any) {
      toast.error("Erro ao sair: " + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogoUpload = async (file: File) => {
    const url = await uploadFile(file, "evaluation-logo");
    if (url) setLogoUrl(url);
  };

  const handleSavePersonalization = () => {
    saveSettings({
      ...settings,
      logo_url: logoUrl || undefined,
      background_color: bgColor,
      welcome_message: welcomeMessage,
      thank_you_message: thankYouMessage,
      google_review_url: googleReviewUrl || undefined,
    } as any);
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Configurações</h1>
        <p className="text-sm text-muted-foreground">Gerencie seu perfil, preferências e personalização da pesquisa</p>
      </div>

      {/* Personalization Section */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-4">Personalização da Pesquisa</h2>

        {/* Logo */}
        <Card className="mb-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ImageIcon className="h-4 w-4" /> Logotipo
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              O logo aparecerá no topo da pesquisa pública.
            </p>
            {logoUrl && (
              <div className="flex items-center gap-4">
                <img src={logoUrl} alt="Logo" className="h-16 w-16 object-contain rounded-lg border" />
                <Button variant="outline" size="sm" onClick={() => setLogoUrl("")}>
                  Remover
                </Button>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleLogoUpload(file);
              }}
            />
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-4 w-4" />
              {uploading ? "Enviando..." : "Enviar logotipo"}
            </Button>
          </CardContent>
        </Card>

        {/* Background Color */}
        <Card className="mb-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Palette className="h-4 w-4" /> Cor de Fundo
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Define a cor de fundo da página da pesquisa.
            </p>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={bgColor}
                onChange={(e) => setBgColor(e.target.value)}
                className="w-12 h-12 rounded-lg border cursor-pointer"
              />
              <Input
                value={bgColor}
                onChange={(e) => setBgColor(e.target.value)}
                placeholder="#f8fafc"
                className="max-w-[140px] font-mono"
              />
              <div
                className="w-24 h-12 rounded-lg border"
                style={{ backgroundColor: bgColor }}
              />
            </div>
          </CardContent>
        </Card>

        {/* Messages */}
        <Card className="mb-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Type className="h-4 w-4" /> Mensagens
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Mensagem de boas-vindas</Label>
              <Textarea
                value={welcomeMessage}
                onChange={(e) => setWelcomeMessage(e.target.value)}
                placeholder="Ex: Olá! Gostaríamos de ouvir sua opinião sobre nosso restaurante."
                maxLength={300}
                className="min-h-[80px]"
              />
              <p className="text-xs text-muted-foreground">Exibida na primeira tela da pesquisa.</p>
            </div>
            <div className="space-y-2">
              <Label>Mensagem de agradecimento</Label>
              <Textarea
                value={thankYouMessage}
                onChange={(e) => setThankYouMessage(e.target.value)}
                placeholder="Ex: Obrigado por avaliar! Sua opinião é muito importante para nós."
                maxLength={300}
                className="min-h-[80px]"
              />
              <p className="text-xs text-muted-foreground">Exibida após o envio da avaliação.</p>
            </div>
          </CardContent>
        </Card>

        {/* Google Review */}
        <Card className="mb-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ExternalLink className="h-4 w-4" /> Avaliação Google
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Quando o cliente der nota 9 ou 10 no NPS, ele será <strong>redirecionado automaticamente</strong> para avaliar no Google e <strong>não receberá cupom de sorteio</strong> (o incentivo passa a ser a avaliação pública).
            </p>
            <div className="space-y-2">
              <Label>Link do Google Reviews</Label>
              <Input
                value={googleReviewUrl}
                onChange={(e) => setGoogleReviewUrl(e.target.value)}
                placeholder="https://g.page/r/seu-negocio/review"
              />
              <p className="text-xs text-muted-foreground">
                Para encontrar o link: pesquise seu negócio no Google → clique em "Escrever avaliação" → copie o URL da página.
              </p>
            </div>
          </CardContent>
        </Card>

        <Button
          onClick={handleSavePersonalization}
          disabled={saving || loadingSettings}
          className="gap-2"
        >
          <Save className="h-4 w-4" />
          {saving ? "Salvando..." : "Salvar Personalização"}
        </Button>
      </div>

      {/* Profile */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Perfil</CardTitle>
          <CardDescription>Informações da sua conta</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">Nome</Label>
            <p className="text-sm font-medium">{profile?.full_name || "—"}</p>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">E-mail</Label>
            <p className="text-sm font-medium">{user?.email || "—"}</p>
          </div>
        </CardContent>
      </Card>

      {/* Appearance */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Aparência</CardTitle>
          <CardDescription>Personalize a interface</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {darkMode ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
              <Label>Modo escuro</Label>
            </div>
            <Switch checked={darkMode} onCheckedChange={toggleTheme} />
          </div>
        </CardContent>
      </Card>

      {/* Logout */}
      <Card className="border-destructive/30">
        <CardContent className="pt-6">
          <Button
            variant="destructive"
            onClick={handleSignOut}
            disabled={isLoading}
            className="gap-2"
          >
            <LogOut className="h-4 w-4" /> Sair da conta
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
