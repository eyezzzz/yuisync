import AgendaIntegratedPage from './AgendaIntegratedPage'
import AgendaBookingEnhancements from './AgendaBookingEnhancements'
import AgendaNativePackageControls from './AgendaNativePackageControls'

const NATIVE_PACKAGE_STYLES = `
  [data-yuisync-package-summary-root],
  [data-yuisync-package-picker-root] {
    display: none !important;
  }
`

export default function AgendaPackageIntegratedPage() {
  return (
    <>
      <style>{NATIVE_PACKAGE_STYLES}</style>
      <AgendaIntegratedPage />
      <AgendaBookingEnhancements />
      <AgendaNativePackageControls />
    </>
  )
}
