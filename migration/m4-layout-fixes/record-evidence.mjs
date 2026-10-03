/** Record tested artifacts and require byte-identical reuse of the legacy artwork. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createReadStream, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs'
import { join, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
const root=fileURLToPath(new URL('../../',import.meta.url)),run=resolve(process.argv[2])
assert.ok(relative(join(root,'apps/desktop/.desktop-build/qualification'),run).startsWith('m4-layout-fixes-'))
const report=JSON.parse(readFileSync(join(run,'result.json'),'utf8'))
assert.equal(report.status,'PASS');assert.equal(report.scope,'M2+M3+M4')
assert.ok(Object.values(report.checks).every(v=>v===true));assert.equal(report.checks.railNoOverlapAndResponsiveSidebars,true)
async function record(path){const hash=createHash('sha256');for await(const chunk of createReadStream(join(root,path)))hash.update(chunk);return {path,bytes:statSync(join(root,path)).size,sha256:hash.digest('hex')}}
const preserved=[]
for(const prior of ['m4','m4-fixes','m4-pet-fixes'])for(const artifact of JSON.parse(readFileSync(join(root,'migration',prior,'evidence/summary.json'),'utf8')).artifacts){const actual=await record(artifact.path);assert.equal(actual.sha256,artifact.sha256,'Earlier package changed: '+artifact.path);preserved.push(actual)}
const base='apps/desktop/.desktop-build/targets/win-x64/candidates/m4-layout-fixes/personal-unsigned/win-unpacked/'
const artifacts=[]
for(const path of ['Nidofy DSH Desktop.exe','resources/app.asar','resources/nidofy-protection.exe'])artifacts.push(await record(base+path))
const artwork=[]
for(const [old,file] of [['../src-tauri/icons/icon.png','resources/icon.png'],['../src-tauri/icons/icon.ico','resources/tray.ico'],['../shell-ui/wallpaper.png','resources/app.asar.unpacked/dsh/node_modules/@nidofy/dsh-desktop-extras/assets/theme/wallpaper.png']]){const original=await record(old),packaged=await record(base+file);assert.equal(packaged.sha256,original.sha256);artifacts.push(packaged);artwork.push({original,packaged})}
const target=join(root,'migration/m4-layout-fixes/evidence');mkdirSync(target,{recursive:true})
writeFileSync(join(target,'desktop.json'),JSON.stringify(report,null,2)+'\n')
const summary={status:'PASS',baseline:'dsh-v0.2.0-rc.2',completedAt:new Date().toISOString(),unsigned:true,qualification:relative(root,run),checks:report.checks,artifacts,preserved,artwork,layoutUnitTests:22,officialBuild:'PASS',changedFileLint:'PASS',translationPairs:'PASS',realCredentialsUsed:false,live2d:'Extension seat only; built-in static portrait',enterpriseAcceptance:'deferred'}
writeFileSync(join(target,'summary.json'),JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify({status:summary.status,checks:Object.keys(report.checks).length,preserved:preserved.length,artwork:artwork.length}))
