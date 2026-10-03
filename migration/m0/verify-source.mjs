/** Verify the pinned inputs and reconstruct the legacy patch tree without changing the checkout. */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const directory = dirname(fileURLToPath(import.meta.url))
const repository = resolve(directory, '../..')
const lock = JSON.parse(readFileSync(join(directory, 'source-lock.json'), 'utf8'))

/** Execute Git with the checkout and index supplied by this verification run. */
function git(args, environment = process.env) {
  return execFileSync('git', args, { cwd: repository, env: environment, encoding: 'utf8', windowsHide: true }).trim()
}

assert.equal(git(['remote', 'get-url', 'origin']), lock.fork)
assert.equal(git(['rev-parse', lock.tag]), lock.commit)
git(['merge-base', '--is-ancestor', lock.commit, 'HEAD'])
assert.equal(git(['hash-object', '--path=pnpm-lock.yaml', 'pnpm-lock.yaml']), lock.lockfileBlob)
assert.equal(git(['rev-parse', lock.legacy.baseTag]), lock.legacy.baseCommit)
const patches = lock.legacy.patches.map(patch => {
  const path = join(directory, 'legacy-patches', patch.file)
  const digest = createHash('sha256').update(readFileSync(path)).digest('hex')
  assert.equal(digest, patch.sha256, `patch bytes: ${patch.file}`)
  return path
})

const temporary = mkdtempSync(join(tmpdir(), 'dsh-m0-index-'))
const environment = { ...process.env, GIT_INDEX_FILE: join(temporary, 'index') }
try {
  git(['read-tree', lock.legacy.baseCommit], environment)
  for (const patch of patches) git(['apply', '--cached', patch], environment)
  const restoredTree = git(['write-tree'], environment)
  assert.equal(restoredTree, lock.legacy.expectedTree)
  process.stdout.write(`${JSON.stringify({
    status: 'PASS', upstreamCommit: lock.commit, lockfileBlob: lock.lockfileBlob,
    legacyBase: lock.legacy.baseCommit, restoredTree, patchCount: patches.length,
    productCodePatched: false, remotePublished: false,
  }, null, 2)}\n`)
} finally {
  // This directory was created by mkdtemp above and contains only this run's alternate index.
  rmSync(temporary, { recursive: true, force: true })
}
