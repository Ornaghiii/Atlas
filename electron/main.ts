import { app, BrowserWindow, dialog } from 'electron'
import { spawn, ChildProcess } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import * as http from 'http'

// ---------------------------------------------------------------------------
// Helper: logging
// ---------------------------------------------------------------------------
/**
 * Writes to both the console (visible in Dev_Mode / when launched from a
 * terminal) and a persistent log file inside the user's AppData folder, so
 * that failures can be diagnosed even when the packaged app is launched by
 * double-clicking the .exe (no console attached).
 */
const logFilePath = path.join(app.getPath('userData'), 'atlas.log')
function log(message: string): void {
  console.log(message)
  try {
    fs.mkdirSync(path.dirname(logFilePath), { recursive: true })
    fs.appendFileSync(logFilePath, `[${new Date().toISOString()}] ${message}\n`)
  } catch {
    // Logging must never crash the app.
  }
}

// ---------------------------------------------------------------------------
// Helper: resolveServerPath
// ---------------------------------------------------------------------------
/**
 * Returns the absolute path to the Express server entry point.
 * In Dev_Mode the source TypeScript file is used directly (via ts-node/tsx).
 * In Prod_Mode the compiled JS file inside the ASAR-unpacked resources is used.
 */
function resolveServerPath(isPackaged: boolean): string {
  if (isPackaged) {
    // Compiled output lives at dist-main/server/index.js, alongside
    // dist-main/electron/main.js (this file, once compiled). __dirname
    // here resolves correctly whether running loose or packed inside
    // app.asar, since Electron transparently reads files from asar.
    const resolved = path.join(__dirname, '..', 'server', 'index.js')
    log(`[diag] resolveServerPath -> ${resolved} (exists: ${fs.existsSync(resolved)})`)
    return resolved
  }
  return path.join(process.cwd(), 'server', 'index.ts')
}

/**
 * The `.prisma` client folder (dot-prefixed) is systematically dropped by
 * electron-builder's node_modules packaging step, regardless of "files"
 * glob patterns. As a workaround, `.prisma` and `@prisma/client` are
 * copied together via `extraResources` (a plain directory copy,
 * unaffected by that bug) into `resources/prisma-client/node_modules/`,
 * keeping them side-by-side so their internal cross-references (e.g.
 * `.prisma/client/index.js` requiring `@prisma/client/runtime/library.js`)
 * still resolve correctly. This NODE_PATH entry tells Node to also search
 * that folder when resolving `require('.prisma/client/default')`.
 */
function resolvePrismaClientNodePath(): string {
  const resolved = path.join(process.resourcesPath, 'prisma-client', 'node_modules')
  const engineExists = fs.existsSync(
    path.join(resolved, '.prisma', 'client', 'default.js'),
  )
  log(`[diag] NODE_PATH -> ${resolved} (.prisma/client/default.js exists: ${engineExists})`)
  return resolved
}

// ---------------------------------------------------------------------------
// Helper: waitForBackend
// ---------------------------------------------------------------------------
/**
 * Polls GET http://localhost:3333/api/health every `intervalMs` milliseconds
 * up to `maxAttempts` times, resolving to `true` when the backend responds
 * with { ok: true } and to `false` if the timeout is exhausted.
 */
async function waitForBackend(
  maxAttempts: number,
  intervalMs: number,
): Promise<boolean> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const ready = await new Promise<boolean>((resolve) => {
      const req = http.get('http://localhost:3333/api/health', (res) => {
        let body = ''
        res.on('data', (chunk) => (body += chunk))
        res.on('end', () => {
          try {
            const json = JSON.parse(body)
            resolve(json.ok === true)
          } catch {
            resolve(false)
          }
        })
      })
      req.on('error', () => resolve(false))
      req.setTimeout(intervalMs, () => {
        req.destroy()
        resolve(false)
      })
    })

    if (ready) {
      log('✔ Backend iniciado')
      log('✔ Banco conectado')
      return true
    }

    await new Promise<void>((resolve) => setTimeout(resolve, intervalMs))
  }
  return false
}

