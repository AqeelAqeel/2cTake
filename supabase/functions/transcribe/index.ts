// Supabase Edge Function: transcribe
// Triggered after a recording upload to generate a transcript via OpenAI Whisper
//
// Deploy: supabase functions deploy transcribe
// Env vars needed:
//   OPENAI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// R2 env vars (optional — enables R2 primary read with Supabase fallback):
//   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_RECORDINGS_BUCKET

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.20'

/**
 * Downloads a recording blob, preferring Cloudflare R2 when the R2_* env
 * vars are configured. Falls back to Supabase Storage on 404 or missing
 * config so the function keeps working during the migration cutover.
 */
async function downloadRecording(
  supabase: ReturnType<typeof createClient>,
  videoPath: string
): Promise<Blob> {
  const accountId = Deno.env.get('R2_ACCOUNT_ID')
  const accessKeyId = Deno.env.get('R2_ACCESS_KEY_ID')
  const secretAccessKey = Deno.env.get('R2_SECRET_ACCESS_KEY')
  const bucket = Deno.env.get('R2_RECORDINGS_BUCKET')

  if (accountId && accessKeyId && secretAccessKey && bucket) {
    try {
      const r2 = new AwsClient({
        accessKeyId,
        secretAccessKey,
        service: 's3',
        region: 'auto',
      })
      const url = `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${videoPath}`
      const r2Res = await r2.fetch(url, { method: 'GET' })
      if (r2Res.ok) {
        return await r2Res.blob()
      }
      // 404 means the object isn't in R2 yet — fall through to Supabase
      if (r2Res.status !== 404) {
        console.warn(`R2 GET returned ${r2Res.status}, falling back to Supabase`)
      }
    } catch (err) {
      console.warn('R2 GET threw, falling back to Supabase:', err)
    }
  }

  const { data, error } = await supabase.storage
    .from('recordings')
    .download(videoPath)
  if (error || !data) {
    throw new Error(`Failed to download video: ${error?.message ?? 'not found'}`)
  }
  return data
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const apiKey = Deno.env.get('OPENAI_API_KEY')
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'OPENAI_API_KEY not configured in Supabase secrets' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { recording_id, video_path } = await req.json()

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Update recording status
    await supabase
      .from('recordings')
      .update({ status: 'transcribing' })
      .eq('id', recording_id)

    // Create pending transcript row
    await supabase
      .from('transcripts')
      .insert({
        recording_id,
        status: 'processing',
      })

    // Download video (R2 primary, Supabase fallback during migration)
    const videoBlob = await downloadRecording(supabase, video_path)

    // Send to OpenAI Whisper API
    const formData = new FormData()
    formData.append('file', videoBlob, 'recording.webm')
    formData.append('model', 'whisper-1')
    formData.append('response_format', 'verbose_json')
    formData.append('timestamp_granularities[]', 'segment')

    const whisperResponse = await fetch(
      'https://api.openai.com/v1/audio/transcriptions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: formData,
      }
    )

    if (!whisperResponse.ok) {
      const errorBody = await whisperResponse.text()
      console.error('Whisper API error body:', errorBody)
      throw new Error(`Whisper API error ${whisperResponse.status}: ${errorBody}`)
    }

    const result = await whisperResponse.json()

    // Parse segments into our format
    const segments = (result.segments || []).map((seg: { start: number; end: number; text: string }) => ({
      start: Math.floor(seg.start),
      end: Math.floor(seg.end),
      text: seg.text.trim(),
    }))

    // Update transcript
    await supabase
      .from('transcripts')
      .update({
        text: result.text || '',
        timestamps_json: segments,
        status: 'complete',
      })
      .eq('recording_id', recording_id)

    // Update recording status
    await supabase
      .from('recordings')
      .update({ status: 'complete' })
      .eq('id', recording_id)

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Transcription error:', error)

    // Try to mark as failed
    try {
      const { recording_id } = await req.clone().json()
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      )
      await supabase
        .from('transcripts')
        .update({ status: 'failed' })
        .eq('recording_id', recording_id)
      await supabase
        .from('recordings')
        .update({ status: 'failed' })
        .eq('id', recording_id)
    } catch {
      // Best effort
    }

    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
