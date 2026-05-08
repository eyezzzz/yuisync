import { memo } from 'react'

const StarField = memo(({ count = 120, className = "text-blue-500" }) => {
  return (
    <div className={`star-field ${className} pointer-events-none`}>
      {[...Array(count)].map((_, i) => {
        const type = i % 3;
        const size = 0.8 + Math.random() * 2;
        return (
          <div key={i} className="star overflow-visible" style={{
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
            width: `${size}px`,
            height: `${size}px`,
            animationDelay: `${Math.random() * 20}s`,
            animationDuration: type === 0 ? `${25 + Math.random() * 30}s` : type === 1 ? `${6 + Math.random() * 10}s` : `${15 + Math.random() * 20}s`,
            animationName: type === 1 ? 'star-twinkle' : 'star-drift',
            opacity: 0.05 + Math.random() * 0.15
          }} />
        )
      })}
    </div>
  )
})

export default StarField
