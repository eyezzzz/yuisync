const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 }
const CURRENT_LEVEL = LOG_LEVELS[process.env.LOG_LEVEL || 'info'] || 1

function formatEntry(level, message, meta = {}) {
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    message,
    ...meta,
  })
}

export const logger = {
  debug(message, meta) {
    if (CURRENT_LEVEL <= LOG_LEVELS.debug) {
      process.stdout.write(formatEntry('debug', message, meta) + '\n')
    }
  },

  info(message, meta) {
    if (CURRENT_LEVEL <= LOG_LEVELS.info) {
      process.stdout.write(formatEntry('info', message, meta) + '\n')
    }
  },

  warn(message, meta) {
    if (CURRENT_LEVEL <= LOG_LEVELS.warn) {
      process.stderr.write(formatEntry('warn', message, meta) + '\n')
    }
  },

  error(message, meta) {
    if (CURRENT_LEVEL <= LOG_LEVELS.error) {
      const enriched = { ...meta }
      if (meta?.error instanceof Error) {
        enriched.error = {
          name: meta.error.name,
          message: meta.error.message,
          stack: meta.error.stack,
        }
      }
      process.stderr.write(formatEntry('error', message, enriched) + '\n')
    }
  },

  child(defaultMeta) {
    return {
      debug: (msg, meta) => logger.debug(msg, { ...defaultMeta, ...meta }),
      info: (msg, meta) => logger.info(msg, { ...defaultMeta, ...meta }),
      warn: (msg, meta) => logger.warn(msg, { ...defaultMeta, ...meta }),
      error: (msg, meta) => logger.error(msg, { ...defaultMeta, ...meta }),
    }
  },
}
