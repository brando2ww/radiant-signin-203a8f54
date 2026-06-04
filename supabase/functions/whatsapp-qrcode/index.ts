import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

// Helper: call Evolution API with retries and proper error handling
async function evoFetch(
  url: string,
  apiKey: string,
  options: RequestInit = {},
  retries = 2
): Promise<{ ok: boolean; status: number; data: any }> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        ...options,
        headers: { 'apikey': apiKey, 'Content-Type': 'application/json', ...(options.headers || {}) },
      })
      let data: any = null
      try {
        data = await res.json()
      } catch {
        data = null
      }
      console.log(`[evo] ${options.method || 'GET'} ${url} → ${res.status}`, JSON.stringify(data)?.slice(0, 500))
      return { ok: res.ok, status: res.status, data }
    } catch (err) {
      console.error(`[evo] Attempt ${attempt + 1} failed for ${url}:`, err)
      if (attempt === retries) return { ok: false, status: 0, data: { error: String(err) } }
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)))
    }
  }
  return { ok: false, status: 0, data: { error: 'All retries failed' } }
}

// Helper: extract status from Evolution API instance data
function extractStatus(instances: any): { status: string; profileName: string | null; profilePictureUrl: string | null; ownerJid: string | null } {
  const inst = Array.isArray(instances) ? instances[0] : instances?.instance || instances
  const status = inst?.instance?.status || inst?.connectionStatus || inst?.state || 'disconnected'
  const profileName = inst?.instance?.profileName || inst?.profileName || null
  const profilePictureUrl = inst?.instance?.profilePictureUrl || inst?.profilePictureUrl || null
  const ownerJid = inst?.instance?.ownerJid || inst?.ownerJid || null
  return { status, profileName, profilePictureUrl, ownerJid }
}

// Helper: delete instance from Evolution (ignore errors)
async function deleteFromEvolution(baseUrl: string, apiKey: string, instanceName: string) {
  const enc = encodeURIComponent(instanceName)
  try {
    await evoFetch(`${baseUrl}/instance/logout/${enc}`, apiKey, { method: 'DELETE' }, 0)
  } catch { /* ignore */ }
  await evoFetch(`${baseUrl}/instance/delete/${enc}`, apiKey, { method: 'DELETE' }, 0)
}

// Helper: try to get QR code via /connect endpoint
async function fetchQRCode(baseUrl: string, apiKey: string, instanceName: string): Promise<string | null> {
  const enc = encodeURIComponent(instanceName)
  const res = await evoFetch(`${baseUrl}/instance/connect/${enc}`, apiKey, {}, 1)
  if (!res.ok) return null
  const b64 = res.data?.base64 || res.data?.qrcode?.base64 || res.data?.code || null
  if (!b64) return null
  // Remove data URI prefix if present
  return typeof b64 === 'string' ? b64.split(',').pop() || b64 : null
}

