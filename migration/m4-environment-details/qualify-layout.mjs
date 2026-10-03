/** Packaged rail geometry, local artwork and native shortcuts; private data only. */
import assert from 'node:assert/strict'
import { join } from 'node:path'
export async function qualifyLayout({ application, page, until, run, result, cwd, sessionId }) {
  const window = await application.browserWindow(page)
  const resize = async width => {
    await window.evaluate((w, width) => { w.restore(); w.setSize(width, 900); w.show(); w.focus() }, width)
    await until(async () => Math.abs(await page.evaluate(() => innerWidth) - width) < 5, 'window resized')
  }
  await page.evaluate(id => { const c=new BroadcastChannel('nidofy-pet-navigation'); c.postMessage({sessionId:id}); c.close() },sessionId)
  await resize(1600)
  const dock=page.locator('.nidofy-dock')
  await dock.waitFor()
  await until(async () => (await page.locator('.nidofy-path').innerText()).includes(cwd), 'rail follows selected session')
  const geometry=async()=>page.evaluate(()=>{
    const rect=selector=>{const r=document.querySelector(selector).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}}
    return {center:rect('[data-shell-center]'),main:rect('[data-shell-main]'),dock:rect('.nidofy-dock'),character:rect('.nidofy-character'),active:document.querySelector('.nidofy-dock').dataset.active,overflow:document.documentElement.scrollWidth>innerWidth+1}
  })
  const full=await geometry()
  const portrait=page.locator('.nidofy-character img')
  await portrait.evaluate(async img=>{await img.decode()})
  const portraitBox=await portrait.boundingBox()
  assert.ok(portraitBox && Math.abs(portraitBox.width-full.character.width)<1 && Math.abs(portraitBox.height-full.character.height)<1,'portrait must fit the actual slot wrapper')
  assert.ok(full.main.right<=full.dock.x+.1,JSON.stringify(full))
  assert.ok(full.main.width>=740)
  assert.equal(full.overflow,false)
  assert.equal(full.dock.width,300)
  await page.screenshot({path:join(run,'layout-wide.png')})
  await page.locator('.nidofy-collapse').click()
  await until(async()=> (await geometry()).character.height>full.character.height+100,'companion fills collapsed environment')
  await page.screenshot({path:join(run,'layout-folded.png')})
  await page.locator('.nidofy-collapse').click()
  await page.getByRole('button',{name:'Open right sidebar',exact:true}).click()
  await until(async()=> (await geometry()).dock.width===0,'official sidebar automatically hides rail')
  await until(async()=> (await dock.getAttribute('data-active'))==='false','hidden renderer paused')
  await page.screenshot({path:join(run,'layout-official-sidebar.png')})
  await page.getByRole('button',{name:'Collapse right sidebar',exact:true}).click()
  await until(async()=> (await geometry()).dock.width===300,'rail returns after sidebar closes')
  for(const width of [1100,1600,900,1600]){
    await resize(width)
    await until(async()=> (await geometry()).dock.width===(width<1400?0:300),'responsive rail')
    const g=await geometry();assert.equal(g.overflow,false)
    if(width===900)await page.screenshot({path:join(run,'layout-narrow.png')})
  }
  await resize(1200)
  await page.getByRole('button',{name:'Collapse sidebar',exact:true}).click()
  await until(async()=> (await geometry()).dock.width===300,'closing left sidebar reveals rail')
  await page.getByRole('button',{name:'Open sidebar',exact:true}).click()
  await until(async()=> (await geometry()).dock.width===0,'opening left sidebar hides rail')
  await resize(1600)
  const assets=await page.evaluate(async()=>{
    const urls=['theme/wallpaper.png','theme/icon.png','pets/xiaojing/portrait.png']
    return Promise.all(urls.map(async part=>{const img=new Image();img.src='/api/nidofy-extras/assets/'+part;await img.decode();return {part,width:img.naturalWidth,height:img.naturalHeight}}))
  })
  assert.ok(assets.every(row=>row.width>0&&row.height>0))
  const wallpaper=await page.locator('[data-phase]').first().evaluate(el=>({opacity:getComputedStyle(el,'::before').opacity,image:getComputedStyle(el,'::before').backgroundImage}))
  assert.equal(wallpaper.opacity,'0.14');assert.ok(wallpaper.image.includes('/theme/wallpaper.png'))
  await page.emulateMedia({forcedColors:'active'})
  assert.equal(await page.locator('[data-phase]').first().evaluate(el=>getComputedStyle(el,'::before').display),'none')
  await page.emulateMedia({forcedColors:'none',colorScheme:'dark'})
  await page.screenshot({path:join(run,'layout-dark.png')})
  await page.emulateMedia({colorScheme:'light'})
  for(const [label,route] of [['Build and test','/api/nidofy/workbench/ui'],['Desktop pet','/api/nidofy-extras/ui']]){
    await dock.getByRole('button',{name:label,exact:true}).click()
    await until(()=>application.windows().some(p=>p.url().includes(route)),'rail native shortcut')
    const target=application.windows().find(p=>p.url().includes(route));await target.waitForLoadState('domcontentloaded');await target.close()
  }
  const preference = async (ns, value) => {
    const ok = await page.evaluate(async ({ns,value}) => {
      const method='settings/mutate', response=await fetch('/api/'+method,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'client-request',rpcId:crypto.randomUUID(),method,payload:{args:{ns,ops:[{op:'set',path:['preference'],value}]}}})})
      return (await response.json()).result.ok
    },{ns,value})
    assert.equal(ok,true)
  }
  await preference('locale','zh')
  await until(async()=> (await page.locator('.nidofy-collapse').innerText()).includes('环境信息'),'Chinese rail')
  await page.screenshot({path:join(run,'layout-zh.png')})
  await preference('ui-theme','dark')
  await until(async()=> await page.evaluate(()=>document.documentElement.style.colorScheme==='dark'),'dark rail')
  await page.screenshot({path:join(run,'layout-zh-dark.png')})
  await preference('ui-theme','light')
  await preference('locale','en')
  await until(async()=> (await page.locator('.nidofy-collapse').innerText()).includes('Environment'),'English rail restored')
  result.checks.bilingualRailAndOfficialDarkTheme=true
  result.checks.railNoOverlapAndResponsiveSidebars=true
  result.checks.foldExpandsCompanionAndHiddenPauses=true
  result.checks.tauriArtworkDecodesAndForcedColors=true
  result.checks.railNativeShortcuts=true
  result.layout={wide:full,assets,wallpaper}
}
