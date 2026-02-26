import * as pdfjsLib from 'pdfjs-dist'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString()

export async function renderPdfPage(
  url: string,
  pageNumber = 1,
  scale = 2
): Promise<{ dataUrl: string; width: number; height: number; pageCount: number }> {
  const pdf = await pdfjsLib.getDocument(url).promise
  const page = await pdf.getPage(pageNumber)
  const viewport = page.getViewport({ scale })

  const offscreen = document.createElement('canvas')
  offscreen.width = viewport.width
  offscreen.height = viewport.height
  const ctx = offscreen.getContext('2d')!

  await page.render({ canvasContext: ctx, viewport }).promise

  return {
    dataUrl: offscreen.toDataURL('image/png'),
    width: viewport.width,
    height: viewport.height,
    pageCount: pdf.numPages,
  }
}

/**
 * Render ALL pages of a PDF into a single vertically-stacked image.
 * Pages are separated by a gap and centered horizontally.
 * Scale adjusts based on page count to prevent excessive memory usage.
 */
export async function renderAllPdfPages(
  url: string,
  scale?: number,
  gap = 12
): Promise<{ dataUrl: string; width: number; height: number; pageCount: number }> {
  const pdf = await pdfjsLib.getDocument(url).promise
  const pageCount = pdf.numPages

  // Auto-scale based on page count if not explicitly set
  if (scale === undefined) {
    if (pageCount <= 5) scale = 2
    else if (pageCount <= 15) scale = 1.5
    else scale = 1
  }

  // Render each page to its own offscreen canvas
  const pages: { canvas: HTMLCanvasElement; width: number; height: number }[] = []
  let maxWidth = 0
  let totalHeight = 0

  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i)
    const viewport = page.getViewport({ scale })

    const offscreen = document.createElement('canvas')
    offscreen.width = viewport.width
    offscreen.height = viewport.height
    const ctx = offscreen.getContext('2d')!

    await page.render({ canvasContext: ctx, viewport }).promise

    pages.push({ canvas: offscreen, width: viewport.width, height: viewport.height })
    maxWidth = Math.max(maxWidth, viewport.width)
    totalHeight += viewport.height
  }

  // Add gaps between pages
  totalHeight += gap * (pageCount - 1)

  // Composite all pages into one tall canvas
  const composite = document.createElement('canvas')
  composite.width = maxWidth
  composite.height = totalHeight
  const ctx = composite.getContext('2d')!

  // Fill gap areas with a subtle background
  ctx.fillStyle = '#e2e8f0'
  ctx.fillRect(0, 0, maxWidth, totalHeight)

  let y = 0
  for (const page of pages) {
    // Center narrower pages horizontally
    const x = (maxWidth - page.width) / 2
    // White background for the page content
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(x, y, page.width, page.height)
    ctx.drawImage(page.canvas, x, y)
    y += page.height + gap
  }

  return {
    dataUrl: composite.toDataURL('image/png'),
    width: maxWidth,
    height: totalHeight,
    pageCount,
  }
}