// ---------------------------------------------------------------------------
// Helper: setupDatabase
// ---------------------------------------------------------------------------
/**
 * Configures process.env.DATABASE_URL based on the runtime mode.
 * In Prod_Mode also ensures the %APPDATA%\Atlas directory exists and
 * seeds the initial atlas.db file from the packaged resources if absent.
 */
function setupDatabase(isPackaged: boolean): void {
  if (isPackaged) {
    // Prod_Mode
    try {
      const appDataPath = process.env.APPDATA as string
      const atlasDir = path.join(appDataPath, 'Atlas')
      const dbDest = path.join(atlasDir, 'atlas.db')

      // 1. Create %APPDATA%\Atlas directory (recursive, no-op if already exists)
      fs.mkdirSync(atlasDir, { recursive: true })

      // 2. If atlas.db doesn't exist, copy the seed DB from packaged resources
      if (!fs.existsSync(dbDest)) {
        const dbSource = path.join(process.resourcesPath, 'prisma', 'dev.db')
        log(`[diag] copying seed DB from ${dbSource} (exists: ${fs.existsSync(dbSource)}) to ${dbDest}`)
        fs.copyFileSync(dbSource, dbDest)
      }

      // 3. Point DATABASE_URL at the AppData location
      process.env.DATABASE_URL = `file:${dbDest}`
      log(`[diag] DATABASE_URL = ${process.env.DATABASE_URL}`)
    } catch (error) {
      log(`[error] setupDatabase failed: ${(error as Error).stack ?? (error as Error).message}`)
      dialog.showErrorBox(
        'Atlas — Erro de inicialização',
        'Falha ao configurar banco de dados.\nDetalhes: ' +
          (error as Error).message +
          `\nLog completo em: ${logFilePath}`,
      )
      app.quit()
      return
    }
  } else {
    // Dev_Mode
    process.env.DATABASE_URL = `file:${path.join(process.cwd(), 'prisma', 'dev.db')}`
  }
}

// ---------------------------------------------------------------------------
// Helper: spawnBackend
// ---------------------------------------------------------------------------
/**
 * Spawns the Express backend (`server/index.ts`) as a child process,
 * inheriting the provided environment variables (which must include
 * DATABASE_URL). Returns the spawned ChildProcess handle.
 */
function spawnBackend(env: NodeJS.ProcessEnv, isPackaged: boolean): ChildProcess {
  const child = isPackaged
    ? // Prod_Mode: run the compiled server with Electron's own bundled
      // Node runtime (ELECTRON_RUN_AS_NODE). This avoids depending on the
      // end user having Node.js/npm/npx installed on their machine.
      spawn(process.execPath, [resolveServerPath(true)], {
        env: { ...env, ELECTRON_RUN_AS_NODE: '1', NODE_PATH: resolvePrismaClientNodePath() },
        stdio: 'pipe',
      })
    : // Dev_Mode: run the TS source directly via tsx (developer machine
      // is assumed to have Node/npm available, same as `npm run dev`).
      spawn('npx', ['tsx', 'server/index.ts'], {
        env,
        stdio: 'pipe',
        shell: true,
      })

  child.stdout?.on('data', (data) => log(`[backend] ${data.toString().trimEnd()}`))
  child.stderr?.on('data', (data) => log(`[backend:stderr] ${data.toString().trimEnd()}`))

  // Fires if the process could never even be spawned (e.g. wrong path,
  // missing permissions). Without this handler such failures are silent.
  child.on('error', (error) => {
    log(`[error] backend failed to spawn: ${error.stack ?? error.message}`)
  })

  child.on('exit', (code, signal) => {
    log(`[backend] process exited (code=${code}, signal=${signal})`)
  })

  return child
}

// ---------------------------------------------------------------------------
// Helper: spawnFrontend
// ---------------------------------------------------------------------------
/**
 * Spawns the Vite dev server as a child process (Dev_Mode only).
 * Returns the spawned ChildProcess handle.
 */
function spawnFrontend(): ChildProcess {
  const child = spawn('npx', ['vite'], {
    stdio: 'pipe',
    shell: true,
  })

  child.stdout?.on('data', (data) => {
    process.stdout.write(data)
    if (data.toString().includes('localhost')) {
      console.log('✔ Frontend iniciado')
    }
  })

  child.stderr?.on('data', (data) => process.stderr.write(data))

  child.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      process.stderr.write(`[frontend] exited with code ${code}\n`)
    }
  })

  return child
}

