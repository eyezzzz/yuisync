/**
 * A Print iD controla avanço e corte pelo próprio driver. O navegador só
 * prepara o recibo em 80mm e não deve forçar uma altura de página via CSS.
 */
export function printThermalReceipt(printWindow) {
  const printWhenReady = () => {
    printWindow.focus()
    printWindow.print()
    setTimeout(() => printWindow.close(), 100)
  }

  const nextFrame = printWindow.requestAnimationFrame || ((callback) => setTimeout(callback, 0))
  nextFrame(() => setTimeout(printWhenReady, 180))
}
