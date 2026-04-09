import type { AppError, AppErrorCode } from "@gavadb/types";

/**
 * Converte erros do oracledb em AppError estruturado para o frontend.
 * Esconde detalhes internos (stack traces, caminhos) mas preserva o código ORA-xxxxx.
 */
export function normalizeOracleError(err: unknown): AppError {
  if (err instanceof Error && "errorNum" in err) {
    const oraErr = err as Error & { errorNum: number; offset?: number };
    const code = mapOraErrorCode(oraErr.errorNum);
    const extractedMessage = extractUserFacingOracleMessage(oraErr.message, oraErr.errorNum);
    return {
      code,
      message: extractedMessage ?? friendlyMessage(code, oraErr.errorNum),
      details: sanitizeDetails(oraErr.message),
    };
  }

  if (err instanceof Error) {
    const code = inferCodeFromMessage(err.message);
    return {
      code,
      message: friendlyMessage(code),
      details: sanitizeDetails(err.message),
    };
  }

  return {
    code: "UNKNOWN",
    message: "An unexpected error occurred",
    details: String(err),
  };
}

/** Mapeia ORA-xxxxx para AppErrorCode */
function mapOraErrorCode(errorNum: number): AppErrorCode {
  // Erros de conexão
  if ([12154, 12170, 12541, 12543, 12514, 1017].includes(errorNum)) {
    return "CONNECTION_FAILED";
  }
  // Sessão perdida
  if ([3113, 3114, 3135, 28, 25408].includes(errorNum)) {
    return "CONNECTION_LOST";
  }
  // Timeout
  if ([12170, 12608].includes(errorNum)) {
    return "QUERY_TIMEOUT";
  }
  // Permissão
  if ([1031, 942, 1].includes(errorNum)) {
    return errorNum === 942 ? "OBJECT_NOT_FOUND" : "PERMISSION_DENIED";
  }
  return "QUERY_FAILED";
}

function inferCodeFromMessage(message: string): AppErrorCode {
  const lower = message.toLowerCase();
  if (lower.includes("timeout")) return "QUERY_TIMEOUT";
  if (lower.includes("not connected") || lower.includes("connection")) return "CONNECTION_LOST";
  return "QUERY_FAILED";
}

function friendlyMessage(code: AppErrorCode, oraNum?: number): string {
  const prefix = oraNum ? `ORA-${String(oraNum).padStart(5, "0")}: ` : "";

  // Specific messages for well-known ORA errors
  if (oraNum) {
    const specific = SPECIFIC_ORA_MESSAGES[oraNum];
    if (specific) return `${prefix}${specific}`;
  }

  const messages: Record<AppErrorCode, string> = {
    CONNECTION_FAILED: `${prefix}Failed to connect to the database`,
    CONNECTION_LOST: `${prefix}Connection to the database was lost`,
    QUERY_FAILED: `${prefix}Query execution failed`,
    QUERY_TIMEOUT: `${prefix}Query timed out`,
    OBJECT_NOT_FOUND: `${prefix}Database object not found or not accessible`,
    PERMISSION_DENIED: `${prefix}Insufficient privileges`,
    UNKNOWN: "An unexpected error occurred",
  };
  return messages[code];
}

const SPECIFIC_ORA_MESSAGES: Record<number, string> = {
  1017: "Invalid username or password",
  12154: "Could not resolve the connect identifier (check service name)",
  12170: "Connection timed out waiting for the database",
  12541: "No listener at the specified host and port",
  12543: "Could not reach the destination host",
  12514: "The service name is not registered with the listener",
  942: "Table or view does not exist",
  3113: "End-of-file on communication channel (connection lost)",
  3114: "Not connected to Oracle (connection was dropped)",
  1: "Unique constraint violated",
  1031: "Insufficient privileges for this operation",
  936: "Missing expression in SQL statement",
  933: "SQL command not properly ended",
  904: "Invalid identifier in SQL statement",
  950: "Missing DROP keyword",
  1722: "Invalid number (data type mismatch)",
  1400: "Cannot insert NULL into a NOT NULL column",
  2291: "Foreign key constraint violated (parent key not found)",
  2292: "Foreign key constraint violated (child records exist)",
  4088: "Database trigger blocked the operation",
  4091: "Table is mutating; the trigger cannot complete this operation right now",
};

function extractUserFacingOracleMessage(message: string, errorNum: number): string | null {
  const customErrorMatch = message.match(/ORA-(20\d{3}):\s*([^\r\n]+)/);
  if (customErrorMatch?.[2]) {
    return `ORA-${customErrorMatch[1]}: ${customErrorMatch[2].trim()}`;
  }

  if (errorNum === 4088) {
    const nestedMessage = message
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line && !line.startsWith("ORA-04088") && !line.startsWith("ORA-06512"));

    if (nestedMessage) {
      return nestedMessage;
    }
  }

  return null;
}

/** Remove caminhos de filesystem e stack traces das mensagens de erro */
function sanitizeDetails(message: string): string {
  return message
    .replace(/\bat\s+.+:\d+:\d+/g, "")        // stack trace lines
    .replace(/[A-Z]:\\[^\s]+/g, "<path>")       // Windows paths
    .replace(/\/[\w/.-]+\.js/g, "<path>")       // Unix paths
    .trim();
}
