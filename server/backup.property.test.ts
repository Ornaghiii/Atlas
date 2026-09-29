/**
 * Property-based tests for backup / restore HTTP routes.
 *
 * Strategy: spin up the real Express server as a child process pointing at a
 * dedicated SQLite test database, then drive it with fast-check arbitraries.
 * The server is started once per file (beforeAll / afterAll) and tests run
 * sequentially so they can share the single port 3333 without conflict.
 *
 * Feature: electron-desktop-app
 */

import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import fc from 'fast-check'
import { spawn, ChildProcess, execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import * as http from 'http'

// ─── paths ────────────────────────────────────────────────────────────────────

const ROOT = path.join(process.cwd())
const TEST_DB_PATH = path.join(ROOT, 'prisma', 'test-property.db')
const TEST_DB_URL = `file:${TEST_DB_PATH}`
const BASE_URL = 'http://localhost:3333'

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

function httpRequest(
  method: string,
  urlPath: string,
  body?: unknown,
): Promise<{ status: number; data: unknown }> {
  return new Promise((resolve, reject) => {
    const payload = body !== undefined ? JSON.stringify(body) : undefined
    const url = new URL(urlPath, BASE_URL)
    const options: http.RequestOptions = {
      hostname: url.hostname,
      port: Number(url.port) || 80,
      path: url.pathname,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    }

    const req = http.request(options, (res) => {
      let raw = ''
      res.on('data', (chunk) => (raw += chunk))
      res.on('end', () => {
        let data: unknown
        try {
          data = JSON.parse(raw)
        } catch {
          data = raw
        }
        resolve({ status: res.statusCode ?? 0, data })
      })
    })

    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

function get(urlPath: string) {
  return httpRequest('GET', urlPath)
}

function post(urlPath: string, body: unknown) {
  return httpRequest('POST', urlPath, body)
}

// ─── Server lifecycle ─────────────────────────────────────────────────────────

let serverProcess: ChildProcess | null = null

/** Wait for GET /api/health to return { ok: true } (up to 20 s). */
async function waitForServer(maxAttempts = 40, intervalMs = 500): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await httpRequest('GET', '/api/health')
      if ((res.data as { ok?: boolean })?.ok === true) return
    } catch {
      // not ready yet
    }
    await new Promise<void>((r) => setTimeout(r, intervalMs))
  }
  throw new Error('Test server did not become ready within the timeout')
}

async function clearDatabase(): Promise<void> {
  // DELETE all rows so each property test starts from a known-empty state.
  await post('/api/restore', {
    version: 1,
    assets: [],
    goals: [],
    transactions: [],
  })
}

beforeAll(async () => {
  // Remove stale test DB if present
  if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH)

  // Push the Prisma schema onto the fresh test DB
  execSync(`npx prisma db push --force-reset --skip-generate`, {
    env: { ...process.env, DATABASE_URL: TEST_DB_URL },
    stdio: 'pipe',
    cwd: ROOT,
  })

  // Spawn the Express server using the test DB
  serverProcess = spawn('npx', ['tsx', 'server/index.ts'], {
    env: { ...process.env, DATABASE_URL: TEST_DB_URL },
    stdio: 'pipe',
    shell: true,
    cwd: ROOT,
  })

  serverProcess.stderr?.on('data', (d) => {
    // Suppress noisy output; uncomment for debugging:
    // process.stderr.write('[server] ' + d)
  })

  await waitForServer()
}, 60_000)

afterAll(async () => {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill('SIGTERM')
  }
  // Give it a moment to exit, then clean up the test DB
  await new Promise<void>((r) => setTimeout(r, 500))
  if (fs.existsSync(TEST_DB_PATH)) {
    try {
      fs.unlinkSync(TEST_DB_PATH)
    } catch {
      // ignore cleanup errors
    }
  }
}, 15_000)

// ─── Arbitraries ──────────────────────────────────────────────────────────────

/** A non-empty alphanumeric string of length 1-30 */
const nonEmptyString = fc.stringMatching(/^[a-zA-Z0-9 ]{1,30}$/).filter((s) => s.trim().length > 0)

/** An ISO-8601 date string between 2000 and 2030 */
const isoDate = fc
  .date({ min: new Date('2000-01-01'), max: new Date('2030-12-31') })
  .map((d) => d.toISOString())

