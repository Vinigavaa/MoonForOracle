import assert from "node:assert/strict";
import { parsePackageMembers } from "./package-members.js";

run("mixed functions and procedures with line numbers", () => {
  const body = [
    "CREATE OR REPLACE PACKAGE BODY pkg_x AS",
    "  FUNCTION f_one RETURN NUMBER IS",
    "  BEGIN",
    "    RETURN 1;",
    "  END;",
    "  PROCEDURE p_two (a IN NUMBER) IS",
    "  BEGIN",
    "    NULL;",
    "  END;",
    "END;",
  ].join("\n");

  const members = parsePackageMembers(body);
  assert.deepEqual(members, [
    { name: "f_one", kind: "function", line: 2 },
    { name: "p_two", kind: "procedure", line: 6 },
  ]);
});

run("tolerates leading whitespace and keyword case variance", () => {
  const body = [
    "package body pkg_y as",
    "\t\tfunction F_UPPER return varchar2 is begin return 'x'; end;",
    "        Procedure Mixed_Case is begin null; end;",
    "end;",
  ].join("\n");

  const members = parsePackageMembers(body);
  assert.deepEqual(members.map((m) => m.name), ["F_UPPER", "Mixed_Case"]);
  assert.deepEqual(members.map((m) => m.kind), ["function", "procedure"]);
  assert.deepEqual(members.map((m) => m.line), [2, 3]);
});

run("ignores FUNCTION token inside a line comment", () => {
  const body = [
    "package body pkg_z as",
    "  -- FUNCTION f_fake is only mentioned here",
    "  PROCEDURE p_real is begin null; end;",
    "end;",
  ].join("\n");

  const members = parsePackageMembers(body);
  assert.deepEqual(members, [{ name: "p_real", kind: "procedure", line: 3 }]);
});

run("ignores FUNCTION token inside a block comment (line numbers preserved)", () => {
  const body = [
    "package body pkg_b as",
    "  /* this block mentions",
    "     FUNCTION f_fake should be ignored",
    "  */",
    "  FUNCTION f_after RETURN NUMBER IS BEGIN RETURN 0; END;",
    "end;",
  ].join("\n");

  const members = parsePackageMembers(body);
  assert.deepEqual(members, [{ name: "f_after", kind: "function", line: 5 }]);
});

run("ignores FUNCTION token inside a string literal", () => {
  const body = [
    "package body pkg_s as",
    "  PROCEDURE p_log is begin dbms_output.put_line('call FUNCTION here'); end;",
    "end;",
  ].join("\n");

  const members = parsePackageMembers(body);
  assert.deepEqual(members.map((m) => m.name), ["p_log"]);
});

run("empty or member-less body returns empty array", () => {
  assert.deepEqual(parsePackageMembers(""), []);
  assert.deepEqual(
    parsePackageMembers("CREATE OR REPLACE PACKAGE BODY pkg_e AS\nBEGIN\n  NULL;\nEND;"),
    [],
  );
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
