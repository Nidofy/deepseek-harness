import type { SessionEvent } from '@deepseek-ai/dsh-session'
export class PetFeed {
  constructor(now?: () => number, generation?: string)
  accept(id: string, state: Record<string, unknown>, seq: number, options?: { live?: boolean; subagent?: boolean; event?: SessionEvent }): void
  snapshot(): { generation: string; revision: number; full: boolean; items: Array<{ sessionId: string; status: string }> }
}
