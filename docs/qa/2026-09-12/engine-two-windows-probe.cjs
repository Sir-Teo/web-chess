const { chromium } = require('/Users/teo/Developer/web-chess/node_modules/playwright')
const { execFileSync } = require('node:child_process'), fs = require('node:fs')
const pause = ms => new Promise(r => setTimeout(r,ms))
;(async()=>{
 const browser=await chromium.launch(), root=await browser.newBrowserCDPSession()
 const result={sourceCommit:'939ab59',base:'http://127.0.0.1:4336/web-chess/',browserVersion:browser.version(),samples:[]}
 const pages=[]
 const processes=async()=>{
  const {processInfo}=await root.send('SystemInfo.getProcessInfo')
  const rows=execFileSync('ps',['-p',processInfo.map(p=>p.id).join(','),'-o','pid=,rss='],{encoding:'utf8'}).trim().split('\n')
  const rss=new Map(rows.map(r=>r.trim().split(/\s+/).map(Number)))
  return processInfo.map(p=>({...p,rssKiB:rss.get(p.id)}))
 }
 const sample=async label=>{
  await pause(1000)
  const before=await processes(), start=performance.now();await pause(3000)
  const after=await processes(), elapsedMs=performance.now()-start
  const rendererCpuSeconds=after.filter(p=>p.type==='renderer').reduce((sum,p)=>sum+p.cpuTime-(before.find(b=>b.id===p.id)?.cpuTime??p.cpuTime),0)
  const {targetInfos}=await root.send('Target.getTargets')
  const states=[]
  for(const page of pages){const cdp=await page.context().newCDPSession(page);const {targetInfo}=await cdp.send('Target.getTargetInfo');const window=await root.send('Browser.getWindowForTarget',{targetId:targetInfo.targetId});states.push({...await page.evaluate(()=>({visibility:document.visibilityState,status:document.querySelector('.bottom .status')?.textContent,commands:window.__commands.slice(),telemetry:document.querySelector('.engine-telemetry-inline')?.textContent})),windowId:window.windowId});await cdp.detach()}
  const record={label,elapsedMs,rendererCpuSeconds,averageRendererCores:rendererCpuSeconds/(elapsedMs/1000),rendererRssKiB:after.filter(p=>p.type==='renderer').reduce((sum,p)=>sum+p.rssKiB,0),workers:targetInfos.filter(t=>t.type==='worker').length,states,processes:after}
  result.samples.push(record);console.log(JSON.stringify(record))
 }
 try{
  const context=await browser.newContext({viewport:{width:1280,height:812}})
  await context.route(/https:\/\/(lichess\.org|[^/]*lichess\.ovh)\//,r=>r.fulfill({status:404,body:'{}'}))
  await context.addInitScript(()=>{
   localStorage.setItem('webchess:analysis-settings:v1',JSON.stringify({workspaceMode:'analysis',analysisExperience:'pro',autoAnalyze:false,engineProfile:'lite-multi-local',analyzeMode:'infinite',hashMb:64}))
   window.__commands=[];const NativeWorker=Worker
   window.Worker=class extends NativeWorker{postMessage(data,...args){if(typeof data==='string')window.__commands.push(data);return super.postMessage(data,...args)}}
  })
  const first=await context.newPage();pages.push(first);await first.goto(result.base)
  await first.waitForFunction(()=>document.querySelector('.bottom .status')?.textContent==='ready')
  await sample('one idle engine after boot')
  await first.getByRole('button',{name:'Run analysis',exact:true}).click();await sample('one infinite search')
  const session=await context.newCDPSession(first);const {targetInfo}=await session.send('Target.getTargetInfo');await session.detach()
  const next=context.waitForEvent('page');await root.send('Target.createTarget',{url:'about:blank',newWindow:true,width:1280,height:812,browserContextId:targetInfo.browserContextId})
  const second=await next;pages.push(second);await second.goto(result.base)
  await second.waitForFunction(()=>document.querySelector('.bottom .status')?.textContent==='ready')
  await second.getByRole('button',{name:'Run analysis',exact:true}).click()
  await sample('two infinite searches in separate visible windows')
  await first.screenshot({path:'/tmp/web-chess-two-windows-first.png'})
  await second.screenshot({path:'/tmp/web-chess-two-windows-second.png'})
  for(const page of pages) await page.getByRole('button',{name:'Stop analysis',exact:true}).click()
  for(const page of pages) await page.waitForFunction(()=>document.querySelector('.bottom .status')?.textContent==='ready')
  await sample('two stopped engines retained')
  for(const page of pages) await page.getByRole('button',{name:'Play',exact:true}).click()
  const deadline=performance.now()+10000
  while((await root.send('Target.getTargets')).targetInfos.some(t=>t.type==='worker')){if(performance.now()>deadline)throw new Error('workers did not shut down');await pause(100)}
  await sample('both engines released in Play')
 }finally{await browser.close();fs.writeFileSync('/tmp/web-chess-two-windows.json',JSON.stringify(result,null,2))}
})().catch(e=>{console.error(e);process.exitCode=1})