const assetArb = fc.record({
  id: fc.uuid(),
  name: nonEmptyString,
  category: fc.constantFrom('Conta', 'Dinheiro', 'FII', 'Ações', 'Renda Fixa'),
  institution: fc.option(nonEmptyString, { nil: null }),
  value: fc.double({ min: 0, max: 1_000_000, noNaN: true }),
  yieldRate: fc.option(fc.double({ min: 0, max: 100, noNaN: true }), { nil: null }),
  liquidity: fc.option(nonEmptyString, { nil: null }),
  createdAt: isoDate,
})

const goalArb = fc.record({
  id: fc.uuid(),
  name: nonEmptyString,
  description: fc.option(nonEmptyString, { nil: null }),
  category: nonEmptyString,
  priority: fc.constantFrom('Alta', 'Média', 'Baixa'),
  target: fc.double({ min: 1, max: 1_000_000, noNaN: true }),
  current: fc.double({ min: 0, max: 1_000_000, noNaN: true }),
  deadline: fc.option(isoDate, { nil: null }),
  status: fc.constantFrom('Ativa', 'Concluída', 'Cancelada'),
  createdAt: isoDate,
})

const transactionArb = fc.record({
  id: fc.uuid(),
  type: fc.constantFrom('Receita', 'Despesa', 'Aporte'),
  category: nonEmptyString,
  amount: fc.double({ min: 0.01, max: 1_000_000, noNaN: true }),
  note: fc.option(nonEmptyString, { nil: null }),
  date: isoDate,
  createdAt: isoDate,
})

