/** Archive the non-secret Git source set and record every included byte before feature development. */
import {execFileSync} from 'node:child_process'
import {readFileSync,writeFileSync,mkdirSync,lstatSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {resolve,join} from 'node:path'
const root=process.cwd(),destination=resolve('apps/desktop/.desktop-build/qualification/m5-source-baseline')
mkdirSync(destination,{recursive:true})
const files=[...new Set(execFileSync('git',['-c','safe.directory='+root,'ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8',maxBuffer:32*1024*1024}).split('\0'))]
  .filter(path=>path&&!path.endsWith('.log')&&!/(^|\/)\.env($|\.(?!.*example$))/.test(path)&&!path.startsWith('migration/m5/evidence/')&&lstatSync(path,{throwIfNoEntry:false})?.isFile()).sort()
const records=files.map(path=>({path,sha256:createHash('sha256').update(readFileSync(path)).digest('hex')}))
const inventory=JSON.stringify({schemaVersion:1,baseline:'dsh-v0.2.0-rc.2',files:records},null,2)+'\n'
writeFileSync(join(destination,'source-manifest.json'),inventory)
writeFileSync(join(destination,'files.txt'),files.join('\n')+'\n')
const sevenZip=process.argv[2]
if(!sevenZip) throw new Error('Pass the absolute path to the installed 7za.exe')
execFileSync(sevenZip,['a','-tzip','-scsUTF-8',join(destination,'source.zip'),'@'+join(destination,'files.txt'),'-bso0','-bsp0'],{cwd:root,windowsHide:true,stdio:'pipe'})
const receipt={status:'PASS',files:files.length,archive:join(destination,'source.zip'),manifest:join(destination,'source-manifest.json'),sha256:createHash('sha256').update(readFileSync(join(destination,'source.zip'))).digest('hex')}
writeFileSync('migration/m5/evidence/source-baseline.json',JSON.stringify(receipt,null,2)+'\n')
console.log(JSON.stringify(receipt))
