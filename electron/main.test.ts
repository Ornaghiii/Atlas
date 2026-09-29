/**
 * Unit tests for electron/main.ts
 *
 * Strategy: mock all external dependencies (electron, child_process, fs, http)
 * before importing the module. The module registers a `app.whenReady().then(cb)`
 * handler at import time. We capture that callback via the mock and invoke it
 * in each test to exercise the orchestration logic.
 *
 * Requirements covered:
 *  - 1.1  spawnBackend spawned with ['tsx', 'server/index.ts']
 *  - 1.2  spawnFrontend spawned with ['vite'], only in Dev_Mode
 *  - 2.1  loadURL called with http://localhost:5173 in Dev_Mode
 *  - 2.2  loadURL called with http://localhost:3333 in Prod_Mode
 *  - 2.3  BrowserWindow created with contextIsolation: true
 *  - 2.4  BrowserWindow preload path ends with 'preload.js'
 *  - 2.5  BrowserWindow title is 'Atlas'
 *  - 6.1  nodeIntegration: false
 *  - 6.2  (covered by 2.5 / contextIsolation check)
 *  - 6.4  webSecurity: false in Dev_Mode
 *  - 6.5  webSecurity: true in Prod_Mode
 *  - 7.3  BrowserWindow.icon set when electron/assets/icon.ico exists
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ─────────────────────────────────────────────────────────────
// 1. Mock declarations (must be at top-level before any import)
// ─────────────────────────────────────────────────────────────

// Holds the callback registered via app.whenReady().then(cb)
let whenReadyCallback: (() => Promise<void>) | null = null

// Holds all spawn calls: spawn(cmd, args, opts)
const spawnMock = vi.fn()

// BrowserWindow instance mock
const mockLoadURL = vi.fn()
const mockBrowserWindowInstance = {
  loadURL: mockLoadURL,
}
const MockBrowserWindow = vi.fn(function MockBW() {
  return mockBrowserWindowInstance
})

// dialog mock
const mockShowErrorBox = vi.fn()

// app mock
const mockQuit = vi.fn()
const mockIsPackaged = { value: false }

const mockApp = {
  get isPackaged() {
    return mockIsPackaged.value
  },
  whenReady: vi.fn(() => ({
    then: (cb: () => Promise<void>) => {
      whenReadyCallback = cb
      return { catch: vi.fn() }
    },
  })),
  on: vi.fn(),
  quit: mockQuit,
}

// http mock — controls whether the health check succeeds
let healthCheckShouldSucceed = true

vi.mock('electron', () => ({
  app: mockApp,
  BrowserWindow: MockBrowserWindow,
  dialog: { showErrorBox: mockShowErrorBox },
}))

vi.mock('child_process', () => ({
  spawn: spawnMock,
}))

// fs mock — existsSync controls icon presence; mkdirSync/copyFileSync/existsSync for DB
const mockExistsSync = vi.fn()
const mockMkdirSync = vi.fn()
const mockCopyFileSync = vi.fn()

vi.mock('fs', () => ({
  existsSync: mockExistsSync,
  mkdirSync: mockMkdirSync,
  copyFileSync: mockCopyFileSync,
}))

// http mock — makes waitForBackend resolve immediately
vi.mock('http', () => {
  const makeReq = () => {
    const handlers: Record<string, () => void> = {}
    return {
      on: vi.fn((event: string, cb: () => void) => {
        handlers[event] = cb
        // When health check should fail, fire the error handler synchronously
        if (event === 'error' && !healthCheckShouldSucceed) {
          cb()
        }
      }),
      setTimeout: vi.fn().mockReturnThis(),
      destroy: vi.fn(),
    }
  }

  return {
    get: vi.fn((_url: string, cb: (res: unknown) => void) => {
      if (healthCheckShouldSucceed) {
        // Simulate a successful health response { ok: true }
        const res = {
          on: (event: string, handler: (chunk?: unknown) => void) => {
            if (event === 'data') handler(JSON.stringify({ ok: true }))
            if (event === 'end') handler()
          },
        }
        cb(res)
      }
      return makeReq()
    }),
  }
})

// ─────────────────────────────────────────────────────────────
// 2. Import the module under test AFTER mocks are registered
//    (Vitest hoists vi.mock() calls automatically)
// ─────────────────────────────────────────────────────────────
// We use a dynamic import so the mock setup above is in place first.
// The module is imported once; subsequent test resets only touch mock state.

// ─────────────────────────────────────────────────────────────
// Helper: build a fake ChildProcess returned by spawn
// ─────────────────────────────────────────────────────────────
function makeChildProcess() {
  const listeners: Record<string, ((...args: unknown[]) => void)[]> = {}
  return {
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
    on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      listeners[event] = listeners[event] ?? []
      listeners[event].push(cb)
    }),
    kill: vi.fn(),
    killed: false,
    exitCode: null,
    _emit: (event: string, ...args: unknown[]) => {
      ;(listeners[event] ?? []).forEach((cb) => cb(...args))
    },
  }
}

// ─────────────────────────────────────────────────────────────
// 3. Tests
// ─────────────────────────────────────────────────────────────

describe('electron/main.ts — unit tests', () => {
  beforeEach(async () => {
    // Reset all mocks before each test
    vi.clearAllMocks()
    whenReadyCallback = null
    healthCheckShouldSucceed = true
    mockIsPackaged.value = false

    // Default: icon.ico does NOT exist (existsSync returns false unless overridden)
    mockExistsSync.mockReturnValue(false)

    // spawn always returns a valid fake ChildProcess
    spawnMock.mockReturnValue(makeChildProcess())

    // Re-wire BrowserWindow mock as a constructable function (vi.clearAllMocks resets impl)
    MockBrowserWindow.mockImplementation(function MockBW() {
      return mockBrowserWindowInstance
    })

    // Re-wire whenReady mock (clearAllMocks resets implementation)
    mockApp.whenReady.mockReturnValue({
      then: (cb: () => Promise<void>) => {
        whenReadyCallback = cb
        return { catch: vi.fn() }
      },
    })

    // Import (or re-trigger) the module. Because Vitest caches modules we need
    // to use vi.resetModules() + dynamic import to get a fresh execution each test.
    vi.resetModules()

    // Re-apply mocks after resetModules
    vi.mock('electron', () => ({
      app: mockApp,
      BrowserWindow: MockBrowserWindow,
      dialog: { showErrorBox: mockShowErrorBox },
    }))
    vi.mock('child_process', () => ({
      spawn: spawnMock,
    }))
    vi.mock('fs', () => ({
      existsSync: mockExistsSync,
      mkdirSync: mockMkdirSync,
      copyFileSync: mockCopyFileSync,
    }))
    vi.mock('http', () => {
      const makeReq = () => ({
        on: vi.fn().mockReturnThis(),
        setTimeout: vi.fn().mockReturnThis(),
        destroy: vi.fn(),
      })
      return {
        get: vi.fn((_url: string, cb: (res: unknown) => void) => {
          if (healthCheckShouldSucceed) {
            const res = {
              on: (event: string, handler: (chunk?: unknown) => void) => {
                if (event === 'data') handler(JSON.stringify({ ok: true }))
                if (event === 'end') handler()
              },
            }
            cb(res)
          }
          return makeReq()
        }),
      }
    })

    await import('./main.ts')

    // Execute the whenReady callback (simulates Electron app ready event)
    const cb0 = whenReadyCallback as ((() => Promise<void>) | null)
    if (cb0) {
      await cb0()
    }
  })

  // ── 1. spawnBackend arguments ──────────────────────────────

  it('spawns backend with [tsx, server/index.ts] args (Req 1.1)', () => {
    // spawnBackend calls: spawn('npx', ['tsx', 'server/index.ts'], ...)
    const backendCall = spawnMock.mock.calls.find(
      (call) =>
        Array.isArray(call[1]) &&
        call[1].includes('tsx') &&
        call[1].includes('server/index.ts'),
    )
    expect(backendCall).toBeDefined()
    expect(backendCall![0]).toBe('npx')
    expect(backendCall![1]).toContain('tsx')
    expect(backendCall![1]).toContain('server/index.ts')
  })

  // ── 2. spawnFrontend arguments in Dev_Mode ─────────────────

  it('spawns frontend with [vite] args in Dev_Mode (Req 1.2)', () => {
    // Dev_Mode: isPackaged = false (set in beforeEach)
    const frontendCall = spawnMock.mock.calls.find(
      (call) => Array.isArray(call[1]) && call[1].includes('vite'),
    )
    expect(frontendCall).toBeDefined()
    expect(frontendCall![0]).toBe('npx')
    expect(frontendCall![1]).toContain('vite')
  })

  // ── 3. spawnFrontend NOT called in Prod_Mode ───────────────

  it('does NOT spawn frontend in Prod_Mode (Req 1.2)', async () => {
    // Reset and re-run with isPackaged = true
    vi.clearAllMocks()
    vi.resetModules()
    whenReadyCallback = null
    mockIsPackaged.value = true
    spawnMock.mockReturnValue(makeChildProcess())
    mockExistsSync.mockReturnValue(false)

    vi.mock('electron', () => ({
      app: mockApp,
      BrowserWindow: MockBrowserWindow,
      dialog: { showErrorBox: mockShowErrorBox },
    }))
    vi.mock('child_process', () => ({
      spawn: spawnMock,
    }))
    vi.mock('fs', () => ({
      existsSync: mockExistsSync,
      mkdirSync: mockMkdirSync,
      copyFileSync: mockCopyFileSync,
    }))
    vi.mock('http', () => {
      const makeReq = () => ({
        on: vi.fn().mockReturnThis(),
        setTimeout: vi.fn().mockReturnThis(),
        destroy: vi.fn(),
      })
      return {
        get: vi.fn((_url: string, cb: (res: unknown) => void) => {
          const res = {
            on: (event: string, handler: (chunk?: unknown) => void) => {
              if (event === 'data') handler(JSON.stringify({ ok: true }))
              if (event === 'end') handler()
            },
          }
          cb(res)
          return makeReq()
        }),
      }
    })

    mockApp.whenReady.mockReturnValue({
      then: (cb: () => Promise<void>) => {
        whenReadyCallback = cb
        return { catch: vi.fn() }
      },
    })
    // Prod_Mode: set APPDATA so setupDatabase doesn't throw
    process.env.APPDATA = 'C:\\Users\\test\\AppData\\Roaming'
    mockMkdirSync.mockReturnValue(undefined)
    // existsSync: atlas.db exists (so no copy needed)
    mockExistsSync.mockReturnValue(true)

    await import('./main.ts')
    const cb1 = whenReadyCallback as ((() => Promise<void>) | null)
    if (cb1) await cb1()

    const frontendCall = spawnMock.mock.calls.find(
      (call) => Array.isArray(call[1]) && call[1].includes('vite'),
    )
    expect(frontendCall).toBeUndefined()
    // Reset to dev mode for subsequent tests
    mockIsPackaged.value = false
  })

  // ── 4. BrowserWindow security config ──────────────────────

  it('creates BrowserWindow with contextIsolation: true (Req 2.3, 6.1)', () => {
    expect(MockBrowserWindow).toHaveBeenCalled()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const config = (MockBrowserWindow.mock.calls as any[][])[0][0]
    expect(config.webPreferences.contextIsolation).toBe(true)
  })

  it('creates BrowserWindow with nodeIntegration: false (Req 2.3, 6.2)', () => {
    expect(MockBrowserWindow).toHaveBeenCalled()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const config = (MockBrowserWindow.mock.calls as any[][])[0][0]
    expect(config.webPreferences.nodeIntegration).toBe(false)
  })

  it('creates BrowserWindow with title "Atlas" (Req 2.5)', () => {
    expect(MockBrowserWindow).toHaveBeenCalled()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const config = (MockBrowserWindow.mock.calls as any[][])[0][0]
    expect(config.title).toBe('Atlas')
  })

  // ── 5. Preload path ends with preload.js ───────────────────

  it('specifies a preload path that ends with preload.js (Req 2.4)', () => {
    expect(MockBrowserWindow).toHaveBeenCalled()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const config = (MockBrowserWindow.mock.calls as any[][])[0][0]
    expect(config.webPreferences.preload).toMatch(/preload\.js$/)
  })

  // ── 6. loadURL in Dev_Mode ────────────────────────────────

  it('calls loadURL with http://localhost:5173 in Dev_Mode (Req 2.1)', () => {
    // isPackaged = false (set in beforeEach)
    expect(mockLoadURL).toHaveBeenCalledWith('http://localhost:5173')
  })

  // ── 7. loadURL in Prod_Mode ───────────────────────────────

  it('calls loadURL with http://localhost:3333 in Prod_Mode (Req 2.2)', async () => {
    vi.clearAllMocks()
    vi.resetModules()
    whenReadyCallback = null
    mockIsPackaged.value = true
    spawnMock.mockReturnValue(makeChildProcess())
    mockExistsSync.mockReturnValue(true) // atlas.db exists
    mockMkdirSync.mockReturnValue(undefined)
    process.env.APPDATA = 'C:\\Users\\test\\AppData\\Roaming'

    vi.mock('electron', () => ({
      app: mockApp,
      BrowserWindow: MockBrowserWindow,
      dialog: { showErrorBox: mockShowErrorBox },
    }))
    vi.mock('child_process', () => ({
      spawn: spawnMock,
    }))
    vi.mock('fs', () => ({
      existsSync: mockExistsSync,
      mkdirSync: mockMkdirSync,
      copyFileSync: mockCopyFileSync,
    }))
    vi.mock('http', () => {
      const makeReq = () => ({
        on: vi.fn().mockReturnThis(),
        setTimeout: vi.fn().mockReturnThis(),
        destroy: vi.fn(),
      })
      return {
        get: vi.fn((_url: string, cb: (res: unknown) => void) => {
          const res = {
            on: (event: string, handler: (chunk?: unknown) => void) => {
              if (event === 'data') handler(JSON.stringify({ ok: true }))
              if (event === 'end') handler()
            },
          }
          cb(res)
          return makeReq()
        }),
      }
    })

    mockApp.whenReady.mockReturnValue({
      then: (cb: () => Promise<void>) => {
        whenReadyCallback = cb
        return { catch: vi.fn() }
      },
    })

    await import('./main.ts')
    const cb2 = whenReadyCallback as ((() => Promise<void>) | null)
    if (cb2) await cb2()

    expect(mockLoadURL).toHaveBeenCalledWith('http://localhost:3333')
    mockIsPackaged.value = false
  })

  // ── 8. webSecurity: false in Dev_Mode ─────────────────────

  it('sets webSecurity: false in Dev_Mode (Req 6.4)', () => {
    // isPackaged = false in this test (set in beforeEach)
    expect(MockBrowserWindow).toHaveBeenCalled()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const config = (MockBrowserWindow.mock.calls as any[][])[0][0]
    expect(config.webPreferences.webSecurity).toBe(false)
  })

  // ── 9. webSecurity: true in Prod_Mode ─────────────────────

  it('sets webSecurity: true in Prod_Mode (Req 6.5)', async () => {
    vi.clearAllMocks()
    vi.resetModules()
    whenReadyCallback = null
    mockIsPackaged.value = true
    spawnMock.mockReturnValue(makeChildProcess())
    mockExistsSync.mockReturnValue(true)
    mockMkdirSync.mockReturnValue(undefined)
    process.env.APPDATA = 'C:\\Users\\test\\AppData\\Roaming'

    vi.mock('electron', () => ({
      app: mockApp,
      BrowserWindow: MockBrowserWindow,
      dialog: { showErrorBox: mockShowErrorBox },
    }))
    vi.mock('child_process', () => ({
      spawn: spawnMock,
    }))
    vi.mock('fs', () => ({
      existsSync: mockExistsSync,
      mkdirSync: mockMkdirSync,
      copyFileSync: mockCopyFileSync,
    }))
    vi.mock('http', () => {
      const makeReq = () => ({
        on: vi.fn().mockReturnThis(),
        setTimeout: vi.fn().mockReturnThis(),
        destroy: vi.fn(),
      })
      return {
        get: vi.fn((_url: string, cb: (res: unknown) => void) => {
          const res = {
            on: (event: string, handler: (chunk?: unknown) => void) => {
              if (event === 'data') handler(JSON.stringify({ ok: true }))
              if (event === 'end') handler()
            },
          }
          cb(res)
          return makeReq()
        }),
      }
    })

    mockApp.whenReady.mockReturnValue({
      then: (cb: () => Promise<void>) => {
        whenReadyCallback = cb
        return { catch: vi.fn() }
      },
    })

    await import('./main.ts')
    const cb3 = whenReadyCallback as ((() => Promise<void>) | null)
    if (cb3) await cb3()

    expect(MockBrowserWindow).toHaveBeenCalled()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const config = (MockBrowserWindow.mock.calls as any[][])[0][0]
    expect(config.webPreferences.webSecurity).toBe(true)
    mockIsPackaged.value = false
  })

  // ── 10. icon set when icon.ico exists ─────────────────────

  it('sets BrowserWindow icon when electron/assets/icon.ico exists (Req 7.3)', async () => {
    vi.clearAllMocks()
    vi.resetModules()
    whenReadyCallback = null
    mockIsPackaged.value = false
    spawnMock.mockReturnValue(makeChildProcess())
    // existsSync returns true → icon exists
    mockExistsSync.mockReturnValue(true)

    vi.mock('electron', () => ({
      app: mockApp,
      BrowserWindow: MockBrowserWindow,
      dialog: { showErrorBox: mockShowErrorBox },
    }))
    vi.mock('child_process', () => ({
      spawn: spawnMock,
    }))
    vi.mock('fs', () => ({
      existsSync: mockExistsSync,
      mkdirSync: mockMkdirSync,
      copyFileSync: mockCopyFileSync,
    }))
    vi.mock('http', () => {
      const makeReq = () => ({
        on: vi.fn().mockReturnThis(),
        setTimeout: vi.fn().mockReturnThis(),
        destroy: vi.fn(),
      })
      return {
        get: vi.fn((_url: string, cb: (res: unknown) => void) => {
          const res = {
            on: (event: string, handler: (chunk?: unknown) => void) => {
              if (event === 'data') handler(JSON.stringify({ ok: true }))
              if (event === 'end') handler()
            },
          }
          cb(res)
          return makeReq()
        }),
      }
    })

    mockApp.whenReady.mockReturnValue({
      then: (cb: () => Promise<void>) => {
        whenReadyCallback = cb
        return { catch: vi.fn() }
      },
    })

    await import('./main.ts')
    const cb4 = whenReadyCallback as ((() => Promise<void>) | null)
    if (cb4) await cb4()

    expect(MockBrowserWindow).toHaveBeenCalled()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const config = (MockBrowserWindow.mock.calls as any[][])[0][0]
    expect(config.icon).toBeDefined()
    expect(config.icon).toMatch(/icon\.ico$/)
  })

  // ── 11. icon NOT set when icon.ico does not exist ──────────

  it('does NOT set BrowserWindow icon when icon.ico is absent (Req 7.3)', () => {
    // existsSync = false (set in beforeEach)
    expect(MockBrowserWindow).toHaveBeenCalled()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const config = (MockBrowserWindow.mock.calls as any[][])[0][0]
    expect(config.icon).toBeUndefined()
  })
})

// ─────────────────────────────────────────────────────────────
// Helper: re-import main with custom setup (shared by 6.2 / 6.3)
// ─────────────────────────────────────────────────────────────

/**
 * Reset module registry, configure shared mock state, then re-import main.ts.
 *
 * NOTE: No vi.mock() calls are made here — they are all registered at the
 * top level (hoisted). This function only mutates the shared mock variables
 * (healthCheckShouldSucceed, mockIsPackaged, etc.) and the mock implementations
 * before triggering a fresh module import.
 */
