/** Qualify the packaged Notebook using isolated data and a loopback synthetic model. */
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { _electron } from '../../node_modules/.pnpm/playwright@1.61.1/node_modules/playwright/index.mjs'

const repo=fileURLToPath(new URL('../../',import.meta.url)),build=join(repo,'apps/desktop/.desktop-build')
const run=mkdtempSync(join(build,'qualification/n-context-')),root=join(run,'data'),cwd=join(run,'workspace')
mkdirSync(cwd,{recursive:true})
const requests=[]
const server=createServer(async(req,res)=>{
  let body='';for await(const chunk of req)body+=chunk
  const payload=JSON.parse(body)
  let marker='NOTEBOOK_REPLY_'+(requests.length+1)
  const modelText=payload.messages.flatMap(m=>typeof m.content==='string'?[m.content]:(m.content??[]).flatMap(b=>b.type==='text'?[b.text]:[])).join('\n')
  if(modelText.includes('Also include one <nidofy-notebook-delta>')){
    const appendix=JSON.parse(modelText.split('\n').find(line=>line.startsWith('{"previous":')))
    const source=appendix.sources[0]
    marker='Continue with original evidence. <nidofy-notebook-delta>'+JSON.stringify({baseRevision:appendix.previous.revision,sourceThrough:appendix.sourceThrough,operations:[{action:'ADD',id:'packaged-'+appendix.previous.revision,kind:'constraint',text:'Keep official engine',seq:source.seq,quote:source.excerpt.slice(0,20)}]})+'</nidofy-notebook-delta>'
  }
  requests.push({tools:payload.tools?.map(t=>t.function?.name)??[],notes:modelText.includes('Pinned {{literal}} constraint'),reference:modelText.includes('Context history original evidence')})
  res.writeHead(200,{'content-type':'text/event-stream'})
  for(const value of [
    {choices:[{delta:{role:'assistant',content:marker},index:0,finish_reason:null}]},
    {choices:[{delta:{},index:0,finish_reason:'stop'}],usage:{prompt_tokens:30,completion_tokens:3}},
  ])res.write(`data: ${JSON.stringify(value)}\n\n`)
  res.end('data: [DONE]\n\n')
})
server.listen(0,'127.0.0.1');await once(server,'listening')
const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>!/KEY|TOKEN|PASSWORD|SECRET|^DSH_|^DEEPSEEK|^ANTHROPIC|^OPENAI|^GOOGLE|^ELECTRON_RUN_AS_NODE|^NIDOFY_/i.test(k)))
env.NIDOFY_DESKTOP_DATA_ROOT=root;env.NO_PROXY='localhost,127.0.0.1,::1'
const executablePath=join(build,'targets/win-x64/candidates/n-context/personal-unsigned/win-unpacked/Nidofy DSH Desktop.exe')
let application
const diagnostics=[]
const result={status:'FAIL',run,syntheticModel:true,checks:{}}
async function until(fn,label){for(let i=0;i<240;i++){if(await fn())return;await delay(250)}throw Error('Timeout: '+label)}
async function rpc(page,namespace,method,args={}){
  const value=await page.evaluate(async({namespace,method,args})=>{
    const name=namespace+'/'+method,res=await fetch('/api/'+name,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'client-request',rpcId:crypto.randomUUID(),method:name,payload:{args}})})
    return(await res.json()).result
  },{namespace,method,args})
  assert.equal(value?.ok,true,JSON.stringify(value));return value.value
}
async function api(page,path,args={}){
  const value=await page.evaluate(async({path,args})=>{
    const res=await fetch('/api/'+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(args)})
    return{status:res.status,value:await res.json()}
  },{path,args})
  assert.equal(value.status,200,JSON.stringify(value));return value.value
}
async function launch(){
  application=await _electron.launch({executablePath,env,timeout:90000})
  application.process().stderr?.on('data',chunk=>{diagnostics.push(String(chunk).replace(/token=[^\s&]+/g,'token=[REDACTED]'))})
  const page=await application.firstWindow();await page.waitForURL('dsh-app://app/**',{timeout:90000})
  await page.waitForFunction(()=>document.body.innerText.includes('New Session')&&!document.body.innerText.includes('Loading plugins'),undefined,{timeout:90000})
  return page
}
async function turn(page,id,text){
  const before=requests.length
  await rpc(page,'session','prompt',{request:{sessionId:id,requestId:crypto.randomUUID(),mode:'queue',content:[{type:'text',text}]}})
  await until(async()=>requests.length>before&&(await rpc(page,'session','list',{_request:{}})).items.some(s=>s.sessionId===id&&!s.running),'completed model turn')
  return requests.slice(before).find(row=>row.tools.length>0)??requests.at(-1)
}
try{
  let page=await launch()
  const status=await api(page,'nidofy/status')
  await api(page,'nidofy/mutate',{action:'save',operationId:crypto.randomUUID(),expectedRevision:status.desiredRevision,connection:'context',profile:{displayName:'Context fixture',api:'openai-completions',baseURL:`http://127.0.0.1:${server.address().port}/v1`,models:[{id:'fixture'}]},key:'synthetic-context-only'})
  const create=async preset=>{
    const row=await rpc(page,'session','create',{request:{cwd,...(preset?{agentPreset:preset}:{})}})
    await rpc(page,'session','selectModel',{request:{sessionId:row.sessionId,provider:'nidofy-context',model:'fixture'}})
    return row.sessionId
  }
  const sessionId=await create()
  const first=await turn(page,sessionId,'桌宠自动关注任务 Context history original evidence')
  result.toolNames=first.tools
  for(const tool of ['session_search','session_event_search','session_trace','session_event_trace','session_event_read','notebook_read','notebook_update'])assert.ok(first.tools.includes(tool),'Missing tool '+tool)
  result.checks.officialHistoryAndNotebookTools=true
  const sources=await api(page,'nidofy-extras/context/events',{sessionId})
  const source=sources.find(s=>s.type==='user/message'&&s.text.includes('Context history'))
  assert.ok(source)
  const query=()=>api(page,'nidofy-extras/context/search',{sessionId,query:'桌宠自动关注任务',scope:'session'})
  const hits=await query();assert.ok(hits.items.some(h=>h.seq===source.seq))
  result.checks.chinesePersistentHistoryAnchor=true
  await page.evaluate(id=>{const c=new BroadcastChannel('nidofy-pet-navigation');c.postMessage({sessionId:id});c.close()},sessionId)
  const window=await application.browserWindow(page)
  await window.evaluate(w=>{w.restore();w.setSize(1600,950);w.show()})
  await page.getByRole('button',{name:'Working notes and history',exact:true}).click()
  const panel=page.locator('.nidofy-notebook')
  await panel.getByLabel('Working note',{exact:true}).fill('Pinned {{literal}} constraint')
  await panel.locator('label').filter({hasText:'Original event'}).locator('select').selectOption(String(source.seq))
  await panel.getByLabel('Exact source quote',{exact:true}).fill('Context history original evidence')
  await panel.getByRole('button',{name:'Save revision',exact:true}).click()
  await until(async()=>(await api(page,'nidofy-extras/context/status',{sessionId})).notebook.revision===1,'human note committed')
  await panel.getByLabel('Search history',{exact:true}).fill('桌宠自动关注任务')
  await panel.getByRole('button',{name:'Search',exact:true}).click()
  await panel.getByLabel('Search results',{exact:true}).getByRole('button').first().click()
  await panel.locator('pre[aria-label="Original event"]').waitFor()
  assert.equal(await panel.locator('[role=alert]').count(),0)
  await page.screenshot({path:join(run,'notebook-wide.png')})
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false)
  const next=await turn(page,sessionId,'Continue after human correction')
  assert.equal(next.notes,true)
  result.checks.inlineEditSearchSourceAndLiteralSnapshot=true
  await window.evaluate(w=>w.setSize(1000,900))
  await until(async()=>await page.locator('.nidofy-dock').evaluate(e=>e.getBoundingClientRect().width)===0,'notes rail hidden on narrow viewport')
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false)
  result.checks.notesDoNotOverlapNarrowConversation=true
  for(const preset of ['notebook-standard','notebook-ptc','notebook-cordis']){
    const id=await create(preset)
    await turn(page,id,'Keep official engine. Reply briefly to verify preset activation. '.repeat(200))
    if(preset==='notebook-standard'){
      const compacted=await rpc(page,'commands','execute',{agentId:id,line:'/compact',submittedAttachments:[]})
      assert.equal(compacted.result.kind,'success',JSON.stringify(compacted))
      assert.equal((await api(page,'nidofy-extras/context/status',{sessionId:id})).notebook.revision,1)
      result.checks.packagedManualCompactionPublishesNotebook=true
      const candidates=await rpc(page,'sessionReferenceResolver','candidates',{agentId:id,query:sessionId})
      const reference=candidates.find(row=>row.sessionId===sessionId)
      assert.ok(reference?.mention)
      assert.equal((await turn(page,id,'Read this explicit reference: '+reference.mention)).reference,true)
      result.checks.officialExplicitSessionReference=true
    }
  }
  result.checks.threeOptInPresetsMountAndRun=true
  await application.close();application=undefined
  page=await launch()
  assert.equal((await api(page,'nidofy-extras/context/status',{sessionId})).notebook.entries[0].pinned,true)
  assert.ok((await query()).items.some(h=>h.seq===source.seq))
  assert.equal((await turn(page,sessionId,'Continue after process restart')).notes,true)
  result.checks.restartPreservesNotesIndexAndSnapshot=true
  result.status='PASS'
}catch(error){result.error=String(error);result.stack=error.stack;process.exitCode=1
  if(application)for(const [i,page]of application.windows().entries())try{await page.screenshot({path:join(run,`failure-${i}.png`),timeout:5000});writeFileSync(join(run,`failure-${i}.txt`),await page.locator('body').innerText())}catch{}
}finally{
  if(application)await application.close()
  server.close();server.closeAllConnections()
  writeFileSync(join(run,'diagnostics.log'),diagnostics.join(''))
  writeFileSync(join(run,'requests.json'),JSON.stringify(requests,null,2))
  writeFileSync(join(run,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2))
}
