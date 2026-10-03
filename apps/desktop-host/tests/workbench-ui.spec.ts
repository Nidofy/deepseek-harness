import { Script } from 'node:vm'
import { expect, it } from 'vitest'
import { workbenchHtml } from '../src/workbench/ui.ts'

it.each([false, true])('emits an executable localized workbench script (%s)', (zh) => {
  const html = workbenchHtml(zh)
  const script = html.match(/<script>([\s\S]*)<\/script>/)?.[1]
  expect(script).toBeDefined()
  expect(() => new Script(script!)).not.toThrow()
  expect(html).toContain(zh ? 'lang="zh-CN"' : 'lang="en"')
})
