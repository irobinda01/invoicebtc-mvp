import { defineConfig } from 'vite'
import { getClarinetVitestsArgv, vitestSetupFilePath } from '@stacks/clarinet-sdk/vitest'

export default defineConfig({
  test: {
    environment: 'clarinet',
    pool: 'forks',
    poolOptions: {
      threads: { singleThread: true },
      forks: { singleFork: true },
    },
    globals: true,
    include: ['tests/**/*.test.js'],
    setupFiles: [vitestSetupFilePath],
    environmentOptions: {
      clarinet: {
        ...getClarinetVitestsArgv(),
        includeBootContracts: false,
        bootContractsPath: '',
      },
    },
  },
})
