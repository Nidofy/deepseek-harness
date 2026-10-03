import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
export class Capture {
  constructor(options: { key: Buffer; configuration?: Record<string, unknown>; maxRecords?: number; maxBytes?: number })
  failures: number
  id(value: string): string
  clear(): void
  snapshot(): Record<string, unknown>
}
export function observeStream(capture: Capture, options: GenerateOptions, next: () => AsyncIterable<StreamChunk>): AsyncIterable<StreamChunk>
export function usageMetadata(value: unknown): Record<string, number | string | null>
