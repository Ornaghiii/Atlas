import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['electron/**/*.test.ts', 'server/**/*.test.ts'],
    exclude: ['node_modules/**'],
    // Run test files serially so the property tests (which spin up a real server
    // on port 3333) never conflict with each other or with main.test.ts.
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: false,
      },
    },
    sequence: {
      concurrent: false,
    },
  },
})
