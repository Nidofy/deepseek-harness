/** Evidence is always in the notebook's own Session. */
export interface Note {
  id: string
  kind: 'objective' | 'constraint' | 'decision' | 'file' | 'verification' | 'failure' | 'issue' | 'next'
  text: string
  seq: number
  quote: string
  pinned: boolean
  active: boolean
  revision: number
}
/** One atomic revision; sourceThrough advances only after a validated delta commits. */
export interface Notebook {
  schemaVersion: 1
  sessionId: string
  revision: number
  sourceThrough: number
  entries: Note[]
}
/** Deployment-owned bounds include the entire serialized model-visible snapshot. */
export interface NotebookLimits { maxEntries: number; maxBytes: number }
