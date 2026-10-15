import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import ts from 'typescript'

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

const parseSource = (filePath: string) => {
  const text = readFileSync(filePath, 'utf8')
  return ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
}

const toAbsoluteSpecifier = (filePath: string, specifier: string) =>
  specifier.startsWith('./') || specifier.startsWith('../')
    ? resolve(dirname(filePath), specifier).replace(/\\/g, '/')
    : specifier

const collectImports = (source: ts.SourceFile, filePath: string) => {
  const imports = new Map<string, Set<string>>()
  for (const statement of source.statements) {
    if (
      ts.isImportDeclaration(statement)
      && statement.importClause?.namedBindings
      && ts.isNamedImports(statement.importClause.namedBindings)
      && ts.isStringLiteralLike(statement.moduleSpecifier)
    ) {
      const module = toAbsoluteSpecifier(filePath, statement.moduleSpecifier.text)
      const specifiers = imports.get(module) ?? new Set<string>()
      const typeOnly = statement.importClause.isTypeOnly
      for (const element of statement.importClause.namedBindings.elements) {
        specifiers.add(typeOnly && !element.isTypeOnly ? `type ${element.getText()}` : element.getText())
      }
      imports.set(module, specifiers)
    }
  }
  return imports
}

const toTableResult = (initializer: ts.Expression, imports: Map<string, Set<string>>): ParsedTableExport | undefined => {
  let objectLiteral: ts.ObjectLiteralExpression | undefined
  let tableCall: { callee: string, tableName: string, extraArgs?: string[] } | undefined

  if (ts.isCallExpression(initializer)) {
    const args = initializer.arguments
    if (args.length >= 2 && ts.isStringLiteralLike(args[0]!) && ts.isObjectLiteralExpression(args[1]!)) {
      const extraArgs = args.length > 2 ? args.slice(2).map(arg => arg.getText()) : undefined
      tableCall = { callee: initializer.expression.getText(), tableName: args[0].text, extraArgs }
      objectLiteral = args[1]
    }
    else if (args.length === 1 && ts.isObjectLiteralExpression(args[0]!)) {
      objectLiteral = args[0]
    }
  }
  else if (ts.isObjectLiteralExpression(initializer)) {
    objectLiteral = initializer
  }

  if (!objectLiteral) return undefined

  const properties = new Map<string, string>()
  for (const property of objectLiteral.properties) {
    if (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property)) {
      properties.set(property.name.getText(), property.getText())
    }
    else if (ts.isSpreadAssignment(property)) {
      properties.set(`__spread_${properties.size}`, property.getText())
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
  const source = parseSource(filePath)
  const imports = collectImports(source, filePath)

  for (const statement of source.statements) {
    if (ts.isVariableStatement(statement) && statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.name.text === exportName && declaration.initializer) {
          const result = toTableResult(declaration.initializer, imports)
          if (result) return result
        }
      }
    }
    else if (exportName === 'default' && ts.isExportAssignment(statement) && !statement.isExportEquals) {
      const result = toTableResult(statement.expression, imports)
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
  const source = parseSource(filePath)
  const imports = collectImports(source, filePath)

  const names: string[] = []
  for (const statement of source.statements) {
    if (ts.isVariableStatement(statement) && statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue
        const result = toTableResult(declaration.initializer, imports)
        if (result && (!options.tablesOnly || result.tableCall)) names.push(declaration.name.text)
      }
    }
  }
  return names
}