/** A fully-valid backup payload (version=1, all arrays present) */
const validBackupArb = fc.record({
  version: fc.constant(1 as const),
  assets: fc.array(assetArb, { minLength: 0, maxLength: 5 }),
  goals: fc.array(goalArb, { minLength: 0, maxLength: 5 }),
  transactions: fc.array(transactionArb, { minLength: 0, maxLength: 5 }),
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Backup / Restore property-based tests', () => {
  /**
   * // Feature: electron-desktop-app, Property 6: Backup response always contains all required fields
   * Validates: Requirements 8.2
   */
  it('Property 6: GET /api/backup always returns all required top-level fields', async () => {
    await fc.assert(
      fc.asyncProperty(validBackupArb, async (payload) => {
        await clearDatabase()
        // Seed the DB by restoring the payload first
        const restore = await post('/api/restore', payload)
        expect(restore.status).toBe(200)

        const { status, data } = await get('/api/backup')
        expect(status).toBe(200)

        const backup = data as Record<string, unknown>
        expect(backup).toHaveProperty('version')
        expect(backup).toHaveProperty('exportedAt')
        expect(backup).toHaveProperty('assets')
        expect(backup).toHaveProperty('goals')
        expect(backup).toHaveProperty('transactions')
        expect(backup).toHaveProperty('profile')

        expect(backup.version).toBe(1)
        expect(typeof backup.exportedAt).toBe('string')
        expect(Array.isArray(backup.assets)).toBe(true)
        expect(Array.isArray(backup.goals)).toBe(true)
        expect(Array.isArray(backup.transactions)).toBe(true)
      }),
      { numRuns: 20, verbose: false },
    )
  }, 120_000)

  /**
   * // Feature: electron-desktop-app, Property 7: Restore accepts any valid backup payload and is round-trippable
   * Validates: Requirements 8.3
   */
  it('Property 7: POST /api/restore accepts valid payloads and backup round-trips correctly', async () => {
    await fc.assert(
      fc.asyncProperty(validBackupArb, async (payload) => {
        await clearDatabase()

        // Restore the generated payload
        const restoreRes = await post('/api/restore', payload)
        expect(restoreRes.status).toBe(200)
        expect((restoreRes.data as { ok?: boolean }).ok).toBe(true)

        // Now read back via backup and verify counts match
        const backupRes = await get('/api/backup')
        expect(backupRes.status).toBe(200)
        const backup = backupRes.data as {
          assets: unknown[]
          goals: unknown[]
          transactions: unknown[]
        }

        expect(backup.assets.length).toBe(payload.assets.length)
        expect(backup.goals.length).toBe(payload.goals.length)
        expect(backup.transactions.length).toBe(payload.transactions.length)
      }),
      { numRuns: 20, verbose: false },
    )
  }, 120_000)

  /**
   * // Feature: electron-desktop-app, Property 8: Restore rejects any invalid payload
   * Validates: Requirements 8.4
   */
  it('Property 8: POST /api/restore rejects invalid payloads with 400', async () => {
    // Build an arbitrary for invalid payloads: either version !== 1, or a required
    // array is missing / replaced with a non-array.
    const wrongVersion = fc.record({
      version: fc.integer().filter((v) => v !== 1),
      assets: fc.array(fc.anything(), { maxLength: 3 }),
      goals: fc.array(fc.anything(), { maxLength: 3 }),
      transactions: fc.array(fc.anything(), { maxLength: 3 }),
    })

    const missingArray = fc.record({
      version: fc.constant(1 as const),
      // At least one of these three will be absent or wrong type
      assets: fc.oneof(
        fc.constant(undefined),
        fc.string(),
        fc.integer(),
        fc.boolean(),
        fc.constant(null),
      ),
      goals: fc.array(fc.anything(), { maxLength: 2 }),
      transactions: fc.array(fc.anything(), { maxLength: 2 }),
    })

    const invalidArb = fc.oneof(wrongVersion, missingArray)

    await fc.assert(
      fc.asyncProperty(invalidArb, async (invalidPayload) => {
        const res = await post('/api/restore', invalidPayload)
        expect(res.status).toBe(400)
        const body = res.data as Record<string, unknown>
        expect(body).toHaveProperty('error')
      }),
      { numRuns: 50, verbose: false },
    )
  }, 120_000)

  /**
   * // Feature: electron-desktop-app, Property 9: Restore transaction atomicity on failure
   * Validates: Requirements 8.5
   *
   * Strategy: seed the DB to a known state S, then attempt a restore with a payload
   * that will trigger a DB constraint violation (duplicate primary key within the
   * same batch). Assert that the DB state after the failed restore equals S.
   */
  it('Property 9: Failed restore leaves the database unchanged (atomicity)', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Seed state: 1–3 assets with guaranteed unique IDs
        fc.array(assetArb, { minLength: 1, maxLength: 3 }),
        async (seedAssets) => {
          // Establish known state S by restoring a clean valid backup
          const seedPayload = {
            version: 1,
            assets: seedAssets,
            goals: [],
            transactions: [],
          }
          const seedRes = await post('/api/restore', seedPayload)
          expect(seedRes.status).toBe(200)

          // Read state S
          const beforeRes = await get('/api/backup')
          expect(beforeRes.status).toBe(200)
          const stateBefore = beforeRes.data as { assets: unknown[]; goals: unknown[]; transactions: unknown[] }

          // Build an invalid payload that will fail validation (wrong version → 400 before
          // the transaction even starts) so we also exercise the pure-validation path.
          // Then build a payload that passes validation but has a duplicate ID in assets
          // (SQLite UNIQUE constraint on the PK) to exercise the mid-transaction rollback.
          const [firstAsset] = seedAssets
          const duplicateId = firstAsset.id
          const payloadWithDuplicate = {
            version: 1,
            assets: [
              // Two entries with the same `id` — createMany will violate the PK constraint
              { ...firstAsset },
              { ...firstAsset, id: duplicateId },
            ],
            goals: [],
            transactions: [],
          }

          const failRes = await post('/api/restore', payloadWithDuplicate)
          // Should fail (400 from the route-level error handler OR 400 from express error middleware)
          expect(failRes.status).toBe(400)

          // Read state after failed restore — must equal state S
          const afterRes = await get('/api/backup')
          expect(afterRes.status).toBe(200)
          const stateAfter = afterRes.data as { assets: unknown[]; goals: unknown[]; transactions: unknown[] }

          expect(stateAfter.assets.length).toBe(stateBefore.assets.length)
          expect(stateAfter.goals.length).toBe(stateBefore.goals.length)
          expect(stateAfter.transactions.length).toBe(stateBefore.transactions.length)
        },
      ),
      { numRuns: 10, verbose: false },
    )
  }, 120_000)
})
