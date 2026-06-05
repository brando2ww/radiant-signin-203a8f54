import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session, AuthError } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface Profile {
  id: string;
  full_name: string | null;
  document_type: string | null;
  document: string | null;
  avatar_url: string | null;
  cover_image_url: string | null;
  bio: string | null;
  created_at: string;
  updated_at: string;
}

interface UpdateProfileData {
  full_name?: string;
  bio?: string;
  avatar_url?: string;
  cover_image_url?: string;
}

interface SignUpData {
  email: string;
  password: string;
  name: string;
  documentType: string;
  document: string;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signUp: (data: SignUpData) => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: AuthError | null }>;
  resetPasswordByDocument: (documentType: string, document: string) => Promise<{ success: boolean; error: AuthError | null }>;
  signInWithGoogle: () => Promise<{ error: AuthError | null }>;
  updateProfile: (data: UpdateProfileData) => Promise<{ error: Error | null }>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        console.error('Erro ao buscar perfil:', error);
        return;
      }

      setProfile(data);
    } catch (error) {
      console.error('Erro ao buscar perfil:', error);
    }
  };

  useEffect(() => {
    // 1. Configurar listener PRIMEIRO
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        // Guard: contas de cliente final não podem usar o app de estabelecimento.
        // No cardápio público (/cardapio/*) elas DEVEM permanecer logadas.
        const role = (session?.user?.user_metadata as any)?.role;
        const isPublicMenu =
          typeof window !== "undefined" &&
          window.location.pathname.startsWith("/cardapio");

        if (session?.user && role === "delivery_customer") {
          if (!isPublicMenu) {
            supabase.auth.signOut();
            setSession(null);
            setUser(null);
            setProfile(null);
            return;
          }
          // No cardápio público: mantém sessão, sem buscar profile (cliente não tem)
          setSession(session);
          setUser(session.user);
          setProfile(null);
          return;
        }

        setSession(session);
        setUser(session?.user ?? null);

        // 2. Buscar perfil se houver usuário (com setTimeout para evitar deadlock)
        if (session?.user) {
          setTimeout(() => {
            fetchProfile(session.user.id);
          }, 0);
        } else {
          setProfile(null);
        }
      }
    );


    // 3. DEPOIS verificar sessão existente
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (!error && data.user) {
      const role = (data.user.user_metadata as any)?.role;
      if (role === "delivery_customer") {
        await supabase.auth.signOut();
        return {
          error: {
            name: "AuthApiError",
            message: "Esta conta é de cliente final. Use o cardápio público para entrar.",
            status: 403,
          } as unknown as AuthError,
        };
      }
    }

    return { error };
  };

  const signUp = async (data: SignUpData) => {
    const { error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: {
          full_name: data.name,
          document_type: data.documentType,
          document: data.document,
        }
      }
    });
    
    return { error };
  };

  const signOut = async () => {
    // Limpa estado local imediatamente para UX instantânea
    setUser(null);
    setSession(null);
    setProfile(null);
    // Limpa storage local rapidamente (sem chamada de rede)
    await supabase.auth.signOut({ scope: "local" });
    // Revoga refresh tokens no servidor em background
    supabase.auth.signOut({ scope: "global" }).catch(() => {});
  };

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/`,
    });
    
    return { error };
  };

  const resetPasswordByDocument = async (documentType: string, document: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('reset-password-by-document', {
        body: { documentType, document }
      });

      if (error) {
        console.error('Erro ao invocar função:', error);
        return { success: false, error };
      }

      return { success: true, error: null };
    } catch (error: any) {
      console.error('Erro inesperado:', error);
      return { success: false, error };
    }
  };

  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/`,
      }
    });
    
    return { error };
  };

  const updateProfile = async (data: UpdateProfileData) => {
    if (!user) {
      return { error: new Error('Usuário não autenticado') };
    }

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          ...data,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (error) throw error;

      // Atualizar estado local
      await fetchProfile(user.id);

      return { error: null };
    } catch (error: any) {
      console.error('Erro ao atualizar perfil:', error);
      return { error };
    }
  };

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user.id);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        loading,
        signIn,
        signUp,
        signOut,
        resetPassword,
        resetPasswordByDocument,
        signInWithGoogle,
        updateProfile,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
