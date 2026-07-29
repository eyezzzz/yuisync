import { useCallback, useEffect, useState } from 'react'

import PackageActivationReliablePanel from './PackageActivationReliablePanel'
import PlanosNativePage from './PlanosNativePage'

export default function PlanosCheckoutIntegratedPage({ setPage }) {
  const [checkoutVersion, setCheckoutVersion] = useState(0)
  const [plansVersion, setPlansVersion] = useState(0)

  useEffect(() => {
    const onPendingPayment = () => {
      setCheckoutVersion((current) => current + 1)
    }
    window.addEventListener('yuisync:subscription-pending-payment', onPendingPayment)
    return () => window.removeEventListener('yuisync:subscription-pending-payment', onPendingPayment)
  }, [])

  const handlePageChange = useCallback((nextPage) => {
    if (nextPage === 'ordens') {
      setCheckoutVersion((current) => current + 1)
      return
    }
    setPage?.(nextPage)
  }, [setPage])

  const handleCheckoutChanged = useCallback(() => {
    setCheckoutVersion((current) => current + 1)
    setPlansVersion((current) => current + 1)
  }, [])

  return (
    <>
      <PlanosNativePage key={plansVersion} setPage={handlePageChange} />
      <div className="page animate-fade-up pt-0" data-yuisync-plans-checkout-section>
        <PackageActivationReliablePanel
          key={checkoutVersion}
          onChanged={handleCheckoutChanged}
        />
      </div>
    </>
  )
}
