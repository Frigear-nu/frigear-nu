import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'

// Test-only (sqlite): stands in for a concurrent request with triggers, so a race lands exactly between a read and a
// write. Each trigger fires once (it deletes its flag row), and `{ clear: true }` drops them all.
//
// - `promote` (`otherId`): when a waitlisted row is claimed (approved), the row `otherId` is approved too (another
//   request's claim); when a claim is put back, `otherId` is put back too (that request saw the crew overfull as well).
// - `move`: just before a row moves to another team, the same person is added to that team (through teams or an
//   invite), so the move hits the unique (team, user) index.
const run = (statement: string) => db.run(sql.raw(statement))

export default defineEventHandler(async (event) => {
  const body = await readBody<{ kind?: 'promote' | 'move', otherId?: string, clear?: boolean }>(event)
  if (body.clear) {
    for (const name of ['test_race_claim', 'test_race_revert', 'test_race_move']) await run(`DROP TRIGGER IF EXISTS ${name}`)
    await run('DROP TABLE IF EXISTS test_race')
    return { cleared: true }
  }
  await run('CREATE TABLE IF NOT EXISTS test_race (name text primary key, target text)')
  if (body.kind === 'promote') {
    const other = String(body.otherId).replace(/'/g, '')
    await run(`INSERT INTO test_race (name, target) VALUES ('claim', '${other}'), ('revert', '${other}')`)
    await run(`CREATE TRIGGER IF NOT EXISTS test_race_claim AFTER UPDATE OF crewStatus ON team_members
      WHEN NEW.crewStatus = 'approved' AND OLD.crewStatus = 'waitlisted' AND EXISTS (SELECT 1 FROM test_race WHERE name = 'claim' AND target <> NEW.id)
      BEGIN
        UPDATE team_members SET crewStatus = 'approved', status = 'active' WHERE id = (SELECT target FROM test_race WHERE name = 'claim');
        DELETE FROM test_race WHERE name = 'claim';
      END`)
    await run(`CREATE TRIGGER IF NOT EXISTS test_race_revert AFTER UPDATE OF crewStatus ON team_members
      WHEN NEW.crewStatus = 'waitlisted' AND OLD.crewStatus = 'approved' AND EXISTS (SELECT 1 FROM test_race WHERE name = 'revert' AND target <> NEW.id)
      BEGIN
        UPDATE team_members SET crewStatus = 'waitlisted', status = 'pending' WHERE id = (SELECT target FROM test_race WHERE name = 'revert');
        DELETE FROM test_race WHERE name = 'revert';
      END`)
  }
  if (body.kind === 'move') {
    await run(`INSERT INTO test_race (name, target) VALUES ('move', NULL)`)
    await run(`CREATE TRIGGER IF NOT EXISTS test_race_move BEFORE UPDATE OF teamId ON team_members
      WHEN NEW.teamId <> OLD.teamId AND EXISTS (SELECT 1 FROM test_race WHERE name = 'move')
      BEGIN
        INSERT INTO team_members (id, teamId, userId, role, status, createdAt, updatedAt) VALUES ('tmm_race_' || NEW.id, NEW.teamId, NEW.userId, 'volunteer', 'pending', 0, 0);
      END`)
  }
  return { kind: body.kind }
})
