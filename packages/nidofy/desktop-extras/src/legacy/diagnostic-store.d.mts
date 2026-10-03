export class MeasurementStore {
  close(): Promise<void>
  constructor(home: string, options?: { maxFiles?: number; maxBytes?: number })
  list(): Promise<unknown>
  read(id: string): Promise<Record<string, unknown>>
  save(report: unknown): Promise<unknown>
}
