import assert from "node:assert/strict";
import { findStatementAtCursor, parseSqlStatements, resolveSqlSelection } from "./sql-statements.js";

run("parse two SELECT statements separated by semicolon", () => {
  const sql = "select * from dual;\nselect sysdate from dual;";
  const statements = parseSqlStatements(sql);

  assert.equal(statements.length, 2);
  assert.equal(statements[0]?.text, "select * from dual");
  assert.equal(statements[1]?.text, "select sysdate from dual");
});

run("ignore semicolon inside string literals", () => {
  const sql = "select ';' as semi from dual;\nselect 'a; b' from dual;";
  const statements = parseSqlStatements(sql);

  assert.equal(statements.length, 2);
  assert.match(statements[0]?.text ?? "", /';'/);
  assert.match(statements[1]?.text ?? "", /'a; b'/);
});

run("ignore semicolon inside line comments", () => {
  const sql = "select * from dual -- keep ; here\n;\nselect 2 from dual;";
  const statements = parseSqlStatements(sql);

  assert.equal(statements.length, 2);
  assert.match(statements[0]?.text ?? "", /keep ; here/);
});

run("ignore semicolon inside block comments", () => {
  const sql = "select /* ; inside block */ 1 from dual;\nselect 2 from dual;";
  const statements = parseSqlStatements(sql);

  assert.equal(statements.length, 2);
  assert.match(statements[0]?.text ?? "", /\/\* ; inside block \*\//);
});

run("keep multiline join query as one statement", () => {
  const sql = `
    select a.id, b.name
    from table_a a
    left join table_b b on b.id = a.id
    where a.status = 'A';
  `;
  const statements = parseSqlStatements(sql);

  assert.equal(statements.length, 1);
  assert.match(statements[0]?.text ?? "", /\bleft join\b/i);
});

run("keep CTE with WITH clause as one statement", () => {
  const sql = `
    with sample as (
      select 1 as id from dual
    )
    select * from sample;
  `;
  const statements = parseSqlStatements(sql);

  assert.equal(statements.length, 1);
  assert.match(statements[0]?.text ?? "", /^\s*with\b/i);
});

run("resolve manual selection as execution target", () => {
  const sql = "select * from dual;\nselect sysdate from dual;";
  const selectionStart = sql.indexOf("select sysdate");
  const selectionEnd = selectionStart + "select sysdate from dual".length;
  const selection = resolveSqlSelection(sql, selectionStart, selectionEnd);

  assert.equal(selection?.text, "select sysdate from dual");
});

run("find statement with cursor in middle of statement", () => {
  const sql = "select * from dual;\nselect sysdate from dual;";
  const cursor = sql.indexOf("sysdate");
  const target = findStatementAtCursor(sql, cursor);

  assert.equal(target?.statement.text, "select sysdate from dual");
  assert.equal(target?.reason, "cursor");
});

run("find nearest statement when cursor is between statements", () => {
  const sql = "select * from dual;\n\nselect sysdate from dual;";
  const cursor = sql.indexOf("\n\n") + 1;
  const target = findStatementAtCursor(sql, cursor);

  assert.equal(target?.statement.text, "select * from dual");
  assert.equal(target?.reason, "nearest");
});

run("skip empty statements", () => {
  const sql = ";\n  ;\nselect * from dual;;";
  const statements = parseSqlStatements(sql);

  assert.equal(statements.length, 1);
  assert.equal(statements[0]?.text, "select * from dual");
});

run("keep anonymous PL/SQL block with internal semicolons as one statement", () => {
  const sql = `
    begin
      execute immediate 'delete from test where value = '';''';
      null;
    end;
    /
    select * from dual;
  `;
  const statements = parseSqlStatements(sql);

  assert.equal(statements.length, 2);
  assert.match(statements[0]?.text ?? "", /^\s*begin\b/i);
  assert.match(statements[0]?.text ?? "", /\bnull;/i);
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
