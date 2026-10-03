import { expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { SessionInputShell } from '../src/client/input/facade.ts'
import type { DraftAttachmentId } from '../src/client/contract/input.ts'
import { brandString } from '@deepseek-ai/dsh-brand'
import { appendWorkbenchExcerpt } from '../src/client/input/workbench-bridge.ts'

it('appends to the official composer without losing a reference, attachment or existing text, and refuses stale revisions', () => {
  const shell = new SessionInputShell({
    actx: new Context(), defaultSink: vi.fn(),
    commandAttachments: { serialize: async () => [], release: () => {}, unsupportedNotice: value => value },
  })
  try {
    shell.setDraft('Keep this @ref')
    expect(shell.insertReference({ source: 'reference', ref: '@[Research](dsh-session:InNvdXJjZSI)', label: 'Research', clipboardText: '@[Research](dsh-session:InNvdXJjZSI)' }, {
      start: 10, end: 14, draftRev: shell.snapshot.draftRev,
    })).toBe(true)
    shell.addAttachments([brandString<DraftAttachmentId>('attachment-fixture')])
    const before = shell.snapshot
    expect(appendWorkbenchExcerpt(shell, before.draftRev, '\nSelected diff')).toBe(true)
    expect(shell.snapshot.draft).toBe(before.draft + '\nSelected diff')
    expect(shell.snapshot.attachmentIds).toEqual(before.attachmentIds)
    expect(appendWorkbenchExcerpt(shell, before.draftRev, '\nDuplicate')).toBe(false)
    expect(shell.snapshot.draft).not.toContain('Duplicate')
    expect(shell.snapshot.draft).toContain('@[Research](dsh-session:InNvdXJjZSI)')
  } finally { shell.dispose() }
})
