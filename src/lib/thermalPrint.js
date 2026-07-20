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
  nextFrame(() => {
    const images = [...printWindow.document.images]
    if (images.length === 0 || images.every((image) => image.complete)) {
      setTimeout(printWhenReady, 180)
      return
    }

    let printed = false
    const finish = () => {
      if (printed) return
      printed = true
      printWhenReady()
    }
    images.forEach((image) => {
      image.addEventListener('load', finish, { once: true })
      image.addEventListener('error', finish, { once: true })
    })
    setTimeout(finish, 900)
  })
}
