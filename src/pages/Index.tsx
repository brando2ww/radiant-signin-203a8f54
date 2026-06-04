import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AuthLayout } from "@/components/ui/auth-layout";
import { LoginForm } from "@/components/ui/forms/login-form";
import { SignUpForm } from "@/components/ui/forms/signup-form";
import { ResetPasswordForm } from "@/components/ui/forms/reset-password-form";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { getAuthErrorMessage } from "@/lib/auth-errors";
import { supabase } from "@/integrations/supabase/client";
import { useSuperAdmin } from "@/hooks/use-super-admin";
import { useUserRole } from "@/hooks/use-user-role";
import { useUserModules } from "@/hooks/use-user-modules";

type FormType = 'login' | 'signup' | 'reset';


const Index = () => {
  const { signUp, resetPasswordByDocument, signInWithGoogle, user, loading } = useAuth();
  const { isSuperAdmin, isLoading: superAdminLoading } = useSuperAdmin();
  const { defaultRoute, isLoading: roleLoading } = useUserRole();
  const { getDefaultModuleRoute, isLoading: modulesLoading } = useUserModules();
  const [currentForm, setCurrentForm] = useState<FormType>('login');
  const navigate = useNavigate();

  // Redirecionar se já estiver autenticado
  useEffect(() => {
    if (user && !loading && !superAdminLoading && !roleLoading && !modulesLoading) {
      if (isSuperAdmin) {
        navigate('/admin');
      } else {
        navigate(getDefaultModuleRoute());
      }
    }
  }, [user, loading, isSuperAdmin, superAdminLoading, roleLoading, modulesLoading, defaultRoute, navigate, getDefaultModuleRoute]);

  const handleSignIn = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        toast.error(getAuthErrorMessage(error));
        return;
      }

      if (data.user) {
        toast.success('Login realizado com sucesso!');
        // Redirecionamento será feito pelo useEffect baseado no role
      }
    } catch (error: unknown) {
      console.error("Login error:", error);
      toast.error("Erro ao fazer login");
    }
  };

  const handleSignUp = async (data: { documentType: string; document: string; name: string; email: string; password: string }) => {
    const { error } = await signUp({
      email: data.email,
      password: data.password,
      name: data.name,
      documentType: data.documentType,
      document: data.document,
    });
    
    if (error) {
      toast.error(getAuthErrorMessage(error));
      return;
    }
    
    toast.success('Cadastro realizado! Verifique seu email para confirmar.');
    setCurrentForm('login');
  };

  const handleResetPassword = async (documentType: string, document: string) => {
    const { success, error } = await resetPasswordByDocument(documentType, document);
    
    if (!success && error) {
      toast.error('Ocorreu um erro. Tente novamente.');
      return;
    }
    
    toast.success('Se este documento estiver cadastrado, você receberá um email com instruções.');
  };

  const handleGoogleSignIn = async () => {
    const { error } = await signInWithGoogle();
    
    if (error) {
      toast.error(getAuthErrorMessage(error));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <AuthLayout testimonials={[]}>
      <div key={currentForm} className="animate-fade-in">
        {currentForm === 'login' && (
          <LoginForm
            onSubmit={handleSignIn}
            onGoogleSignIn={handleGoogleSignIn}
            onResetPassword={() => setCurrentForm('reset')}
            onCreateAccount={() => setCurrentForm('signup')}
          />
        )}

        {currentForm === 'signup' && (
          <SignUpForm
            onSubmit={handleSignUp}
            onGoogleSignUp={handleGoogleSignIn}
            onBackToLogin={() => setCurrentForm('login')}
          />
        )}

        {currentForm === 'reset' && (
          <ResetPasswordForm
            onSubmit={handleResetPassword}
            onBackToLogin={() => setCurrentForm('login')}
          />
        )}
      </div>
    </AuthLayout>
  );
};

export default Index;
