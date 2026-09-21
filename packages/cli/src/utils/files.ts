import { readFile, writeFile, existsSync } from 'node:fs/promises'

export const readPackageJson = async (path: string) => {
  const packageJsonPath = path.endsWith('package.json') ? path : `${path}/package.json`
  try {
    const packageJsonContent = await readFile(packageJsonPath, 'utf-8')
    return JSON.parse(packageJsonContent)
  }
  catch (error) {
    throw new Error(`Failed to read package.json at ${packageJsonPath}: ${error}`)
  }
}

export const writePackageJson = async (path: string, data: Record<string, any>) => {
  const packageJsonPath = path.endsWith('package.json') ? path : `${path}/package.json`
  try {
    await writeFile(packageJsonPath, JSON.stringify(data, null, 2), 'utf-8')
  }
  catch (error) {
    throw new Error(`Failed to write package.json at ${packageJsonPath}: ${error}`)
  }
}

export const packageJsonExists = (path: string) => {
  const packageJsonPath = path.endsWith('package.json') ? path : `${path}/package.json`
  return existsSync(packageJsonPath)
}
