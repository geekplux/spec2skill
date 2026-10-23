// Types for audit.mjs, the audit shared by the generated skill, the web app and the CLI.
export interface AuditCheck { id: string; label: string; ok: boolean; reason?: string }
export interface AuditResult { ok: boolean; checks: AuditCheck[] }
export function auditTree(files: Record<string, string>): AuditResult;
export function operationIds(files: Record<string, string>): string[];
export function readTree(dir: string): Promise<Record<string, string>>;
export function auditDir(dir: string): Promise<AuditResult>;
export function crashReason(error: { stderr?: unknown; message?: string }): string;
