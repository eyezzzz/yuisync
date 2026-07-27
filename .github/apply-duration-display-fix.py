from pathlib import Path

path = Path('src/modules/petshop/pages/AgendaPage.jsx')
text = path.read_text(encoding='utf-8')

needle = "  const effectiveDuration = Math.max(10, Number(durationOverride || serviceTotals.duration || 0))\n"
replacement = """  const effectiveDuration = Math.max(10, Number(durationOverride || serviceTotals.duration || 0))
  const displayServiceDuration = (service) => serviceGroup === 'banho_tosa'
    ? resolvePetshopServiceDuration({
      service,
      weightKg: selectedClient?.weight_kg ?? appt?.pets?.weight_kg ?? null,
      durations: normalizeServiceDurations(serviceDurations),
      fallbackMin: service.duration || 60,
    })
    : Math.max(15, Number(service.duration || 60))
"""
if text.count(needle) != 1:
    raise SystemExit(f'effectiveDuration insertion point: expected 1, found {text.count(needle)}')
text = text.replace(needle, replacement, 1)

old = "{fmtCurrency(service.price)} · {service.duration || 60} min"
new = "{fmtCurrency(service.price)} · {displayServiceDuration(service)} min"
if text.count(old) != 2:
    raise SystemExit(f'duration labels: expected 2, found {text.count(old)}')
text = text.replace(old, new)

path.write_text(text, encoding='utf-8')
