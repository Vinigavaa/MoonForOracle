import assert from "node:assert/strict";
import { extractBindParameters } from "./sql-binds.js";

run("single named bind", () => {
  const binds = extractBindParameters("select * from uc where iduc = :iduc");
  assert.equal(binds.length, 1);
  assert.equal(binds[0]?.name, "iduc");
});

run("multiple distinct binds preserve order", () => {
  const binds = extractBindParameters(
    "select * from uc where iduc = :iduc and situacao = :situacao and data_cadastro >= :dataInicial",
  );
  assert.deepEqual(binds.map((b) => b.name), ["iduc", "situacao", "dataInicial"]);
});

run("duplicate bind is grouped", () => {
  const binds = extractBindParameters("select * from t where a = :x or b = :x");
  assert.equal(binds.length, 1);
  assert.equal(binds[0]?.occurrences.length, 2);
});

run("ignores bind inside single-quoted string", () => {
  const binds = extractBindParameters("select ':notabind' from dual where x = :real");
  assert.deepEqual(binds.map((b) => b.name), ["real"]);
});

run("ignores bind inside line comment", () => {
  const binds = extractBindParameters("select * from t -- :ignored\nwhere x = :real");
  assert.deepEqual(binds.map((b) => b.name), ["real"]);
});

run("ignores bind inside block comment", () => {
  const binds = extractBindParameters("select /* :ignored */ * from t where x = :real");
  assert.deepEqual(binds.map((b) => b.name), ["real"]);
});

run("ignores PL/SQL assignment :=", () => {
  const binds = extractBindParameters("begin v_x := 1; end;");
  assert.equal(binds.length, 0);
});

run("ignores Postgres-style ::cast", () => {
  const binds = extractBindParameters("select x::int from t where y = :y");
  assert.deepEqual(binds.map((b) => b.name), ["y"]);
});

run("ignores bind inside q-quote", () => {
  const binds = extractBindParameters("select q'[:ignored]' from dual where x = :real");
  assert.deepEqual(binds.map((b) => b.name), ["real"]);
});

run("ignores bind inside double-quoted identifier", () => {
  const binds = extractBindParameters(`select "col :fake" from t where x = :real`);
  assert.deepEqual(binds.map((b) => b.name), ["real"]);
});

run("between syntax captures both binds", () => {
  const binds = extractBindParameters("select * from t where d between :a and :b");
  assert.deepEqual(binds.map((b) => b.name), ["a", "b"]);
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
