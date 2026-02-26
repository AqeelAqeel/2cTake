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
