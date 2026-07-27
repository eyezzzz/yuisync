from pathlib import Path

path = Path('src/modules/petshop/pages/AgendaPage.jsx')
text = path.read_text(encoding='utf-8')
old = """                      {serviceTotals.services.map((service) => {\n                        const Icon = service.icon || PawPrint\n                        return (\n"""
new = """                      {serviceTotals.services.map((service) => {\n                        const Icon = service.icon || PawPrint\n                        const displayedDuration = resolvePetshopServiceDuration({\n                          service,\n                          weightKg: selectedClient?.weight_kg ?? appt?.pets?.weight_kg ?? null,\n                          durations: serviceDurations,\n                          fallbackMin: service.duration || 60,\n                        })\n                        return (\n"""
if text.count(old) != 1:
    raise SystemExit(f'selected service block: expected 1 match, found {text.count(old)}')
text = text.replace(old, new, 1)
old_duration = "{fmtCurrency(service.price)} · {service.duration || 60} min"
# Replace only the occurrence inside the selected-services block, not the search dropdown.
block_start = text.index('const displayedDuration = resolvePetshopServiceDuration')
block_end = text.index('</div>\n                  ) : (', block_start)
block = text[block_start:block_end]
if block.count(old_duration) != 1:
    raise SystemExit(f'selected duration label: expected 1 match, found {block.count(old_duration)}')
block = block.replace(old_duration, '{fmtCurrency(service.price)} · {displayedDuration} min', 1)
text = text[:block_start] + block + text[block_end:]
path.write_text(text, encoding='utf-8')
