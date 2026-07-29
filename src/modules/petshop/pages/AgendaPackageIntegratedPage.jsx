import AgendaIntegratedPage from './AgendaIntegratedPage'
import AgendaBookingEnhancements from './AgendaBookingEnhancements'

const HIDE_LEGACY_PACKAGE_UI = `
  [data-yuisync-package-summary-root],
  [data-yuisync-package-picker-root],
  [data-yuisync-package-transport-root] {
    display: none !important;
  }
`

export default function AgendaPackageIntegratedPage({ setPage }) {
  return (
    <>
      <style>{HIDE_LEGACY_PACKAGE_UI}</style>
      <AgendaIntegratedPage setPage={setPage} />
      <AgendaBookingEnhancements />
    </>
  )
}
