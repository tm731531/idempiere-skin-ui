import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig(async () => {
  const { BaseSequencer } = await import('vitest/node')

  class AlphabeticalSequencer extends BaseSequencer {
    async sort(files: any[]): Promise<any[]> {
      return files.sort((a: any, b: any) => {
        const pathA = a.moduleId || a.id || String(a)
        const pathB = b.moduleId || b.id || String(b)
        return pathA.localeCompare(pathB)
      })
    }
  }

  return {
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
      },
    },
    test: {
      environment: 'node',
      globals: true,
      include: ['src/__integration__/**/*.test.ts'],
      testTimeout: 30000,
      hookTimeout: 30000,
      // All tests share one process so file-based state persists
      fileParallelism: false,
      maxWorkers: 1,
      isolate: false,
      // Sort by filename so 01-... runs before 02-...
      sequence: {
        sequential: true,
        sequencer: AlphabeticalSequencer,
      },
    },
  }
})