// Small delay helper
const delay = (ms: number) => new Promise(r => setTimeout(r, ms))

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const evolutionApiUrl = Deno.env.get('EVOLUTION_API_URL')
  const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY')

    if (!evolutionApiUrl || !evolutionApiKey) {
      console.error("Evolution não configurado");
      return new Response(
        JSON.stringify({ error: "WhatsApp não está configurado no servidor. Solicite ativação ao suporte.", code: "evolution_not_configured" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  if (!evolutionApiUrl || !evolutionApiKey) {
    return new Response(
      JSON.stringify({ error: 'Evolution API not configured' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)
  const url = new URL(req.url)
  const action = url.pathname.split('/').pop()

  try {
    const body = await req.json()
    const { userId, instanceName, connectionName, phoneNumber } = body

    if (!userId || !instanceName) {
      return new Response(
        JSON.stringify({ error: 'userId and instanceName are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const enc = encodeURIComponent(instanceName)
    const json = (data: any, status = 200) => new Response(
      JSON.stringify(data),
      { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

    // ============ GENERATE ============
    if (action === 'generate') {
      console.log(`[whatsapp-qrcode] Generate for instance: ${instanceName}`)

      // 1. Clean up ALL non-open connections for this user from DB
      await supabase.from('whatsapp_connections')
        .delete()
        .eq('user_id', userId)
        .neq('connection_status', 'open')

      // 2. Check if instance exists on Evolution
      const fetchRes = await evoFetch(
        `${evolutionApiUrl}/instance/fetchInstances?instanceName=${enc}`,
        evolutionApiKey, {}, 2
      )

      if (fetchRes.ok) {
        const { status: instStatus, profileName, profilePictureUrl, ownerJid } = extractStatus(fetchRes.data)

        // If already open, just update DB and return
        if (instStatus === 'open') {
          const phone = ownerJid?.split('@')[0] || phoneNumber
          await supabase.from('whatsapp_connections').upsert({
            user_id: userId, instance_name: instanceName,
            connection_name: connectionName || null,
            connection_status: 'open',
            profile_name: profileName, profile_picture_url: profilePictureUrl,
            phone_number: phone,
            connected_at: new Date().toISOString(),
            last_seen_at: new Date().toISOString()
          }, { onConflict: 'user_id,instance_name' })
          return json({ status: 'connected', profile_name: profileName, profile_picture_url: profilePictureUrl, phone_number: phone })
        }

        // If instance exists but NOT open → delete it and recreate clean
        const hasInstance = Array.isArray(fetchRes.data) ? fetchRes.data.length > 0 : !!fetchRes.data?.instance
        if (hasInstance) {
          console.log(`[whatsapp-qrcode] Stale instance found (${instStatus}), deleting...`)
          await deleteFromEvolution(evolutionApiUrl, evolutionApiKey, instanceName)
          await delay(1500) // give Evolution time to clean up
        }
      }

      // 3. Create fresh instance
      console.log('[whatsapp-qrcode] Creating new instance')
      const createRes = await evoFetch(
        `${evolutionApiUrl}/instance/create`,
        evolutionApiKey,
        {
          method: 'POST',
          body: JSON.stringify({
            instanceName,
            integration: 'WHATSAPP-BAILEYS',
            qrcode: true,
            number: phoneNumber || undefined
          })
        },
        2
      )

      if (!createRes.ok) {
        return json({ error: 'Failed to create instance', details: createRes.data }, 500)
      }

      // Check if QR came in create response
      const createQR = createRes.data?.qrcode?.base64 || createRes.data?.base64
      if (createQR) {
        const b64 = typeof createQR === 'string' ? createQR.split(',').pop() || createQR : createQR
        // Save connecting state
        await supabase.from('whatsapp_connections').upsert({
          user_id: userId, instance_name: instanceName,
          connection_name: connectionName || null,
          phone_number: phoneNumber || null,
          connection_status: 'connecting'
        }, { onConflict: 'user_id,instance_name' })
        return json({ status: 'pending', qrcode: b64 })
      }

      // 4. If no QR in create, try /connect up to 3 times
      for (let i = 0; i < 3; i++) {
        await delay(1500)
        const qr = await fetchQRCode(evolutionApiUrl, evolutionApiKey, instanceName)
        if (qr) {
          await supabase.from('whatsapp_connections').upsert({
            user_id: userId, instance_name: instanceName,
            connection_name: connectionName || null,
            phone_number: phoneNumber || null,
            connection_status: 'connecting'
          }, { onConflict: 'user_id,instance_name' })
          return json({ status: 'pending', qrcode: qr })
        }
      }

      return json({ error: 'QR Code not available. Try again in a few seconds.' }, 500)
    }

    // ============ STATUS ============
    if (action === 'status') {
      console.log(`[whatsapp-qrcode] Status for: ${instanceName}`)

      const fetchRes = await evoFetch(
        `${evolutionApiUrl}/instance/fetchInstances?instanceName=${enc}`,
        evolutionApiKey, {}, 2
      )

      // Instance doesn't exist at all
      if (!fetchRes.ok || (Array.isArray(fetchRes.data) && fetchRes.data.length === 0)) {
        // Mark DB as disconnected
        await supabase.from('whatsapp_connections').update({
          connection_status: 'disconnected'
        }).eq('user_id', userId).eq('instance_name', instanceName)
        return json({ status: 'disconnected' })
      }

      const { status: instStatus, profileName, profilePictureUrl, ownerJid } = extractStatus(fetchRes.data)

      // Connected!
      if (instStatus === 'open') {
        const phone = ownerJid?.split('@')[0] || phoneNumber || null
        await supabase.from('whatsapp_connections').update({
          connection_status: 'open',
          profile_name: profileName,
          profile_picture_url: profilePictureUrl,
          phone_number: phone,
          connected_at: new Date().toISOString(),
          last_seen_at: new Date().toISOString()
        }).eq('user_id', userId).eq('instance_name', instanceName)
        return json({ status: 'open', profile_name: profileName, profile_picture_url: profilePictureUrl, phone_number: phone })
      }

      // Still connecting → try to fetch a fresh QR code
      if (instStatus === 'connecting' || instStatus === 'close') {
        const qr = await fetchQRCode(evolutionApiUrl, evolutionApiKey, instanceName)
        if (qr) {
          return json({ status: 'pending', qrcode: qr })
        }

        // Check if the connection has been stuck for too long (> 3 min)
        const { data: conn } = await supabase.from('whatsapp_connections')
          .select('updated_at')
          .eq('user_id', userId)
          .eq('instance_name', instanceName)
          .maybeSingle()

        if (conn?.updated_at) {
          const elapsed = Date.now() - new Date(conn.updated_at).getTime()
          if (elapsed > 180_000) { // 3 minutes
            console.log('[whatsapp-qrcode] Connection stuck > 3min, marking disconnected')
            await supabase.from('whatsapp_connections').update({
              connection_status: 'disconnected'
            }).eq('user_id', userId).eq('instance_name', instanceName)
            return json({ status: 'stale', message: 'Connection expired. Please generate a new QR code.' })
          }
        }

        return json({ status: 'connecting' })
      }

      return json({ status: instStatus })
    }

    // ============ DISCONNECT ============
    if (action === 'disconnect') {
      console.log(`[whatsapp-qrcode] Disconnecting: ${instanceName}`)
      await evoFetch(`${evolutionApiUrl}/instance/logout/${enc}`, evolutionApiKey, { method: 'DELETE' }, 1)
      await supabase.from('whatsapp_connections').update({
        connection_status: 'disconnected',
        profile_name: null,
        profile_picture_url: null
      }).eq('user_id', userId).eq('instance_name', instanceName)
      return json({ status: 'disconnected' })
    }

    // ============ DELETE ============
    if (action === 'delete') {
      console.log(`[whatsapp-qrcode] Deleting: ${instanceName}`)
      await deleteFromEvolution(evolutionApiUrl, evolutionApiKey, instanceName)
      await supabase.from('whatsapp_connections')
        .delete()
        .eq('user_id', userId)
        .eq('instance_name', instanceName)
      return json({ status: 'deleted' })
    }

    return json({ error: 'Invalid action. Use: generate, status, disconnect, or delete' }, 400)

  } catch (error) {
    console.error('[whatsapp-qrcode] Error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