// ---------------------------------------------------------------------------
// Helper: createWindow
// ---------------------------------------------------------------------------
/**
 * Creates and shows the BrowserWindow after the backend is ready.
 * Loads http://localhost:5173 in Dev_Mode and http://localhost:3333 in Prod_Mode.
 * Configures contextIsolation: true, nodeIntegration: false, and the preload path.
 */
function createWindow(isPackaged: boolean): BrowserWindow {
  const preloadPath = path.join(__dirname, 'preload.js')
  const iconPath = path.join(__dirname, '..', '..', 'electron', 'assets', 'icon.ico')
  const iconExists = fs.existsSync(iconPath)

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'Atlas',
    icon: iconExists ? iconPath : undefined,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: isPackaged,
      preload: preloadPath,
    },
  })

  const url = isPackaged ? 'http://localhost:3333' : 'http://localhost:5173'
  win.loadURL(url)
  log('✔ Electron iniciado')

  return win
}

// ---------------------------------------------------------------------------
// Helper: shutdown
// ---------------------------------------------------------------------------
/**
 * Gracefully tears down all child processes on app quit.
 * Sends SIGTERM to each child and waits up to 5 seconds before force-killing
 * any still-running processes with SIGKILL, then calls app.quit().
 */
function killProcessTree(child: ChildProcess, signal: 'SIGTERM' | 'SIGKILL'): void {
  if (child.killed || child.exitCode !== null || !child.pid) return

  if (process.platform === 'win32') {
    // spawn(..., { shell: true }) wraps the real process (tsx/vite) inside
    // a cmd.exe shell on Windows. child.kill() only terminates that shell
    // wrapper, leaving the actual Node process (and the port it holds)
    // running in the background. taskkill /t kills the whole process tree.
    spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
      stdio: 'ignore',
    })
  } else {
    child.kill(signal)
  }
}

async function shutdown(children: ChildProcess[]): Promise<void> {
  // Send SIGTERM (or the Windows equivalent) to all live children
  for (const child of children) {
    killProcessTree(child, 'SIGTERM')
  }

  // Wait up to 5 seconds for them to exit
  const deadline = Date.now() + 5000
  await new Promise<void>((resolve) => {
    const check = () => {
      const allDone = children.every((c) => c.killed || c.exitCode !== null)
      if (allDone || Date.now() >= deadline) {
        resolve()
      } else {
        setTimeout(check, 100)
      }
    }
    check()
  })

  // Force-kill any still-running processes
  for (const child of children) {
    killProcessTree(child, 'SIGKILL')
  }

  app.quit()
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

// Holds references to all spawned child processes so lifecycle hooks can
// reach them for graceful shutdown.
const children: ChildProcess[] = []
let shuttingDown = false

app.whenReady().then(async () => {
  // 1. Configure DATABASE_URL and seed DB in Prod_Mode (may quit on error)
  setupDatabase(app.isPackaged)

  // 2. Spawn backend (always)
  const backend = spawnBackend(process.env, app.isPackaged)
  children.push(backend)

  // 3. Spawn frontend (Dev_Mode only)
  if (!app.isPackaged) {
    const frontend = spawnFrontend()
    children.push(frontend)
  }

  // 4. Wait for backend to become ready (30 attempts × 1 000 ms = 30 s)
  const ready = await waitForBackend(30, 1000)

  if (!ready) {
    log('[error] backend did not respond within 30s')
    dialog.showErrorBox(
      'Atlas — Erro de inicialização',
      'O serviço interno falhou ao iniciar. Por favor, reinicie o aplicativo.\n' +
        'Detalhes: O backend não respondeu após 30 segundos.\n\n' +
        `Log completo (abra com o Bloco de Notas) em:\n${logFilePath}`,
    )
    app.quit()
    return
  }

  // 5. Backend is ready — open the window
  createWindow(app.isPackaged)
})

app.on('before-quit', () => {
  if (!shuttingDown) {
    shuttingDown = true
    shutdown(children)
  }
})

app.on('window-all-closed', () => {
  if (!shuttingDown) {
    shuttingDown = true
    shutdown(children)
  }
})
