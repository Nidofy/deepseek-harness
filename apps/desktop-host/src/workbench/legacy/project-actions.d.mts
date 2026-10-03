import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { ShellRunResult } from '@deepseek-ai/dsh-shell'
export interface Action { id: string; label: string; command: string; cwd: string; timeoutMs: number; env: Record<string,string>; artifacts?: string[] }
export interface Run extends Record<string,unknown> { id: string; status: string; artifacts?: string[] }
export interface View { workspace: string; config: { schemaVersion: number; actions: Action[] }; fingerprint: string; trusted: boolean; runs: Run[] }
export class ActionError extends Error { code: string }
export function validateActionConfig(value: unknown): View['config']
export class ProjectActions {
  constructor(home: string, execute: (action: Action & {workspace: string; signal: AbortSignal; context?: ToolRunContext}) => Promise<ShellRunResult>)
  inspect(path: string): Promise<View>
  save(path: string, value: unknown): Promise<View>
  trust(path: string, fingerprint: string): Promise<View>
  revoke(path: string): Promise<View>
  start(path: string, actionId: string, options?: {signal?: AbortSignal; context?: ToolRunContext; source?: string}): Promise<Run>
  wait(path: string, id: string): Promise<Run>
  cancel(path: string, id: string): Promise<unknown>
  log(path: string, id: string): Promise<string>
  logReference(path: string, id: string): Promise<{root: string; path: string}>
  close(): Promise<void>
}
