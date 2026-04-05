import type { SQLInputValue, SQLOutputValue } from "node:sqlite";
export declare function sqlParams(params: unknown[]): SQLInputValue[];
export declare function sqlRow<T>(row: Record<string, SQLOutputValue> | undefined): T | undefined;
export declare function sqlRows<T>(rows: Record<string, SQLOutputValue>[]): T[];
