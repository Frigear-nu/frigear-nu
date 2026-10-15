import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { parseSync } from 'oxc-parser'
import type {
  Argument,
  ExportDefaultDeclarationKind,
  ImportDeclaration,
  ObjectExpression,
  ObjectProperty,
  Program,
  Span,
} from 'oxc-parser'

export type ParsedTableExport = {
  /** The callee + sql table name, present only when the export is a table factory call, e.g. `sqliteTable('users', {...})`. */
  tableCall?: { callee: string, tableName: string, extraArgs?: string[] }
  /** Column (or spread) entries keyed by property name, in source order. Values are the raw `key: value` source text. */
  properties: Map<string, string>
  /**
   * Named imports collected from the file, keyed by module specifier. Relative specifiers (`./`, `../`) are
   * rewritten to absolute paths, since the properties are re-emitted into a generated file elsewhere. Type-only
   * specifiers keep their `type` modifier (stored as `type X`).
   */
  imports: Map<string, Set<string>>
}

type ParsedSource = {
  program: Program
  /** Raw source text of the node, equivalent to the TypeScript compiler's `node.getText()`. */
  text: (node: Span) => string
}

const lineAndColumn = (source: string, offset: number) => {
  const before = source.slice(0, offset)
  const line = before.split('\n').length
  const column = offset - before.lastIndexOf('\n')
  return `${line}:${column}`
}

const parseSource = (filePath: string): ParsedSource => {
  const source = readFileSync(filePath, 'utf8')
  const result = parseSync(filePath, source, { sourceType: 'module', lang: 'ts' })
  const error = result.errors.find(error => error.severity === 'Error')
  if (error) {
    const position = error.labels[0] ? ` at ${lineAndColumn(source, error.labels[0].start)}` : ''
    throw new Error(`Failed to parse the schema file "${filePath}"${position}: ${error.message}`)
  }
  return { program: result.program, text: node => source.slice(node.start, node.end) }
}

const toAbsoluteSpecifier = (filePath: string, specifier: string) =>
  specifier.startsWith('./') || specifier.startsWith('../')
    ? resolve(dirname(filePath), specifier).replace(/\\/g, '/')
    : specifier

/** Whether the declaration has a named-import clause (`{ ... }`), even an empty one; default and namespace imports do not count. */
const hasNamedBindings = (statement: ImportDeclaration, text: ParsedSource['text']) =>
  statement.specifiers.some(specifier => specifier.type === 'ImportSpecifier')
  || text({ start: statement.start, end: statement.source.start }).includes('{')

const collectImports = ({ program, text }: ParsedSource, filePath: string) => {
  const imports = new Map<string, Set<string>>()
  for (const statement of program.body) {
    if (statement.type === 'ImportDeclaration' && hasNamedBindings(statement, text)) {
      const module = toAbsoluteSpecifier(filePath, statement.source.value)
      const specifiers = imports.get(module) ?? new Set<string>()
      const typeOnly = statement.importKind === 'type'
      for (const element of statement.specifiers) {
        if (element.type !== 'ImportSpecifier') continue
        specifiers.add(typeOnly && element.importKind !== 'type' ? `type ${text(element)}` : text(element))
      }
      imports.set(module, specifiers)
    }
  }
  return imports
}

/** The string value of a string literal or a substitution-free template literal (`'users'` / `` `users` ``), like `ts.isStringLiteralLike`. */
const stringLiteralValue = (node: Argument): string | undefined => {
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0 && node.quasis.length === 1) {
    const [quasi] = node.quasis
    return quasi!.value.cooked ?? quasi!.value.raw
  }
  return undefined
}

/** The property name as written, including the brackets of a computed key, like `property.name.getText()`. */
const propertyName = (property: ObjectProperty, { text }: ParsedSource) => {
  if (!property.computed) return text(property.key)
  const source = text(property)
  return source.slice(0, source.indexOf(']', property.key.end - property.start) + 1)
}

