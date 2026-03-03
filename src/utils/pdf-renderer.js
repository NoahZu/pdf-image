import * as pdfjsLib from 'pdfjs-dist'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).href

/**
 * @param {ArrayBuffer} arrayBuffer
 * @returns {Promise<import('pdfjs-dist').PDFDocumentProxy>}
 */
export async function loadPdf(arrayBuffer) {
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer })
  return await loadingTask.promise
}

/**
 * @param {import('pdfjs-dist').PDFDocumentProxy} pdfDoc
 * @param {number} pageNum - 1-based
 * @param {number} scale
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function renderPageToCanvas(pdfDoc, pageNum, scale) {
  const page = await pdfDoc.getPage(pageNum)
  const viewport = page.getViewport({ scale })

  const canvas = document.createElement('canvas')
  canvas.width = Math.floor(viewport.width)
  canvas.height = Math.floor(viewport.height)

  const ctx = canvas.getContext('2d')
  await page.render({ canvasContext: ctx, viewport }).promise
  return canvas
}

/**
 * @param {import('pdfjs-dist').PDFDocumentProxy} pdfDoc
 * @param {number} pageNum
 * @returns {Promise<string>} data URL
 */
export async function renderThumbnail(pdfDoc, pageNum) {
  const canvas = await renderPageToCanvas(pdfDoc, pageNum, 0.4)
  return canvas.toDataURL('image/jpeg', 0.7)
}

/**
 * @param {import('pdfjs-dist').PDFDocumentProxy} pdfDoc
 * @param {number[]} pageNums - 1-based page numbers
 * @param {number} scale
 * @param {'png' | 'jpeg'} format
 * @param {number} quality - JPEG quality 0-1
 * @param {number[]} cropPercents - per-page percentage of height to crop from bottom (0-80)
 * @param {(progress: number) => void} onProgress
 * @returns {Promise<Blob>}
 */
export async function stitchPages(pdfDoc, pageNums, scale, format, quality, cropPercents, onProgress) {
  const canvases = []
  let totalWidth = 0
  let totalHeight = 0

  for (let i = 0; i < pageNums.length; i++) {
    const canvas = await renderPageToCanvas(pdfDoc, pageNums[i], scale)
    const pct = Math.min(80, Math.max(0, cropPercents[i] || 0)) / 100
    const keepHeight = Math.max(1, Math.round(canvas.height * (1 - pct)))

    const cropped = document.createElement('canvas')
    cropped.width = canvas.width
    cropped.height = keepHeight
    cropped.getContext('2d').drawImage(canvas, 0, 0, canvas.width, keepHeight, 0, 0, canvas.width, keepHeight)

    canvases.push(cropped)
    totalWidth = Math.max(totalWidth, cropped.width)
    totalHeight += cropped.height
    onProgress?.((i + 1) / pageNums.length * 0.8)
  }

  const result = document.createElement('canvas')
  result.width = totalWidth
  result.height = totalHeight

  const ctx = result.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, totalWidth, totalHeight)

  let y = 0
  for (const c of canvases) {
    ctx.drawImage(c, 0, y)
    y += c.height
  }

  onProgress?.(0.9)

  const mimeType = format === 'png' ? 'image/png' : 'image/jpeg'
  return new Promise((resolve) => {
    result.toBlob(
      (blob) => {
        onProgress?.(1)
        resolve(blob)
      },
      mimeType,
      format === 'jpeg' ? quality : undefined
    )
  })
}
