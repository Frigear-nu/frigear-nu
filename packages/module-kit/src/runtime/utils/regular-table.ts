import { readFileSync } from 'node:fs'
import ts from 'typescript'

export type ParsedTableExport = {
  /** The callee + sql table name, present only when the export is a table factory call, e.g. `sqliteTable('users', {...})`. */
  tableCall?: { callee: string, tableName: string }
  /** Column (or spread) entries keyed by property name, in source order. Values are the raw `key: value` source text. */
  properties: Map<string, string>
  /** Named imports collected from the file, keyed by module specifier. */
  imports: Map<string, Set<string>>
}

/**
 * Parses a "regular" drizzle schema file - i.e. a file that exports a table (or a plain columns object) without
 * requiring any `defineTable`/`defineExtendedColumns` wrapper - and extracts the column properties and imports
 * belonging to the export matching `exportName`. Supports:
 *
 * - `export const users = sqliteTable('users', { ... })` (or `pgTable`/`mysqlTable`, any 2+ arg factory call)
 * - `export const users = { ... }` (a plain columns object)
 * - `export const users = defineExtendedColumns({ ... })` (a single-argument wrapper call)
 * - `export default { ... }` / `export default sqliteTable(...)` / `export default defineExtendedColumns({ ... })`
 *   when `exportName` is `'default'`
 */
export const parseRegularTableExport = (filePath: string, exportName: string): ParsedTableExport | undefined => {
  const text = readFileSync(filePath, 'utf8')
  const source = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)

  const imports = new Map<string, Set<string>>()
  for (const statement of source.statements) {
    if (
      ts.isImportDeclaration(statement)
      && statement.importClause?.namedBindings
      && ts.isNamedImports(statement.importClause.namedBindings)
      && ts.isStringLiteralLike(statement.moduleSpecifier)
    ) {
      const specifiers = imports.get(statement.moduleSpecifier.text) ?? new Set<string>()
      for (const element of statement.importClause.namedBindings.elements) specifiers.add(element.getText())
      imports.set(statement.moduleSpecifier.text, specifiers)
    }
  }

  const toResult = (initializer: ts.Expression): ParsedTableExport | undefined => {
    let objectLiteral: ts.ObjectLiteralExpression | undefined
    let tableCall: { callee: string, tableName: string } | undefined

    if (ts.isCallExpression(initializer)) {
      const args = initializer.arguments
      if (args.length >= 2 && ts.isStringLiteralLike(args[0]!) && ts.isObjectLiteralExpression(args[1]!)) {
        tableCall = { callee: initializer.expression.getText(), tableName: args[0].text }
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

  for (const statement of source.statements) {
    if (ts.isVariableStatement(statement) && statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.name.text === exportName && declaration.initializer) {
          const result = toResult(declaration.initializer)
          if (result) return result
        }
      }
    }
    else if (exportName === 'default' && ts.isExportAssignment(statement) && !statement.isExportEquals) {
      const result = toResult(statement.expression)
      if (result) return result
    }
  }

  return undefined
}
