export interface Repository {root: string; vcs: 'git'|'hg'}
export function discoverRepository(path: string): Promise<Repository>
export class ChangeReview {
  constructor(home: string)
  capture(path: string, options?: {sessionId?: string; turn?: number; source?: string; signal?: AbortSignal}): Promise<Record<string,unknown>>
  list(path: string): Promise<unknown>
  inspect(path: string, baselineId?: string, signal?: AbortSignal): Promise<unknown>
  patch(path: string, file: string, options?: {baselineId?: string; mode?: string}): Promise<{text: string|null; path: string; mode: string}>
}
