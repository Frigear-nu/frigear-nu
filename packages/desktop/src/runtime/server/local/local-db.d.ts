// `#desktop/local-db`: the generated database client of a local-mode build (`localDbTemplate`), aliased by
// `applyLocalNitroConfig`. Only the raw connection is used outside drizzle (the `SqliteDriver` of shared/local-db).
declare module '#desktop/local-db' {
  /** The raw connection of the local database, `null` without `hub.db`. */
  export const sqlite: null | (() => {
    exec(sql: string): void
    values(sql: string, params: unknown[]): unknown[][]
    run(sql: string, params: unknown[]): void
    /** Closes the connection (on shutdown). */
    close?(): void
  })
}
