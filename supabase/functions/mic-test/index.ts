// Supabase Edge Function: mic-test
// Receives an audio blob, sends to OpenAI Whisper, returns transcription text.
// Used by the reviewer onboarding to verify microphone quality.
//
// Deploy: supabase functions deploy mic-test
// Env vars needed: OPENAI_API_KEY

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const audioBlob = await req.blob()

    if (audioBlob.size === 0) {
      throw new Error('No audio data received')
    }

    const formData = new FormData()
    formData.append('file', audioBlob, 'mic-test.webm')
    formData.append('model', 'whisper-1')
    formData.append('response_format', 'json')

    const whisperResponse = await fetch(
      'https://api.openai.com/v1/audio/transcriptions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
        },
        body: formData,
      }
    )

    if (!whisperResponse.ok) {
      const errorText = await whisperResponse.text()
      throw new Error(`Whisper API error ${whisperResponse.status}: ${errorText}`)
    }

    const result = await whisperResponse.json()

    return new Response(
      JSON.stringify({ text: result.text || '' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Mic test error:', error)
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
