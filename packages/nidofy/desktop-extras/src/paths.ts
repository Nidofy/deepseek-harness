/** Derived search storage follows the launcher's isolated Harness home. */
import { Context, Service } from '@deepseek-ai/cordis'
import { join } from 'node:path'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'

declare module '@deepseek-ai/cordis' {
  interface Context { nidofyContextPaths: ContextPaths }
}
/** Provides paths before the official query provider activates. */
export default class ContextPaths extends Service {
  /** Absolute path of the disposable official SQLite search index. */
  readonly index: string = join(resolveDshHome(), 'cache', 'nidofy-session-query.sqlite')
  constructor(ctx: Context) { super(ctx, 'nidofyContextPaths') }
}
