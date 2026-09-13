const { chromium } = require('/Users/teo/Developer/web-chess/node_modules/playwright')
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const mode = process.argv[2] || 'before'
const base = process.env.SMOKE_URL || 'http://127.0.0.1:4336/web-chess/'
const output = `/tmp/web-chess-engine-release-${mode}`
;(async () => {
 const browser = await chromium.launch(), root = await browser.newBrowserCDPSession()
 const page = await browser.newPage({viewport:{width:1280,height:812}})
 const report = {sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),dirty:Boolean(execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim()),mode,base,browserVersion:browser.version(),samples:[]}
 const sample = async stage => {
  await page.waitForTimeout(1500)
  const {processInfo} = await root.send('SystemInfo.getProcessInfo')
  const rows=execFileSync('ps',['-p',processInfo.map(p=>p.id).join(','),'-o','pid=,rss='],{encoding:'utf8'}).trim().split('\n')
  const rss=new Map(rows.map(r=>r.trim().split(/\s+/).map(Number)))
  const targets=await root.send('Target.getTargets')
  const record={stage,rendererRssKiB:processInfo.filter(p=>p.type==='renderer').reduce((s,p)=>s+(rss.get(p.id)||0),0),workers:targets.targetInfos.filter(t=>t.type==='worker').length,...await page.evaluate(()=>({status:document.querySelector('.bottom .status')?.textContent,workspace:document.querySelector('.app-shell')?.dataset.workspaceMode,pv:document.querySelector('.pv-list')?.textContent}))}
  report.samples.push(record); console.log(JSON.stringify(record))
 }
 try {
  await page.route(/https:\/\/(lichess\.org|[^/]*lichess\.ovh)\//,r=>r.fulfill({status:404,body:'{}'}))
  await page.addInitScript(()=>localStorage.setItem('webchess:analysis-settings:v1',JSON.stringify({workspaceMode:'analysis',analysisExperience:'pro',autoAnalyze:false,engineProfile:'lite-multi-local',analyzeMode:'deep',searchDepth:12,hashMb:64})))
  await page.goto(base)
  await page.waitForFunction(()=>document.querySelector('.bottom .status')?.textContent==='ready')
  await page.getByRole('button',{name:'Run analysis',exact:true}).click()
  await page.waitForFunction(()=>document.querySelector('.bottom .status')?.textContent==='ready'&&document.querySelector('.pv-list')?.textContent.includes('D12'))
  await sample('completed D12, idle worker retained')
  await page.getByRole('button',{name:'Engine Lab',exact:true}).click()
  if(mode==='before') {
   report.releaseControls=await page.getByRole('button',{name:'Release engine',exact:true}).count()
   await page.getByRole('button',{name:'Play',exact:true}).first().click()
  } else await page.getByRole('button',{name:'Release engine',exact:true}).click()
  const deadline=Date.now()+10000
  while((await root.send('Target.getTargets')).targetInfos.some(t=>t.type==='worker')) {
   if(Date.now()>deadline)throw new Error('worker targets did not terminate')
   await page.waitForTimeout(100)
  }
  if(mode!=='before')await page.getByRole('button',{name:'Analyze',exact:true}).click()
  await sample(mode==='before'?'released by switching to Play':'released while staying in Analysis')
  await page.screenshot({path:`${output}.png`})
  if(mode!=='before') {
   const {strict:assert}=require('node:assert')
   assert.equal(report.samples[1].status,'unloaded');assert.equal(report.samples[1].pv,report.samples[0].pv)
   await page.getByRole('button',{name:'Run analysis',exact:true}).click()
   await page.waitForFunction(()=>document.querySelector('.bottom .status')?.textContent==='ready'&&document.querySelector('.pv-list')?.textContent.includes('D12'))
   await sample('explicit Analyze reloads and completes')
   await page.getByRole('button',{name:'Engine Lab',exact:true}).click()
   await page.getByRole('button',{name:'Release engine',exact:true}).click()
   const againDeadline=Date.now()+10000
   while((await root.send('Target.getTargets')).targetInfos.some(t=>t.type==='worker')){if(Date.now()>againDeadline)throw new Error('second release did not terminate workers');await page.waitForTimeout(100)}
   await page.getByRole('button',{name:'Analyze',exact:true}).click()
   await sample('second release after another completed search')
   assert.equal(report.samples[3].pv,report.samples[2].pv)
  }
 } finally {fs.writeFileSync(`${output}.json`,JSON.stringify(report,null,2));await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1})
