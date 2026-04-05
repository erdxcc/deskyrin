import type { SQLInputValue, SQLOutputValue } from "node:sqlite";

export function sqlParams(params: unknown[]): SQLInputValue[] {
  return params as SQLInputValue[];
}

export function sqlRow<T>(row: Record<string, SQLOutputValue> | undefined): T | undefined {
  return row as unknown as T | undefined;
}

export function sqlRows<T>(rows: Record<string, SQLOutputValue>[]): T[] {
  return rows as unknown as T[];
}
