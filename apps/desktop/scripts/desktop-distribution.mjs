/** File-owned distribution identity; upstream behavior remains the default. */
export function resolveDesktopDistribution(env) {
  const kind = env.DSH_DESKTOP_DISTRIBUTION ?? 'upstream'
  if (!['upstream', 'intranet', 'personal'].includes(kind)) throw new Error('desktop distribution: expected upstream, intranet or personal')
  if (kind === 'upstream') return undefined
  const appId = kind === 'personal' ? 'io.github.nidofy.dsh.desktop' : 'io.github.nidofy.dsh.intranet'
  if (env.DSH_DESKTOP_APP_ID !== appId) {
    throw new Error(`desktop distribution: ${kind} requires App ID ${appId}`)
  }
  if (Object.keys(env).some(key => /^(DOWNLOAD_(TEST|PROD)_|DSH_DESKTOP_(AUTO_UPDATE_ENV|MANDATORY_UPDATE_))/.test(key))) {
    throw new Error(`desktop distribution: ${kind} uses offline replacement; remove online update settings`)
  }
  const productName = kind === 'personal' ? 'Nidofy DSH Desktop' : 'Nidofy DSH Intranet'
  return { schemaVersion: 1, kind, revision: 1, productName,
    protocol: kind === 'personal' ? 'nidofy-dsh' : 'nidofy-dsh-intranet', dataDirectory: productName, updates: 'offline' }
}
