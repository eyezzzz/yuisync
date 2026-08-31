/**
 * A Print iD controla avanço e corte pelo próprio driver. O navegador só
 * prepara o recibo em 80mm e não deve forçar uma altura de página via CSS.
 */
export function printThermalReceipt(printWindow) {
  if (!printWindow || printWindow.closed) return false

  let printStarted = false
  let closeScheduled = false

  const closeAfterPrint = () => {
    if (closeScheduled) return
    closeScheduled = true
    setTimeout(() => {
      try {
        if (!printWindow.closed) printWindow.close()
      } catch {
        // A impressão já foi entregue ao navegador; falha ao fechar a aba não deve afetá-la.
      }
    }, 400)
  }

  const printWhenReady = () => {
    if (printStarted || printWindow.closed) return
    printStarted = true

    try {
      if (typeof printWindow.addEventListener === 'function') {
        printWindow.addEventListener('afterprint', closeAfterPrint, { once: true })
      } else {
        printWindow.onafterprint = closeAfterPrint
      }
      printWindow.focus()
      printWindow.print()
    } catch (error) {
      printStarted = false
      throw error
    }
  }

  const nextFrame = typeof printWindow.requestAnimationFrame === 'function'
    ? (callback) => printWindow.requestAnimationFrame(callback)
    : (callback) => setTimeout(callback, 0)

  nextFrame(() => {
    const images = [...printWindow.document.images]
    if (images.length === 0 || images.every((image) => image.complete)) {
      setTimeout(printWhenReady, 180)
      return
    }

    let readyTriggered = false
    let remaining = images.filter((image) => !image.complete).length
    const finish = () => {
      if (readyTriggered) return
      remaining -= 1
      if (remaining > 0) return
      readyTriggered = true
      printWhenReady()
    }

    images
      .filter((image) => !image.complete)
      .forEach((image) => {
        image.addEventListener('load', finish, { once: true })
        image.addEventListener('error', finish, { once: true })
      })

    // Se a logo travar na rede, ainda abre a impressão sem encerrar a janela antes da hora.
    setTimeout(() => {
      if (readyTriggered) return
      readyTriggered = true
      printWhenReady()
    }, 1200)
  })

  return true
}
