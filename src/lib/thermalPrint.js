const PX_PER_MM = 96 / 25.4
const MIN_RECEIPT_HEIGHT_MM = 35
const MAX_RECEIPT_HEIGHT_MM = 140

/**
 * Ajusta a folha térmica ao conteúdo antes de abrir o diálogo nativo.
 * `auto` não é uma altura válida para `@page` no Chromium e alguns drivers
 * retornam ao A4. A prévia recebe primeiro um tamanho compacto e, quando o
 * navegador aceitar a atualização, a altura medida do conteúdo a substitui.
 */
export function printThermalReceipt(printWindow, { widthMm = 32 } = {}) {
  const printWhenReady = () => {
    const receipt = printWindow.document.querySelector('.receipt')
    const contentHeightPx = Math.max(
      receipt?.scrollHeight || 0,
      receipt?.getBoundingClientRect?.().height || 0,
    )
    const heightMm = Math.min(
      MAX_RECEIPT_HEIGHT_MM,
      Math.max(MIN_RECEIPT_HEIGHT_MM, Math.ceil(contentHeightPx / PX_PER_MM) + 3),
    )
    const pageStyle = printWindow.document.createElement('style')
    pageStyle.textContent = `@page { size: ${widthMm}mm ${heightMm}mm; margin: 0; }`
    printWindow.document.head.appendChild(pageStyle)
    printWindow.focus()
    printWindow.print()
    setTimeout(() => printWindow.close(), 100)
  }

  const nextFrame = printWindow.requestAnimationFrame || ((callback) => setTimeout(callback, 0))
  nextFrame(() => setTimeout(printWhenReady, 120))
}
