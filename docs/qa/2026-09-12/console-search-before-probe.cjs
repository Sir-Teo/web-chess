const { chromium } = require('/Users/teo/Developer/web-chess/node_modules/playwright')
const fs = require('node:fs')
;(async () => {
  const browser = await chromium.launch()
  const result={sourceCommit:'c81dcac',base:'http://127.0.0.1:4336/web-chess/'}
  try {
    const page=await browser.newPage({viewport:{width:1280,height:812}})
    await page.route(/https:\/\/(lichess\.org|[^/]*lichess\.ovh)\//,r=>r.fulfill({status:404,body:'{}'}))
    await page.addInitScript(()=>{
      localStorage.setItem('webchess:analysis-settings:v1',JSON.stringify({workspaceMode:'analysis',analysisExperience:'pro',analysisTab:'engine-lab',autoAnalyze:false,engineProfile:'lite-single-local',analyzeMode:'deep',searchDepth:12,expertModeEnabled:true}))
      window.__uciEvents=[]
      const NativeWorker=Worker
      window.Worker=class extends NativeWorker{
        constructor(...args){super(...args);this.addEventListener('message',e=>{if(typeof e.data==='string')window.__uciEvents.push({at:performance.now(),kind:'received',line:e.data})})}
        postMessage(data,...args){if(typeof data==='string')window.__uciEvents.push({at:performance.now(),kind:'sent',line:data});return super.postMessage(data,...args)}
      }
    })
    await page.goto(result.base)
    await page.waitForFunction(()=>document.querySelector('.bottom .status')?.textContent==='ready')
    await page.getByRole('button',{name:'Engine Lab',exact:true}).click()
    const input=page.getByRole('textbox',{name:'UCI command',exact:true})
    await input.fill('position fen rnb1kbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')
    await input.press('Enter')
    await input.fill('go movetime 4000')
    await input.press('Enter')
    await page.waitForFunction(()=>window.__uciEvents.some(e=>e.line.startsWith('info depth')))
    result.duringConsoleSearch=await page.evaluate(()=>({
      status:document.querySelector('.bottom .status')?.textContent,
      runDisabled:document.querySelector('[aria-label="Run analysis"]')?.disabled,
      stopDisabled:document.querySelector('[aria-label="Stop analysis"]')?.disabled,
      events:window.__uciEvents,
    }))
    await page.screenshot({path:'/tmp/web-chess-console-search-before.png'})
    await page.getByRole('button',{name:'Analyze',exact:true}).click()
    await page.getByRole('button',{name:'Run analysis',exact:true}).click()
    await page.waitForTimeout(800)
    await page.screenshot({path:'/tmp/web-chess-console-mixed-lines-before.png'})
    result.afterAnalyze=await page.evaluate(()=>({
      status:document.querySelector('.bottom .status')?.textContent,
      events:window.__uciEvents,
      position:document.querySelector('.coach-grid')?.textContent,
      liveLines:document.querySelector('.pv-list')?.textContent,
      evaluations:localStorage.getItem('webchess:evaluations:v1'),
    }))
    await page.waitForTimeout(4500)
    result.finished=await page.evaluate(()=>({status:document.querySelector('.bottom .status')?.textContent,events:window.__uciEvents,coach:document.querySelector('.coach-grid')?.textContent,liveLines:document.querySelector('.pv-list')?.textContent}))
    console.log(JSON.stringify({during:result.duringConsoleSearch.status,runDisabled:result.duringConsoleSearch.runDisabled,stopDisabled:result.duringConsoleSearch.stopDisabled,after:result.afterAnalyze.status,position:result.afterAnalyze.position,finished:result.finished.status,coach:result.finished.coach,sent:result.finished.events.filter(e=>e.kind==='sent')}))
  } finally {fs.writeFileSync('/tmp/web-chess-console-search-before.json',JSON.stringify(result,null,2));await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1})
