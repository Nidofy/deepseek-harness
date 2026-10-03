import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { _electron } from '../../node_modules/.pnpm/playwright@1.61.1/node_modules/playwright/index.mjs'
import { qualifyLayout } from './qualify-layout.mjs'
const repo=fileURLToPath(new URL('../../',import.meta.url)), build=join(repo,'apps/desktop/.desktop-build')
const run=mkdtempSync(join(build,'qualification/layout-ui-')),cwd=mkdtempSync(join(tmpdir(),'nidofy-layout-'))
execFileSync('git',['init',cwd],{windowsHide:true})
const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>!/KEY|TOKEN|PASSWORD|SECRET|^DSH_|^DEEPSEEK|^ANTHROPIC|^OPENAI|^GOOGLE|^ELECTRON_RUN_AS_NODE|^NIDOFY_/i.test(k)))
env.NIDOFY_DESKTOP_DATA_ROOT=join(run,'data');env.NO_PROXY='localhost,127.0.0.1,::1'
let application
const result={status:'FAIL',run,checks:{}}
const until=async(test,label)=>{for(let i=0;i<200;i++){if(await test())return;await delay(150)}throw Error('Timeout: '+label)}
try{
 application=await _electron.launch({executablePath:join(build,'targets/win-x64/candidates/m4-layout-fixes/personal-unsigned/win-unpacked/Nidofy DSH Desktop.exe'),env,timeout:90000})
 const page=await application.firstWindow();await page.waitForURL('dsh-app://app/**',{timeout:90000})
 await page.waitForFunction(()=>document.body.innerText.includes('New Session')&&!document.body.innerText.includes('Loading plugins'),undefined,{timeout:90000})
 const sessionId=await page.evaluate(async cwd=>{
   const method='session/create',response=await fetch('/api/'+method,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'client-request',rpcId:crypto.randomUUID(),method,payload:{args:{request:{cwd}}}})})
   const value=await response.json();if(!value.result.ok)throw Error(JSON.stringify(value.result));return value.result.value.sessionId
 },cwd)
 await qualifyLayout({application,page,until,run,result,cwd,sessionId})
 result.status='PASS'
}catch(error){result.error=String(error);result.stack=error.stack;process.exitCode=1
 if(application)for(const [i,page] of application.windows().entries()){try{await page.screenshot({path:join(run,`failure-${i}.png`),timeout:5000});writeFileSync(join(run,`failure-${i}.txt`),await page.locator('body').innerText())}catch{}}
}finally{if(application)await application.close();writeFileSync(join(run,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2))}
