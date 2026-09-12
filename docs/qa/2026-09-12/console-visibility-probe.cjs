const { chromium } = require('/Users/teo/Developer/web-chess/node_modules/playwright')
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const label = process.argv[2] || 'before'
;(async () => {
 const browser = await chromium.launch(), cdp = await browser.newBrowserCDPSession()
 const page = await browser.newPage({ viewport: { width: 1280, height: 812 } })
 const report = {sourceCommit: execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(), label, visibility: 'scripted visibilitychange, actual Stockfish worker', samples: []}
 const cpu = async () => (await cdp.send('SystemInfo.getProcessInfo')).processInfo.filter(p=>p.type==='renderer').reduce((s,p)=>s+p.cpuTime,0)
 const sample = async stage => {
   await page.waitForTimeout(700)
   const before = await cpu(), start = performance.now()
   await page.waitForTimeout(2000)
   const cpuSeconds = await cpu() - before, elapsed = (performance.now() - start) / 1000
   report.samples.push({stage, cpuSeconds, elapsed, averageRendererCores: cpuSeconds/elapsed, ...await page.evaluate(()=>({status:document.querySelector('.bottom .status')?.textContent, commands:window.__commands, replies:window.__replies, visibility:document.visibilityState}))})
 }
 try {
   await page.route(/https:\/\/(lichess\.org|[^/]*lichess\.ovh)\//,r=>r.fulfill({status:404,body:'{}'}))
   await page.addInitScript(()=>{
     localStorage.setItem('webchess:analysis-settings:v1', JSON.stringify({workspaceMode:'analysis',analysisExperience:'pro',analysisTab:'engine-lab',autoAnalyze:false,engineProfile:'lite-multi-local',expertModeEnabled:true}))
     window.__visible='visible'; window.__commands=[];window.__replies=0
     Object.defineProperty(document,'visibilityState',{get:()=>window.__visible})
     Object.defineProperty(document,'hidden',{get:()=>window.__visible==='hidden'})
     window.__setVisibility=s=>{window.__visible=s;document.dispatchEvent(new Event('visibilitychange'))}
     const NativeWorker=Worker
     window.Worker=class extends NativeWorker {
       constructor(...args){super(...args);this.addEventListener('message',e=>{if(typeof e.data==='string'&&e.data.startsWith('info depth'))window.__replies++})}
       postMessage(s,...args){if(typeof s==='string')window.__commands.push(s);return super.postMessage(s,...args)}
     }
   })
   await page.goto('http://127.0.0.1:4336/web-chess/')
   await page.waitForFunction(()=>document.querySelector('.bottom .status')?.textContent==='ready')
   const input=page.getByRole('textbox',{name:'UCI command',exact:true})
   await input.fill('go infinite');await input.press('Enter')
   await sample('visible search')
   await page.evaluate(()=>window.__setVisibility('hidden'));await sample('hidden search')
   await page.screenshot({path:`/tmp/web-chess-console-visibility-${label}.png`})
   await page.evaluate(()=>window.__setVisibility('visible'));await sample('returned to visible')
   await page.getByRole('button',{name:'Analyze',exact:true}).click()
   await page.getByRole('button',{name:'Stop analysis',exact:true}).click()
   await sample('explicitly stopped')
   console.log(JSON.stringify(report.samples.map(({stage,averageRendererCores,status,commands})=>({stage,averageRendererCores,status,commands}))))
 } finally {fs.writeFileSync(`/tmp/web-chess-console-visibility-${label}.json`,JSON.stringify(report,null,2));await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1})
