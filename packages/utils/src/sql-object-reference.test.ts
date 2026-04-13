import assert from "node:assert/strict";
import { extractObjectReferenceAtCursor, isInsideSqlStringOrComment } from "./sql-object-reference.js";

run("extracts prefix before cursor", () => {
  const sql = "select * from fatura";
  const cursor = sql.length;
  const ref = extractObjectReferenceAtCursor(sql, cursor);

  assert.equal(ref?.object.text, "fatura");
  assert.equal(ref?.qualifier, null);
});

run("extracts identifier when cursor is in the middle", () => {
  const sql = "select faturA_item from dual";
  const cursor = sql.indexOf("A_") + 1;
  const ref = extractObjectReferenceAtCursor(sql, cursor);

  assert.equal(ref?.object.text, "faturA_item");
});

run("extracts schema-qualified object", () => {
  const sql = "select * from financeiro.fatura_item fi";
  const cursor = sql.indexOf("fatura_item") + 6;
  const ref = extractObjectReferenceAtCursor(sql, cursor);

  assert.equal(ref?.qualifier?.text, "financeiro");
  assert.equal(ref?.object.text, "fatura_item");
  assert.equal(ref?.text, "financeiro.fatura_item");
});

run("returns null when cursor is on punctuation", () => {
  const sql = "select * from dual;";
  const cursor = sql.length;
  const ref = extractObjectReferenceAtCursor(sql, cursor);

  assert.equal(ref, null);
});

run("ignores strings and comments", () => {
  const sql = "select 'fatura' as label from dual -- fatura";

  assert.equal(isInsideSqlStringOrComment(sql, sql.indexOf("fatura")), true);
  assert.equal(isInsideSqlStringOrComment(sql, sql.lastIndexOf("fatura")), true);
  assert.equal(extractObjectReferenceAtCursor(sql, sql.indexOf("label") + 2)?.object.text, "label");
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
