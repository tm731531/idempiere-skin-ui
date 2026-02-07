import { BaseSequencer } from 'vitest/node'

export default class AlphabeticalSequencer extends BaseSequencer {
  async sort(files: any[]): Promise<any[]> {
    return files.sort((a, b) => {
      const pathA = a.moduleId || a.id || String(a)
      const pathB = b.moduleId || b.id || String(b)
      return pathA.localeCompare(pathB)
    })
  }
}
