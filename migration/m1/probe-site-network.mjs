/** Credential-free site reachability probe; run inside the enterprise network, not on the build machine. */
import { createConnection } from 'node:net'
import { spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const [allowedValue, forbiddenValue, output] = process.argv.slice(2)
if (!allowedValue || !forbiddenValue || !output) throw new Error('Usage: node probe-site-network.mjs <allowed-base-url> <forbidden-url> <output.json>')
function destination(value) {
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('Use credential-free HTTP(S) URLs without query strings or fragments')
  }
  return { host: url.hostname, port: Number(url.port || (url.protocol === 'https:' ? 443 : 80)) }
}
const allowed = destination(allowedValue), forbidden = destination(forbiddenValue)
if (allowed.host === forbidden.host && allowed.port === forbidden.port) throw new Error('Allowed and forbidden destinations must differ')
async function nodeProbe(target) {
  return await new Promise(resolve => {
    const socket = createConnection(target)
    let connected = false
    socket.setTimeout(6000, () => socket.destroy())
    socket.on('connect', () => { connected = true; socket.destroy() })
    socket.on('error', () => {})
    socket.on('close', () => resolve(connected))
  })
}
function shellProbe(target) {
  const script = '$client = [Net.Sockets.TcpClient]::new(); try { $task = $client.ConnectAsync($env:DSH_PROBE_HOST, [int]$env:DSH_PROBE_PORT); if ($task.Wait(6000) -and $client.Connected) { Write-Output "CONNECTED" } else { Write-Output "BLOCKED" } } catch { Write-Output "BLOCKED" } finally { $client.Dispose() }'
  const run = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    env: { ...process.env, DSH_PROBE_HOST: target.host, DSH_PROBE_PORT: String(target.port) },
    encoding: 'utf8', windowsHide: true, timeout: 10000,
  })
  if (run.error || run.status !== 0 || !['CONNECTED', 'BLOCKED'].includes(run.stdout.trim())) {
    throw new Error('PowerShell network probe did not complete; this is not a blocked-destination result')
  }
  return run.stdout.trim() === 'CONNECTED'
}
const node = { allowedConnected: await nodeProbe(allowed), forbiddenConnected: await nodeProbe(forbidden) }
const shell = { allowedConnected: shellProbe(allowed), forbiddenConnected: shellProbe(forbidden) }
const result = { schemaVersion: 1, time: new Date().toISOString(), allowed, forbidden, node, shell,
  reachabilityPass: node.allowedConnected && shell.allowedConnected && !node.forbiddenConnected && !shell.forbiddenConnected,
  enterprisePolicyAudit: 'not performed; attach gateway policy and audit logs separately',
  modelAuthentication: 'not tested; no API key supplied' }
writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx' })
console.log(JSON.stringify(result, null, 2))
if (!result.reachabilityPass) process.exitCode = 1
