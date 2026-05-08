import childProcess from 'node:child_process'
import { syncBuiltinESMExports } from 'node:module'
import react from '@vitejs/plugin-react'

if (process.platform === 'win32') {
  const originalExec = childProcess.exec

  childProcess.exec = function patchedExec(command, ...args) {
    if (typeof command === 'string' && command.trim().toLowerCase() === 'net use') {
      const callback = args.find((arg) => typeof arg === 'function')
      if (callback) {
        queueMicrotask(() => callback(new Error('Skipping net use on Windows bootstrap'), '', ''))
      }

      return {
        pid: undefined,
        kill() { return false },
        on() { return this },
        once() { return this },
        emit() { return false },
        removeListener() { return this },
      }
    }

    return originalExec.call(this, command, ...args)
  }

  syncBuiltinESMExports()
}

const { createServer } = await import('vite')

const port = Number(process.env.VITE_PORT || 3080)
const apiTarget = process.env.VITE_PROXY_TARGET || 'http://localhost:3090'

const server = await createServer({
  configFile: false,
  plugins: [react()],
  server: {
    port,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
      },
    },
    hmr: {
      overlay: false,
    },
  },
})

await server.listen()
server.printUrls()