async function reimportMain(options?: {
  isPackaged?: boolean
  httpSucceeds?: boolean
  existsSyncValue?: boolean | ((p: string) => boolean)
  spawnFactory?: () => ReturnType<typeof makeChildProcess>
}): Promise<{
  whenReadyCb: () => Promise<void>
  getWindowAllClosedCb: () => ((...args: unknown[]) => void) | undefined
  getBeforeQuitCb: () => ((...args: unknown[]) => void) | undefined
}> {
  const {
    isPackaged = false,
    httpSucceeds = true,
    existsSyncValue = false,
    spawnFactory,
  } = options ?? {}

  vi.clearAllMocks()
  vi.resetModules()

  // Re-apply BrowserWindow constructor implementation (cleared by clearAllMocks)
  MockBrowserWindow.mockImplementation(function MockBW() {
    return mockBrowserWindowInstance
  })
  mockIsPackaged.value = isPackaged
  healthCheckShouldSucceed = httpSucceeds

  // Ensure process.resourcesPath is defined for Prod_Mode DB path resolution
  ;(process as NodeJS.Process & { resourcesPath?: string }).resourcesPath =
    'C:\\fake\\resources'

  const existsImpl =
    typeof existsSyncValue === 'function'
      ? existsSyncValue
      : () => existsSyncValue as boolean
  mockExistsSync.mockImplementation(existsImpl)
  mockMkdirSync.mockReturnValue(undefined)

  if (spawnFactory) {
    spawnMock.mockImplementation(spawnFactory)
  } else {
    spawnMock.mockReturnValue(makeChildProcess())
  }

  let capturedWhenReady: (() => Promise<void>) | null = null
  mockApp.whenReady.mockReturnValue({
    then: (cb: () => Promise<void>) => {
      capturedWhenReady = cb
      return { catch: vi.fn() }
    },
  })

  await import('./main.ts')

  return {
    whenReadyCb: () => capturedWhenReady!(),
    getWindowAllClosedCb: () => {
      const call = (mockApp.on.mock.calls as [string, (...args: unknown[]) => void][]).find(
        (c) => c[0] === 'window-all-closed',
      )
      return call ? call[1] : undefined
    },
    getBeforeQuitCb: () => {
      const call = (mockApp.on.mock.calls as [string, (...args: unknown[]) => void][]).find(
        (c) => c[0] === 'before-quit',
      )
      return call ? call[1] : undefined
    },
  }
}

