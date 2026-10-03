import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import type { Capture } from './diagnostic-capture.mjs'
export class ToolTelemetry {
  constructor(capture: Capture)
  rows: unknown[]
  event(session: Session, event: SessionEvent): void
  clear(): void
  suspend(): void
}
