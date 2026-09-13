const {chromium}=require('/Users/teo/Developer/web-chess/node_modules/playwright')
const fs=require('node:fs'),{execFileSync}=require('node:child_process')
;(async()=>{
 const b=await chromium.launch(),p=await b.newPage({viewport:{width:1280,height:812}})
 const report={sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),base:'http://127.0.0.1:4336/web-chess/'}
 try {
 await p.addInitScript(()=>{
  localStorage.setItem('webchess:analysis-settings:v1',JSON.stringify({workspaceMode:'analysis',analysisExperience:'pro',analysisTab:'engine-lab',autoAnalyze:false,engineProfile:'lite-single-local',expertModeEnabled:false}))
  window.__uciEvents=[];const NativeWorker=Worker
  window.Worker=class extends NativeWorker {
   constructor(...args){super(...args);this.addEventListener('message',e=>{if(typeof e.data==='string')window.__uciEvents.push({kind:'received',line:e.data})})}
   postMessage(s,...args){if(typeof s==='string')window.__uciEvents.push({kind:'sent',line:s});return super.postMessage(s,...args)}
  }
 })
 await p.route(/https:\/\/(lichess\.org|[^/]*lichess\.ovh)\//,r=>r.fulfill({status:404,body:'{}'}))
 await p.goto(report.base);await p.waitForFunction(()=>document.querySelector('.bottom .status')?.textContent==='ready')
 const input=p.getByRole('textbox',{name:'UCI command',exact:true})
 await input.fill('position startpos');await input.press('Enter')
 await p.waitForFunction(()=>document.querySelector('[aria-label="UCI command"]')?.value==='')
 await input.fill('go depth 12 perft 3');await input.press('Enter');await p.waitForTimeout(100)
 report.during=await p.evaluate(()=>({status:document.querySelector('.bottom .status')?.textContent,stopDisabled:document.querySelector('[aria-label="Stop engine search"]')?.disabled,input:document.querySelector('[aria-label="UCI command"]')?.value,events:window.__uciEvents.slice()}))
 await p.waitForTimeout(1400)
 report.after=await p.evaluate(()=>({status:document.querySelector('.bottom .status')?.textContent,input:document.querySelector('[aria-label="UCI command"]')?.value,output:document.querySelector('[aria-label="UCI console output"]')?.textContent,events:window.__uciEvents.slice()}))
 await p.screenshot({path:'/tmp/web-chess-perft-order-before.png'})
 console.log(JSON.stringify({during:report.during.status,stopDisabled:report.during.stopDisabled,replyCount:report.after.events.filter(e=>e.kind==='received'&&e.line.startsWith('info depth')).length,after:report.after.status,input:report.after.input,output:report.after.output,bestmoves:report.after.events.filter(e=>e.line.startsWith('bestmove'))}))
 }finally{fs.writeFileSync('/tmp/web-chess-perft-order-before.json',JSON.stringify(report,null,2));await b.close()}
})().catch(e=>{console.error(e);process.exitCode=1})
