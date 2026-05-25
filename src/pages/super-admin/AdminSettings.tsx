import { User, Shield, Bell } from "lucide-react";

const items = [
  {
    icon: User,
    title: "Perfil",
    description: "Informações da sua conta de Super Admin.",
  },
  {
    icon: Shield,
    title: "Segurança",
    description: "Senha, autenticação em dois fatores e sessões ativas.",
  },
  {
    icon: Bell,
    title: "Notificações",
    description: "Preferências de alertas administrativos.",
  },
];

export default function AdminSettings() {
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Configurações</h1>
        <p className="text-sm text-muted-foreground">
          Gerencie suas preferências de administrador.
        </p>
      </div>

      <div className="space-y-3">
        {items.map(({ icon: Icon, title, description }) => (
          <div
            key={title}
            className="flex items-start gap-3 rounded-lg border border-border bg-card p-4"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted text-foreground">
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-medium text-foreground">{title}</h2>
              <p className="text-sm text-muted-foreground">{description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
