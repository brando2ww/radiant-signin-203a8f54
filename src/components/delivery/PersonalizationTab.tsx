import { useState, useEffect } from "react";
import { useBusinessSettings } from "@/hooks/use-business-settings";
import { useSupabaseUpload } from "@/hooks/use-supabase-upload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Upload, X, Image as ImageIcon, Palette, Save, Link2, Check, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import {
  isSlugAvailable,
  isValidSlug,
  normalizeSlug,
} from "@/lib/public-menu-link";

export function PersonalizationTab() {
  const { user } = useAuth();
  const { settings, loading, saving, saveSettings } = useBusinessSettings();
  const { uploadFile, uploading } = useSupabaseUpload({ bucket: "business-logos", folder: user?.id });
  
  const [formData, setFormData] = useState({
    business_name: "",
    business_slogan: "",
    business_description: "",
    logo_url: "",
    cover_url: "",
    primary_color: "#3b82f6",
    secondary_color: "#8b5cf6",
    welcome_message: "Olá! Queremos ouvir você 😊",
    thank_you_message: "Obrigado! Esperamos vê-lo novamente em breve!",
    slug: "",
  });

  const [slugStatus, setSlugStatus] = useState<
    "idle" | "checking" | "available" | "taken" | "invalid"
  >("idle");

  useEffect(() => {
    if (settings) {
      setFormData({
        business_name: settings.business_name || "",
        business_slogan: settings.business_slogan || "",
        business_description: settings.business_description || "",
        logo_url: settings.logo_url || "",
        cover_url: settings.cover_url || "",
        primary_color: settings.primary_color || "#3b82f6",
        secondary_color: settings.secondary_color || "#8b5cf6",
        welcome_message: settings.welcome_message || "Olá! Queremos ouvir você 😊",
        thank_you_message: settings.thank_you_message || "Obrigado! Esperamos vê-lo novamente em breve!",
      });
    }
  }, [settings]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>, field: "logo_url" | "cover_url") => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    try {
      const fileName = field === "logo_url" ? "logo" : "cover";
      const url = await uploadFile(file, fileName);
      if (url) {
        setFormData(prev => ({ ...prev, [field]: url }));
        toast.success("Imagem enviada com sucesso!");
      }
    } catch (error) {
      toast.error("Erro ao enviar imagem");
    }
  };

  const handleRemoveImage = (field: "logo_url" | "cover_url") => {
    setFormData(prev => ({ ...prev, [field]: "" }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await saveSettings(formData);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Cover Image */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ImageIcon className="h-5 w-5" />
              Foto de Capa
            </CardTitle>
            <CardDescription>
              Imagem que aparece no topo do seu cardápio. Recomendado: 1200x400px
            </CardDescription>
          </CardHeader>
          <CardContent>
            {formData.cover_url ? (
              <div className="relative">
                <img
                  src={formData.cover_url}
                  alt="Capa"
                  className="w-full h-48 object-cover rounded-lg"
                />
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  className="absolute top-2 right-2"
                  onClick={() => handleRemoveImage("cover_url")}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-muted-foreground/25 rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
                <Upload className="h-10 w-10 text-muted-foreground mb-2" />
                <span className="text-sm text-muted-foreground">Clique para enviar a foto de capa</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleFileSelect(e, "cover_url")}
                  disabled={uploading}
                />
              </label>
            )}
          </CardContent>
        </Card>

        {/* Logo and Basic Info */}
        <Card>
          <CardHeader>
            <CardTitle>Informações do Negócio</CardTitle>
            <CardDescription>
              Logo e informações básicas que aparecem no cardápio
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex flex-col md:flex-row gap-6">
              {/* Logo Upload */}
              <div className="flex-shrink-0">
                <Label className="mb-2 block">Logo/Perfil</Label>
                {formData.logo_url ? (
                  <div className="relative w-32 h-32">
                    <img
                      src={formData.logo_url}
                      alt="Logo"
                      className="w-full h-full object-cover rounded-full border-4 border-background shadow-lg"
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      className="absolute -top-1 -right-1 h-6 w-6"
                      onClick={() => handleRemoveImage("logo_url")}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center w-32 h-32 border-2 border-dashed border-muted-foreground/25 rounded-full cursor-pointer hover:bg-muted/50 transition-colors">
                    <Upload className="h-6 w-6 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground mt-1">Logo</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleFileSelect(e, "logo_url")}
                      disabled={uploading}
                    />
                  </label>
                )}
              </div>

              {/* Text Fields */}
              <div className="flex-1 space-y-4">
                <div>
                  <Label htmlFor="business_name">Nome do Negócio</Label>
                  <Input
                    id="business_name"
                    value={formData.business_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, business_name: e.target.value }))}
                    placeholder="Ex: Pizzaria do João"
                  />
                </div>
                <div>
                  <Label htmlFor="business_slogan">Slogan</Label>
                  <Input
                    id="business_slogan"
                    value={formData.business_slogan}
                    onChange={(e) => setFormData(prev => ({ ...prev, business_slogan: e.target.value }))}
                    placeholder="Ex: As melhores pizzas da cidade!"
                  />
                </div>
                <div>
                  <Label htmlFor="business_description">Descrição</Label>
                  <Textarea
                    id="business_description"
                    value={formData.business_description}
                    onChange={(e) => setFormData(prev => ({ ...prev, business_description: e.target.value }))}
                    placeholder="Conte um pouco sobre seu negócio..."
                    rows={3}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Colors */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Palette className="h-5 w-5" />
              Cores do Tema
            </CardTitle>
            <CardDescription>
              Personalize as cores do seu cardápio público
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-6">
              <div>
                <Label htmlFor="primary_color" className="mb-2 block">Cor Primária</Label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    id="primary_color"
                    value={formData.primary_color}
                    onChange={(e) => setFormData(prev => ({ ...prev, primary_color: e.target.value }))}
                    className="w-12 h-12 rounded-lg cursor-pointer border-2 border-border"
                  />
                  <Input
                    value={formData.primary_color}
                    onChange={(e) => setFormData(prev => ({ ...prev, primary_color: e.target.value }))}
                    className="w-28"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="secondary_color" className="mb-2 block">Cor Secundária</Label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    id="secondary_color"
                    value={formData.secondary_color}
                    onChange={(e) => setFormData(prev => ({ ...prev, secondary_color: e.target.value }))}
                    className="w-12 h-12 rounded-lg cursor-pointer border-2 border-border"
                  />
                  <Input
                    value={formData.secondary_color}
                    onChange={(e) => setFormData(prev => ({ ...prev, secondary_color: e.target.value }))}
                    className="w-28"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Messages */}
        <Card>
          <CardHeader>
            <CardTitle>Mensagens</CardTitle>
            <CardDescription>
              Mensagens personalizadas para seus clientes
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="welcome_message">Mensagem de Boas-vindas</Label>
              <Input
                id="welcome_message"
                value={formData.welcome_message}
                onChange={(e) => setFormData(prev => ({ ...prev, welcome_message: e.target.value }))}
                placeholder="Ex: Olá! Seja bem-vindo!"
              />
            </div>
            <div>
              <Label htmlFor="thank_you_message">Mensagem de Agradecimento</Label>
              <Input
                id="thank_you_message"
                value={formData.thank_you_message}
                onChange={(e) => setFormData(prev => ({ ...prev, thank_you_message: e.target.value }))}
                placeholder="Ex: Obrigado pela preferência!"
              />
            </div>
          </CardContent>
        </Card>

        {/* Preview */}
        <Card>
          <CardHeader>
            <CardTitle>Preview do Cardápio</CardTitle>
            <CardDescription>
              Veja como seu cardápio vai aparecer para os clientes
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="border rounded-lg overflow-hidden bg-background">
              {formData.cover_url ? (
                <div className="h-32 w-full overflow-hidden">
                  <img
                    src={formData.cover_url}
                    alt="Preview Capa"
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div 
                  className="h-32 w-full"
                  style={{ backgroundColor: formData.primary_color }}
                />
              )}
              
              <div className="p-4 flex items-center gap-4 -mt-8 relative">
                {formData.logo_url ? (
                  <img
                    src={formData.logo_url}
                    alt="Preview Logo"
                    className="w-20 h-20 object-cover rounded-full border-4 border-background shadow-lg"
                  />
                ) : (
                  <div 
                    className="w-20 h-20 rounded-full border-4 border-background shadow-lg flex items-center justify-center text-white font-bold text-xl"
                    style={{ backgroundColor: formData.secondary_color }}
                  >
                    {formData.business_name?.charAt(0) || "?"}
                  </div>
                )}
                <div className="pt-8">
                  <h3 className="font-bold text-lg">{formData.business_name || "Nome do Negócio"}</h3>
                  {formData.business_slogan && (
                    <p className="text-sm text-muted-foreground">{formData.business_slogan}</p>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Submit Button */}
        <div className="flex justify-end">
          <Button type="submit" disabled={saving || uploading} size="lg">
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Salvar Alterações
              </>
            )}
          </Button>
        </div>
      </form>
    </>
  );
}