const toTableResult = (
  initializer: ExportDefaultDeclarationKind,
  parsed: ParsedSource,
  imports: Map<string, Set<string>>,
): ParsedTableExport | undefined => {
  const { text } = parsed
  let objectLiteral: ObjectExpression | undefined
  let tableCall: { callee: string, tableName: string, extraArgs?: string[] } | undefined

  if (initializer.type === 'CallExpression') {
    const args = initializer.arguments
    const tableName = args[0] ? stringLiteralValue(args[0]) : undefined
    if (args.length >= 2 && tableName !== undefined && args[1]!.type === 'ObjectExpression') {
      const extraArgs = args.length > 2 ? args.slice(2).map(arg => text(arg)) : undefined
      tableCall = { callee: text(initializer.callee), tableName, extraArgs }
      objectLiteral = args[1]
    }
    else if (args.length === 1 && args[0]!.type === 'ObjectExpression') {
      objectLiteral = args[0]
    }
  }
  else if (initializer.type === 'ObjectExpression') {
    objectLiteral = initializer
  }

  if (!objectLiteral) return undefined

  const properties = new Map<string, string>()
  for (const property of objectLiteral.properties) {
    if (property.type === 'Property') {
      // Methods and accessors are not column assignments, so they are skipped like the TypeScript parser did.
      if (property.method || property.kind !== 'init') continue
      properties.set(propertyName(property, parsed), text(property))
    }
    else if (property.type === 'SpreadElement') {
      properties.set(`__spread_${properties.size}`, text(property))
    }
  }

  return { tableCall, properties, imports }
}

/**
 * Parses a "regular" drizzle schema file - i.e. a file that exports a table (or a plain columns object) without
 * requiring any `defineExtendableTable`/`defineTableColumns` wrapper - and extracts the column properties and
 * imports belonging to the export matching `exportName`. Supports:
 *
 * - `export const users = sqliteTable('users', { ... })` (or `pgTable`/`mysqlTable`, any 2+ arg factory call)
 * - `export const users = { ... }` (a plain columns object)
 * - `export const users = defineTableColumns({ ... })` (a single-argument wrapper call)
 * - `export default { ... }` / `export default sqliteTable(...)` / `export default defineTableColumns({ ... })`
 *   when `exportName` is `'default'`
 */
export const parseRegularTableExport = (filePath: string, exportName: string): ParsedTableExport | undefined => {
  const parsed = parseSource(filePath)
  const imports = collectImports(parsed, filePath)

  for (const statement of parsed.program.body) {
    if (statement.type === 'ExportNamedDeclaration' && statement.declaration?.type === 'VariableDeclaration') {
      for (const declaration of statement.declaration.declarations) {
        if (declaration.id.type === 'Identifier' && declaration.id.name === exportName && declaration.init) {
          const result = toTableResult(declaration.init, parsed, imports)
          if (result) return result
        }
      }
    }
    else if (exportName === 'default' && statement.type === 'ExportDefaultDeclaration') {
      const result = toTableResult(statement.declaration, parsed, imports)
      if (result) return result
    }
  }

  return undefined
}

/**
 * Lists the names of every named export in a "regular" drizzle schema file that looks like a table (or columns)
 * export - i.e. every export that `parseRegularTableExport` would be able to parse. Used by `registerDatabaseTable`
 * to auto-discover table names when none are explicitly provided. Does not include the `default` export, since it
 * has no name to register a table under.
 *
 * With `tablesOnly`, only exports initialised by a table call (e.g. `sqliteTable('users', { ... })`) are listed;
 * plain column objects and wrapper calls are ignored. That is what `registerDatabaseTable` uses for auto-discovery.
 */
export const listRegularTableExportNames = (filePath: string, options: { tablesOnly?: boolean } = {}): string[] => {
  const parsed = parseSource(filePath)
  const imports = collectImports(parsed, filePath)

  const names: string[] = []
  for (const statement of parsed.program.body) {
    if (statement.type === 'ExportNamedDeclaration' && statement.declaration?.type === 'VariableDeclaration') {
      for (const declaration of statement.declaration.declarations) {
        if (declaration.id.type !== 'Identifier' || !declaration.init) continue
        const result = toTableResult(declaration.init, parsed, imports)
        if (result && (!options.tablesOnly || result.tableCall)) names.push(declaration.id.name)
      }
    }
  }
  return names
}
