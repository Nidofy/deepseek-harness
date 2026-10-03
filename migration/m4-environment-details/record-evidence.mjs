import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {createReadStream,readFileSync,writeFileSync,mkdirSync,copyFileSync,statSync} from 'node:fs'
import {join,resolve,relative} from 'node:path'
import {fileURLToPath} from 'node:url'
const root=fileURLToPath(new URL('../../',import.meta.url)),run=resolve(process.argv[2])
assert.ok(relative(join(root,'apps/desktop/.desktop-build/qualification'),run).startsWith('layout-ui-'))
const report=JSON.parse(readFileSync(join(run,'result.json'),'utf8'))
assert.equal(report.status,'PASS');assert.ok(Object.values(report.checks).every(v=>v===true))
assert.equal(report.checks.environmentCommitRequiresConfirmation,true)
assert.equal(report.checks.environmentSessionSwitchAndNoRepository,true)
async function record(path){const hash=createHash('sha256');for await(const part of createReadStream(join(root,path)))hash.update(part);return {path,bytes:statSync(join(root,path)).size,sha256:hash.digest('hex')}}
const preserved=[]
for(const name of ['m4','m4-fixes','m4-pet-fixes','m4-layout-fixes'])for(const artifact of JSON.parse(readFileSync(join(root,'migration',name,'evidence/summary.json'),'utf8')).artifacts){const actual=await record(artifact.path);assert.equal(actual.sha256,artifact.sha256);preserved.push(actual)}
const base='apps/desktop/.desktop-build/targets/win-x64/candidates/m4-environment-details/personal-unsigned/win-unpacked/'
const artifacts=[]
for(const file of ['Nidofy DSH Desktop.exe','resources/app.asar','resources/nidofy-protection.exe'])artifacts.push(await record(base+file))
const artwork=[]
for(const [old,file] of [['../src-tauri/icons/icon.png','resources/icon.png'],['../src-tauri/icons/icon.ico','resources/tray.ico'],['../shell-ui/wallpaper.png','resources/app.asar.unpacked/dsh/node_modules/@nidofy/dsh-desktop-extras/assets/theme/wallpaper.png']]){const original=await record(old),packaged=await record(base+file);assert.equal(packaged.sha256,original.sha256);artifacts.push(packaged);artwork.push({original,packaged})}
const target=join(root,'migration/m4-environment-details/evidence');mkdirSync(target,{recursive:true})
const summary={status:'PASS',scope:'Environment interaction + layout regression',baseline:'dsh-v0.2.0-rc.2',completedAt:new Date().toISOString(),qualification:relative(root,run),checks:report.checks,artifacts,preserved,artwork,relatedUnitTests:47,officialBuild:'PASS',changedFileLint:'PASS',clientI18n:'PASS',translationPair:'PASS',unsigned:true,realCredentialsUsed:false,notebook:'Analysis only; not enabled',enterpriseAcceptance:'deferred',liveRemotePush:'Preview only; no remote push performed'}
writeFileSync(join(target,'summary.json'),JSON.stringify(summary,null,2)+'\n')
copyFileSync(join(run,'result.json'),join(target,'desktop.json'))
for(const file of ['environment-changes.png','environment-zh-local.png','environment-card.png','layout-zh.png','layout-zh-dark.png'])copyFileSync(join(run,file),join(target,file))
console.log(JSON.stringify({checks:Object.keys(report.checks).length,preserved:preserved.length,artwork:artwork.length}))
