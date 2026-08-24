import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  resolveTenantChannel, sendText, sendTemplate, toWhatsAppNumber, isChannelError,
  achatarParametro,
} from '../_shared/whatsapp/index.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Authenticate user from JWT
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Não autorizado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    // Get user from auth token
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    })
    const { data: { user }, error: authError } = await userClient.auth.getUser()

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Usuário não autenticado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { quotationId, suppliers, itemIds, generateOnly } = await req.json()

    if (!suppliers || !Array.isArray(suppliers) || suppliers.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Lista de fornecedores é obrigatória' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    if (!quotationId) {
      return new Response(
        JSON.stringify({ error: 'quotationId é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const appOrigin = (Deno.env.get('PUBLIC_APP_ORIGIN') ?? 'https://pdv.velaraia.app').replace(/\/$/, '')

    // Garante um link público (token) por (cotação + fornecedor) e devolve a URL.
    async function ensureLinkUrl(supplierId: string): Promise<string | null> {
      const { data: existing } = await supabase
        .from('pdv_quotation_supplier_links')
        .select('token')
        .eq('quotation_request_id', quotationId)
        .eq('supplier_id', supplierId)
        .maybeSingle()
      let token = existing?.token as string | undefined
      if (!token) {
        const { data: created, error: cErr } = await supabase
          .from('pdv_quotation_supplier_links')
          .insert({ user_id: user.id, quotation_request_id: quotationId, supplier_id: supplierId })
          .select('token')
          .single()
        if (cErr) { console.error('link create error:', cErr.message); return null }
        token = created?.token
      }
      // /l/cotacao/ passa pelo og-cotacao (preview rico no WhatsApp) e redireciona
      // o fornecedor para o formulário. Mantém o domínio bonito pdv.velaraia.app.
      return token ? `${appOrigin}/l/cotacao/${token}` : null
    }

    const links: { supplierId: string; name?: string; url: string }[] = []

    // Modo "só gerar links" (copiar/QR no painel), sem enviar WhatsApp.
    if (generateOnly) {
      for (const supplier of suppliers) {
        const url = await ensureLinkUrl(supplier.supplierId)
        if (url) links.push({ supplierId: supplier.supplierId, name: supplier.name, url })
      }
      return new Response(
        JSON.stringify({ success: true, sent: 0, errors: [], total: suppliers.length, links }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Uma resolução só, com fallback para o dono do estabelecimento e o guard
    // de configuração do provedor. Antes eram três blocos aqui, dois deles
    // checando a mesma condição.
    const resolved = await resolveTenantChannel(supabase, user.id)
    if (isChannelError(resolved)) {
      return new Response(
        JSON.stringify({ error: resolved.error.errorMessage, code: resolved.error.errorCode }),
        { status: resolved.error.errorCode === 'no_connection' ? 400 : 503,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    const channel = resolved

    // Canal oficial (número da Velara na Meta): fora da janela de 24h a Meta só
    // aceita modelo aprovado. Fornecedor de cotação nova está SEMPRE fora dela,
    // então texto livre ali não chega — vai por `cotacao_fornecedor`.
    const usaModelo = channel.provider === 'sellgrid' || channel.provider === 'cloud'

    const sent: string[] = []
    const errors: { supplierId: string; phone: string; error: string }[] = []

    // Send message to each supplier
    for (const supplier of suppliers) {
      const { supplierId, phone, message } = supplier

      if (!phone) {
        errors.push({ supplierId, phone: phone || '', error: 'Telefone ausente' })
        continue
      }

      // Gera/pega o link público do fornecedor para esta cotação.
      const url = await ensureLinkUrl(supplierId)
      if (!url) {
        errors.push({ supplierId, phone, error: 'Falha ao gerar link do orçamento' })
        continue
      }
      links.push({ supplierId, name: supplier.name, url })

      // A mensagem passa a apontar para o formulário (não pede mais preços no texto).
      const baseMessage = (message && String(message).trim())
        ? String(message).trim()
        : 'Olá! Segue nossa solicitação de cotação.'
      const fullMessage = `${baseMessage}\n\n👉 *Preencha seu orçamento aqui:*\n${url}`

      const formattedPhone = toWhatsAppNumber(phone)

      const ctx = {
        purpose: 'quotation' as const,
        entityType: 'quotation_request',
        entityId: quotationId,
        supplierId,
      }

      // Os valores das variáveis vêm da tela, os MESMOS que o lojista viu no
      // preview antes de clicar em enviar. Montá-los de novo aqui abriria a
      // porta para a tela mostrar uma coisa e o fornecedor receber outra.
      const params: string[] = Array.isArray(supplier.templateParams)
        ? supplier.templateParams.map((v: unknown) => achatarParametro(v))
        : []

      let outcome
      if (usaModelo && params.length === 7) {
        outcome = await sendTemplate(supabase, channel, phone, {
          name: 'cotacao_fornecedor',
          language: 'pt_BR',
          bodyParams: params,
          // O token só existe depois de criado o link, logo acima. É ele que
          // entra colado no fim da URL do botão.
          urlButtonParam: url.split('/').pop(),
        }, ctx)
      } else {
        if (usaModelo) {
          console.warn('[cotacao] canal oficial sem variáveis do modelo; caindo para texto livre')
        }
        outcome = await sendText(supabase, channel, phone, fullMessage, ctx)
      }

      if (outcome.ok) {
        sent.push(supplierId)
      } else {
        errors.push({
          supplierId,
          phone: formattedPhone,
          error: outcome.errorMessage ?? outcome.errorCode ?? 'Falha no envio',
        })
      }
    }

    // Marca sent_at nos vínculos enviados (link) e nos itens (compat).
    if (sent.length > 0) {
      await supabase
        .from('pdv_quotation_supplier_links')
        .update({ sent_at: new Date().toISOString() })
        .eq('quotation_request_id', quotationId)
        .in('supplier_id', sent)

      if (itemIds && itemIds.length > 0) {
        const { error: updateError } = await supabase
          .from('pdv_quotation_item_suppliers')
          .update({ sent_at: new Date().toISOString() })
          .in('quotation_item_id', itemIds)
          .in('supplier_id', sent)
        if (updateError) console.error('Error updating sent_at:', updateError)
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        sent: sent.length,
        errors,
        total: suppliers.length,
        links,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in send-quotation-whatsapp:', error)
    return new Response(
      JSON.stringify({ error: 'Erro interno do servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
