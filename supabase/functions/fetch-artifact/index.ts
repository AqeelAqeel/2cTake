// Supabase Edge Function: fetch-artifact
// Fetches a URL (Google Docs/Slides or generic webpage), converts to PDF or screenshot,
// and uploads to the artifacts storage bucket.
//
// Deploy: supabase functions deploy fetch-artifact
// Env vars needed: FIRECRAWL_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MAX_SIZE_BYTES = 50 * 1024 * 1024 // 50 MB

interface UrlDetection {
  type: 'google_docs' | 'google_slides' | 'generic'
  docId?: string
}

function detectUrlType(url: string): UrlDetection {
  const docsMatch = url.match(
    /docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/
  )
  if (docsMatch) {
    return { type: 'google_docs', docId: docsMatch[1] }
  }

  const slidesMatch = url.match(
    /docs\.google\.com\/presentation\/d\/([a-zA-Z0-9_-]+)/
  )
  if (slidesMatch) {
    return { type: 'google_slides', docId: slidesMatch[1] }
  }

  return { type: 'generic' }
}

async function fetchGoogleExport(
  docId: string,
  docType: 'google_docs' | 'google_slides'
): Promise<{ blob: Blob; ext: string }> {
  const base =
    docType === 'google_docs'
      ? `https://docs.google.com/document/d/${docId}/export?format=pdf`
      : `https://docs.google.com/presentation/d/${docId}/export?format=pdf`

  const response = await fetch(base, { redirect: 'follow' })

  if (!response.ok) {
    if (response.status === 404) {
      throw new UserError('Document not found. Check the URL and try again.', 'NOT_FOUND')
    }
    throw new UserError(
      'Failed to export document. Make sure it is publicly shared.',
      'EXPORT_FAILED'
    )
  }

  const contentType = response.headers.get('content-type') || ''

  // If Google returns HTML instead of PDF, the document is private
  if (contentType.includes('text/html')) {
    throw new UserError(
      "This document is not publicly shared. Change sharing to 'Anyone with the link' and try again.",
      'GOOGLE_PRIVATE_DOC'
    )
  }

  const blob = await response.blob()

  if (blob.size > MAX_SIZE_BYTES) {
    throw new UserError(
      'The exported document is too large (max 50 MB).',
      'TOO_LARGE'
    )
  }

  return { blob, ext: 'pdf' }
}

async function fetchFirecrawlScreenshot(
  url: string
): Promise<{ blob: Blob; ext: string }> {
  const apiKey = Deno.env.get('FIRECRAWL_API_KEY')
  if (!apiKey) {
    throw new UserError(
      'Screenshot capture is not configured. Please upload a file instead.',
      'FIRECRAWL_NOT_CONFIGURED'
    )
  }

  const response = await fetch('https://api.firecrawl.dev/v2/scrape', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      url,
      formats: ['screenshot'],
    }),
  })

  if (response.status === 429) {
    throw new UserError(
      'Too many requests. Please wait a moment and try again.',
      'RATE_LIMITED'
    )
  }

  if (!response.ok) {
    const body = await response.text()
    console.error('Firecrawl error:', response.status, body)
    throw new UserError(
      'Failed to capture the web page. Check the URL and try again.',
      'FIRECRAWL_ERROR'
    )
  }

  const result = await response.json()
  const screenshotBase64 = result?.data?.screenshot

  if (!screenshotBase64) {
    throw new UserError(
      'Failed to capture a screenshot of this page. Try uploading a file instead.',
      'NO_SCREENSHOT'
    )
  }

  // Firecrawl returns a data URL like "data:image/png;base64,..." or just base64
  const base64Data = screenshotBase64.includes(',')
    ? screenshotBase64.split(',')[1]
    : screenshotBase64

  const binaryString = atob(base64Data)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  const blob = new Blob([bytes], { type: 'image/png' })

  if (blob.size > MAX_SIZE_BYTES) {
    throw new UserError(
      'The captured screenshot is too large (max 50 MB).',
      'TOO_LARGE'
    )
  }

  return { blob, ext: 'png' }
}

class UserError extends Error {
  code: string
  constructor(message: string, code: string) {
    super(message)
    this.code = code
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { url } = await req.json()

    if (!url || typeof url !== 'string') {
      return new Response(
        JSON.stringify({ error: 'A URL is required.', code: 'MISSING_URL' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Validate URL format
    try {
      new URL(url)
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid URL format.', code: 'INVALID_URL' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const detection = detectUrlType(url)

    let blob: Blob
    let ext: string

    if (
      (detection.type === 'google_docs' || detection.type === 'google_slides') &&
      detection.docId
    ) {
      const result = await fetchGoogleExport(detection.docId, detection.type)
      blob = result.blob
      ext = result.ext
    } else {
      const result = await fetchFirecrawlScreenshot(url)
      blob = result.blob
      ext = result.ext
    }

    // Upload to Supabase storage
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const storagePath = `${crypto.randomUUID()}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('artifacts')
      .upload(storagePath, blob, {
        contentType: ext === 'pdf' ? 'application/pdf' : 'image/png',
      })

    if (uploadError) {
      throw new Error(`Storage upload failed: ${uploadError.message}`)
    }

    const artifactType = ext === 'pdf' ? 'pdf' : 'image'

    return new Response(
      JSON.stringify({
        storage_path: storagePath,
        artifact_type: artifactType,
        source_type: detection.type,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('fetch-artifact error:', error)

    if (error instanceof UserError) {
      return new Response(
        JSON.stringify({ error: error.message, code: error.code }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
