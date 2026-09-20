import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { sendMail } from "../_shared/smtp-mailer.ts";
import { corpoDoEmailDeSenha } from "../_shared/password-reset-email.ts";

/** Destinos aceitos para o link do e-mail. */
const ORIGENS_PERMITIDAS = ["https://pdv.velaraia.app", "http://localhost:8080"];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { documentType, document } = await req.json();

    console.log("Reset password by document request received:", { documentType, documentLength: document?.length });

    // Validação
    if (!documentType || !document) {
      console.error("Invalid data received");
      // Retornar sucesso por segurança (não revelar falha de validação)
      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Cliente com service_role para acessar auth.users
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // 1. Buscar perfil pelo documento
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("document_type", documentType)
      .eq("document", document)
      .maybeSingle();

    if (profileError) {
      console.error("Error fetching profile:", profileError);
      // Retornar sucesso por segurança
      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Se encontrou, buscar email e enviar link
    if (profile) {
      console.log("Profile found, fetching user data");
      
      const { data: { user }, error: userError } = await supabaseAdmin.auth.admin.getUserById(
        profile.id
      );

      if (!userError && user?.email) {
        console.log("User found, generating reset link");
        
        // 3. Gerar o link e MANDAR o e-mail.
        //    `generateLink` só devolve o endereço, não envia nada: antes o link
        //    era gerado e jogado fora, então ninguém nunca recebeu a mensagem.
        const origem = req.headers.get('origin');
        const destino = origem && ORIGENS_PERMITIDAS.includes(origem)
          ? `${origem}/redefinir-senha`
          : `${ORIGENS_PERMITIDAS[0]}/redefinir-senha`;

        const { data: linkData, error: resetError } = await supabaseAdmin.auth.admin.generateLink({
          type: 'recovery',
          email: user.email,
          options: { redirectTo: destino },
        });

        if (resetError || !linkData?.properties?.action_link) {
          console.error("Error generating reset link:", resetError);
        } else {
          try {
            await sendMail({
              to: user.email,
              subject: "Redefinir sua senha",
              html: corpoDoEmailDeSenha(
                linkData.properties.action_link,
                (user.user_metadata?.full_name as string | undefined) ?? null,
              ),
            });
            console.log("Reset email sent");
          } catch (smtpErr) {
            console.error("SMTP error sending reset email:", smtpErr);
          }
        }
      } else {
        console.log("User not found or error:", userError);
      }
    } else {
      console.log("No profile found for provided document");
    }

    // Sempre retornar sucesso (segurança - não revelar se existe ou não)
    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Unexpected error in reset-password-by-document:", error);
    // Retornar sucesso mesmo com erro (segurança)
    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
