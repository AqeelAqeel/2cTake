// Supabase Edge Function: transcribe
// Triggered after a recording upload to generate a transcript via OpenAI Whisper
//
// Deploy: supabase functions deploy transcribe
// Env vars needed: OPENAI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

    // Download video from private storage using service role
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('recordings')
      .download(video_path)

    if (downloadError || !fileData) {
      throw new Error(`Failed to download video: ${downloadError?.message}`)
    }

    const videoBlob = fileData

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
