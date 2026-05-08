import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import { resolveCategoryMeta } from '../shared/lib/productCategories'

export function ProductCategorySelect({
  value,
  onChange,
  options,
  placeholder = 'Selecionar categoria',
  allowEmpty = false,
  emptyLabel = 'Todas as categorias',
  className = '',
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function handleClickOutside(event) {
      if (!ref.current?.contains(event.target)) setOpen(false)
    }

    function handleEscape(event) {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [])

  const selectedMeta = value ? resolveCategoryMeta(value) : null
  const SelectedIcon = selectedMeta?.icon

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="inp flex items-center justify-between gap-3 py-2"
      >
        <span className="flex min-w-0 items-center gap-3">
          {SelectedIcon ? (
            <span className={`flex h-9 w-9 items-center justify-center rounded-xl shadow-sm ${selectedMeta.tileClassName}`}>
              <SelectedIcon size={16} />
            </span>
          ) : (
            <span className="text-sm text-muted">{placeholder}</span>
          )}
          <span className="truncate text-left text-sm font-semibold text-text">
            {selectedMeta?.label || emptyLabel || placeholder}
          </span>
        </span>
        <ChevronDown size={16} className={`text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 w-full overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-2 shadow-2xl">
          {allowEmpty && (
            <button
              type="button"
              onClick={() => {
                onChange('')
                setOpen(false)
              }}
              className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm text-muted transition-colors hover:bg-white/5 hover:text-text"
            >
              <span>{emptyLabel}</span>
              {!value && <Check size={15} className="text-[var(--primary)]" />}
            </button>
          )}

          <div className="max-h-72 overflow-y-auto">
            {options.map((option) => {
              const meta = resolveCategoryMeta(option)
              const Icon = meta.icon
              const isSelected = option === value

              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    onChange(option)
                    setOpen(false)
                  }}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left transition-colors ${
                    isSelected ? 'bg-white/8' : 'hover:bg-white/5'
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <span className={`flex h-9 w-9 items-center justify-center rounded-xl shadow-sm ${meta.tileClassName}`}>
                      <Icon size={16} />
                    </span>
                    <span className="text-sm font-semibold text-text">{meta.label}</span>
                  </span>
                  {isSelected && <Check size={15} className="text-[var(--primary)]" />}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
