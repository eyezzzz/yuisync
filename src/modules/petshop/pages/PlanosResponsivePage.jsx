import PlanosCheckoutIntegratedPage from './PlanosCheckoutIntegratedPage'
import './PlanosResponsivePage.css'

export default function PlanosResponsivePage(props) {
  return (
    <div className="planos-responsive-shell">
      <PlanosCheckoutIntegratedPage {...props} />
    </div>
  )
}
