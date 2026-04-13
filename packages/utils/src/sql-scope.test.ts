import assert from "node:assert/strict";
import { findNearestSqlScope, findSqlScopeAtCursor, getSqlScopePath, parseSqlScopeBlocks } from "./sql-scope.js";

run("parse simple SELECT scope", () => {
  const sql = "select * from dual";
  const blocks = parseSqlScopeBlocks(sql);

  assert.equal(blocks.length, 1);
  assert.equal(blocks[0]?.selectStart, 0);
  assert.equal(blocks[0]?.depth, 0);
});

run("parse subquery in FROM", () => {
  const sql = `
    select *
    from (
      select id
      from users
    ) u
  `;
  const blocks = parseSqlScopeBlocks(sql);

  assert.equal(blocks.length, 2);
  assert.deepEqual(blocks.map((block) => block.depth), [0, 1]);
});

run("parse subquery in WHERE EXISTS", () => {
  const sql = `
    select *
    from users u
    where exists (
      select 1
      from orders o
      where o.user_id = u.id
    )
  `;
  const blocks = parseSqlScopeBlocks(sql);

  assert.equal(blocks.length, 2);
  assert.equal(blocks[1]?.parentId, blocks[0]?.id ?? null);
});

run("parse nested subqueries across multiple levels", () => {
  const sql = `
    select *
    from (
      select (
        select max(score)
        from scores s
        where s.user_id = u.id
      ) as best_score
      from users u
      where u.id in (
        select user_id
        from audit_log
      )
    ) x
  `;
  const blocks = parseSqlScopeBlocks(sql);

  assert.equal(blocks.length, 4);
  assert.deepEqual(blocks.map((block) => block.depth), [0, 1, 2, 2]);
});

run("parse WITH clause with multiple CTEs", () => {
  const sql = `
    with a as (
      select 1 as id from dual
    ),
    b as (
      select id from a
    )
    select * from b
  `;
  const blocks = parseSqlScopeBlocks(sql);

  assert.equal(blocks.length, 3);
  assert.equal(blocks.filter((block) => block.depth === 0).length, 3);
});

run("ignore SELECT inside comments and strings", () => {
  const sql = `
    select 'select inside string' as txt
    from dual
    where note = 'x'
    -- select in comment
    and exists (
      /* select in block comment */
      select 1 from dual
    )
  `;
  const blocks = parseSqlScopeBlocks(sql);

  assert.equal(blocks.length, 2);
});

run("parse multiple top-level blocks in one statement with UNION", () => {
  const sql = `
    select id from a
    union all
    select id from (
      select id from b
    )
  `;
  const blocks = parseSqlScopeBlocks(sql);

  assert.equal(blocks.length, 3);
  assert.deepEqual(blocks.map((block) => block.depth), [0, 0, 1]);
});

run("find active scope at cursor and ancestry path", () => {
  const sql = `
    with src as (
      select *
      from (
        select id from users
      ) u
    )
    select * from src
  `;
  const cursor = sql.indexOf("id from users");
  const blocks = parseSqlScopeBlocks(sql);
  const active = findSqlScopeAtCursor(blocks, cursor);
  const path = getSqlScopePath(blocks, active?.id ?? null);

  assert.equal(active?.depth, 1);
  assert.equal(path.length, 2);
});

run("find nearest scope when cursor lands after statement end", () => {
  const sql = "select * from (\n  select id from users\n) u;\n";
  const cursor = sql.length;
  const blocks = parseSqlScopeBlocks(sql);
  const nearest = findNearestSqlScope(blocks, cursor);

  assert.equal(nearest?.depth, 0);
});

function run(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}
