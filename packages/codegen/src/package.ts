import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** A lookup of the `name` in the nearest `package.json` above a file, caching each directory it reads. */
export function packages(): (file: string) => string | undefined {
  const answers = new Map<string, string | undefined>()
  const nameAt = (dir: string): string | undefined => {
    if (answers.has(dir)) return answers.get(dir)
    const manifest = read(join(dir, 'package.json'))
    const parent = dirname(dir)
    const answer = manifest ? manifest.name : parent === dir ? undefined : nameAt(parent)
    answers.set(dir, answer)
    return answer
  }
  return (file) => nameAt(dirname(file))
}

const read = (path: string): { readonly name: string | undefined } | undefined => {
  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch (error) {
    const missing = error instanceof Error && 'code' in error && error.code === 'ENOENT'
    return missing ? undefined : { name: undefined }
  }
  try {
    const parsed: unknown = JSON.parse(text)
    const name =
      typeof parsed === 'object' && parsed !== null && 'name' in parsed ? parsed.name : undefined
    return { name: typeof name === 'string' ? name : undefined }
  } catch {
    return { name: undefined }
  }
}
