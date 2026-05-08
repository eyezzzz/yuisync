export function calculateSavedPercentage(hoursSaved, totalHours) {
  const saved = Number(hoursSaved || 0)
  const total = Number(totalHours || 0)

  if (!Number.isFinite(saved) || !Number.isFinite(total) || total <= 0) {
    return 0
  }

  return (saved / total) * 100
}

export function formatHours(hours) {
  const value = Number(hours || 0)
  const safe = Number.isFinite(value) ? value : 0

  return `${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(safe)}h`
}

export function formatPercentage(percentage) {
  const value = Number(percentage || 0)
  const safe = Number.isFinite(value) ? value : 0

  return `${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(safe)}%`
}

function toLocalDateKey(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function toHourLabel(hour) {
  return `${String(hour).padStart(2, '0')}:00`
}

export function buildAIHoursFromScopedSessions(sessions = [], options = {}) {
  const {
    totalHours = 8,
    startHour = 8,
    endHour = 17,
    savingPerSession = 0.4,
    now = new Date(),
  } = options

  const todayKey = toLocalDateKey(now)
  const todaySessions = sessions.filter((session) => {
    const openedAt = session?.opened_at || session?.last_message_at
    if (!openedAt) return false
    return toLocalDateKey(openedAt) === todayKey
  })

  const buckets = new Map()
  for (let hour = startHour; hour <= endHour; hour += 1) {
    buckets.set(hour, 0)
  }

  todaySessions.forEach((session) => {
    const openedAt = new Date(session?.opened_at || session?.last_message_at)
    if (Number.isNaN(openedAt.getTime())) return
    const hour = openedAt.getHours()
    if (!buckets.has(hour)) return
    buckets.set(hour, buckets.get(hour) + 1)
  })

  let cumulative = 0
  const series = Array.from(buckets.entries()).map(([hour, count]) => {
    cumulative += count * savingPerSession
    return {
      time: toHourLabel(hour),
      saved: Number(cumulative.toFixed(1)),
    }
  })

  const savedHoursRaw = todaySessions.length * savingPerSession
  const savedHours = Number(Math.min(savedHoursRaw, totalHours).toFixed(1))

  return { totalHours, savedHours, series }
}