// ═══════════════════════════════════════════════════════════════
// Task 6.2 — Database setup tests (Req 3.1 – 3.6)
// ═══════════════════════════════════════════════════════════════

describe('electron/main.ts — database setup (6.2)', () => {
  beforeEach(() => {
    process.env.APPDATA = 'C:\\Users\\test\\AppData\\Roaming'
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ── 6.2.1  DATABASE_URL in Dev_Mode ────────────────────────

  it('sets DATABASE_URL containing prisma/dev.db in Dev_Mode (Req 3.5)', async () => {
    delete process.env.DATABASE_URL

    const { whenReadyCb } = await reimportMain({ isPackaged: false })
    await whenReadyCb()

    expect(process.env.DATABASE_URL).toBeDefined()
    expect(process.env.DATABASE_URL).toMatch(/prisma[/\\]dev\.db/)
  })

  // ── 6.2.2  DATABASE_URL in Prod_Mode ───────────────────────

  it('sets DATABASE_URL containing Atlas/atlas.db in Prod_Mode (Req 3.5)', async () => {
    delete process.env.DATABASE_URL

    const { whenReadyCb } = await reimportMain({
      isPackaged: true,
      existsSyncValue: true, // atlas.db "exists" so no copy needed
    })
    await whenReadyCb()

    expect(process.env.DATABASE_URL).toBeDefined()
    expect(process.env.DATABASE_URL).toMatch(/Atlas[/\\]atlas\.db/)
  })

  // ── 6.2.3  mkdirSync called in Prod_Mode ───────────────────

  it('calls fs.mkdirSync when in Prod_Mode (Req 3.3)', async () => {
    const { whenReadyCb } = await reimportMain({
      isPackaged: true,
      existsSyncValue: true,
    })
    await whenReadyCb()

    expect(mockMkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('Atlas'),
      expect.objectContaining({ recursive: true }),
    )
  })

  // ── 6.2.4  copyFileSync called when atlas.db missing ───────

  it('calls fs.copyFileSync when atlas.db does NOT exist in Prod_Mode (Req 3.4)', async () => {
    // existsSync: return false for the atlas.db path check, true for icon
    // In main.ts: existsSync(dbDest) and existsSync(iconPath)
    // We make all existsSync calls return false so atlas.db is missing.
    const { whenReadyCb } = await reimportMain({
      isPackaged: true,
      existsSyncValue: false, // atlas.db does NOT exist
    })
    await whenReadyCb()

    expect(mockCopyFileSync).toHaveBeenCalled()
  })

  // ── 6.2.5  dialog + app.quit on mkdirSync error ────────────

  it('calls dialog.showErrorBox and app.quit() when mkdirSync throws (Req 3.6)', async () => {
    const { whenReadyCb } = await reimportMain({
      isPackaged: true,
      existsSyncValue: false,
    })

    // Make mkdirSync throw AFTER reimportMain already set up the mock
    mockMkdirSync.mockImplementationOnce(() => {
      throw new Error('disk full')
    })

    await whenReadyCb()

    expect(mockShowErrorBox).toHaveBeenCalledWith(
      expect.stringContaining('Atlas'),
      expect.stringContaining('disk full'),
    )
    expect(mockQuit).toHaveBeenCalled()
  })
})

// ═══════════════════════════════════════════════════════════════
// Task 6.3 — Shutdown, readiness-check timeout, and log messages
// ═══════════════════════════════════════════════════════════════

describe('electron/main.ts — shutdown, timeout & logs (6.3)', () => {
  beforeEach(() => {
    process.env.APPDATA = 'C:\\Users\\test\\AppData\\Roaming'
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ── 6.3.1  shutdown sends SIGTERM to child processes ────────

  it('sends SIGTERM to children via window-all-closed (Req 1.5)', async () => {
    const fakeChild = makeChildProcess()
    // Ensure the child looks "alive" so shutdown will kill it
    fakeChild.killed = false
    // exitCode remains null (not yet exited)

    const { whenReadyCb, getWindowAllClosedCb } = await reimportMain({
      isPackaged: false,
      httpSucceeds: true,
      spawnFactory: () => fakeChild,
    })

    await whenReadyCb()

    const windowAllClosedCb = getWindowAllClosedCb()
    expect(windowAllClosedCb).toBeDefined()

    // Trigger window-all-closed
    windowAllClosedCb!()

    // Give shutdown's micro-task queue a tick to run
    await new Promise((r) => setTimeout(r, 0))

    expect(fakeChild.kill).toHaveBeenCalledWith('SIGTERM')
  })

  // ── 6.3.2  app.quit() called when all 30 health checks fail ─

  it('calls app.quit() and showErrorBox when backend never becomes ready (Req 1.4)', async () => {
    vi.useFakeTimers()

    const { whenReadyCb } = await reimportMain({
      isPackaged: false,
      httpSucceeds: false, // health check always fails
    })

    // Start the callback but don't await yet (it needs timers to advance)
    const promise = whenReadyCb()

    // waitForBackend: 30 attempts, each with setTimeout(resolve, 1000) for the delay
    // Plus the http.get req.setTimeout(1000) call.
    // Advance enough to exhaust all 30 polls.
    await vi.runAllTimersAsync()

    // Wait for the async chain to settle
    await promise

    expect(mockShowErrorBox).toHaveBeenCalledWith(
      expect.stringContaining('Atlas'),
      expect.any(String),
    )
    expect(mockQuit).toHaveBeenCalled()
  })

  // ── 6.3.3  '✔ Backend iniciado' logged on successful health check ──

  it("logs '✔ Backend iniciado' when health check succeeds (Req 4.1)", async () => {
    const consoleSpy = vi.spyOn(console, 'log')

    const { whenReadyCb } = await reimportMain({
      isPackaged: false,
      httpSucceeds: true,
    })
    await whenReadyCb()

    expect(consoleSpy).toHaveBeenCalledWith('✔ Backend iniciado')
    consoleSpy.mockRestore()
  })

  // ── 6.3.4  '✔ Banco conectado' logged on successful health check ───

  it("logs '✔ Banco conectado' when health check succeeds (Req 4.3)", async () => {
    const consoleSpy = vi.spyOn(console, 'log')

    const { whenReadyCb } = await reimportMain({
      isPackaged: false,
      httpSucceeds: true,
    })
    await whenReadyCb()

    expect(consoleSpy).toHaveBeenCalledWith('✔ Banco conectado')
    consoleSpy.mockRestore()
  })

  // ── 6.3.5  '✔ Electron iniciado' logged when createWindow runs ─────

  it("logs '✔ Electron iniciado' when createWindow runs (Req 4.4)", async () => {
    const consoleSpy = vi.spyOn(console, 'log')

    const { whenReadyCb } = await reimportMain({
      isPackaged: false,
      httpSucceeds: true,
    })
    await whenReadyCb()

    expect(consoleSpy).toHaveBeenCalledWith('✔ Electron iniciado')
    consoleSpy.mockRestore()
  })

  // ── 6.3.6  '✔ Frontend iniciado' logged when Vite stdout has 'localhost' ─

  it("logs '✔ Frontend iniciado' when Vite stdout emits 'localhost' (Req 4.2)", async () => {
    const consoleSpy = vi.spyOn(console, 'log')

    // We need to capture the stdout 'data' handler registered by spawnFrontend.
    // spawnFrontend is the 2nd spawn call in Dev_Mode (backend is 1st).
    let capturedDataHandler: ((chunk: unknown) => void) | null = null
    let spawnCallCount = 0

    const { whenReadyCb } = await reimportMain({
      isPackaged: false,
      httpSucceeds: true,
      spawnFactory: () => {
        spawnCallCount++
        const child = makeChildProcess()
        if (spawnCallCount === 2) {
          // This is the frontend (Vite) child — intercept the stdout data handler
          child.stdout.on = vi.fn((event: string, cb: (chunk: unknown) => void) => {
            if (event === 'data') capturedDataHandler = cb
          })
        }
        return child
      },
    })

    await whenReadyCb()

    // Simulate Vite emitting a line containing 'localhost'
    expect(capturedDataHandler).not.toBeNull()
    capturedDataHandler!(Buffer.from('  ➜  Local: http://localhost:5173/'))

    expect(consoleSpy).toHaveBeenCalledWith('✔ Frontend iniciado')
    consoleSpy.mockRestore()
  })
})
