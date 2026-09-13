const fs = require('node:fs')
const { execFileSync } = require('node:child_process')
const { chromium } = require('/Users/teo/Developer/web-chess/node_modules/playwright')
const repo='/Users/teo/Developer/web-chess'
const source=fs.readFileSync(`${repo}/scripts/test-ui-browser.cjs`,'utf8')
const fixture=new Function('SAMPLE_PGN',source.slice(source.indexOf('function fakeEngineScript('),source.indexOf('async function checkHiddenAnalysisPausesAndResumes('))+'\nreturn fakeEngineScript;')(fs.readFileSync(`${repo}/scripts/fixtures/review-game.pgn`,'utf8'))
const output=process.argv[2] || '/tmp/web-chess-release-fallback-before'
;(async()=>{
 const browser=await chromium.launch(),page=await browser.newPage({viewport:{width:1280,height:812}})
 const report={sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',cwd:repo}).trim(),dirty:Boolean(execFileSync('git',['status','--porcelain'],{encoding:'utf8',cwd:repo}).trim()),samples:[]}
 try {
  await page.addInitScript(fixture('console-search'))
  await page.addInitScript(()=>{
   Object.defineProperty(window,'crossOriginIsolated',{get:()=>true})
   if(typeof SharedArrayBuffer==='undefined')window.SharedArrayBuffer=ArrayBuffer
   Object.defineProperty(navigator,'hardwareConcurrency',{get:()=>8})
   localStorage.setItem('webchess:analysis-settings:v1',JSON.stringify({workspaceMode:'analysis',analysisExperience:'pro',analysisTab:'analyze',autoAnalyze:false,engineProfile:'lite-multi-local',analyzeMode:'deep',searchDepth:12}))
  })
  await page.goto('http://127.0.0.1:4336/web-chess/')
  const ready=()=>page.waitForFunction(()=>document.querySelector('.bottom .status')?.textContent==='ready')
  const sample=async stage=>report.samples.push({stage,...await page.evaluate(()=>({status:document.querySelector('.bottom .status')?.textContent,pv:document.querySelector('.pv-list')?.textContent,workersMade:window.__engineCount,commands:window.__uciCommands}))})
  await ready()
  await page.getByRole('button',{name:'Run analysis',exact:true}).click()
  await page.waitForFunction(()=>document.querySelector('.pv-list')?.textContent.includes('+0.35')&&document.querySelector('.bottom .status')?.textContent==='ready')
  await sample('initial reading')
  await page.getByRole('button',{name:'Engine Lab',exact:true}).click()
  await page.getByRole('button',{name:'Release engine',exact:true}).click()
  await page.waitForFunction(()=>document.querySelector('.bottom .status')?.textContent==='unloaded')
  await page.getByRole('button',{name:'Analyze',exact:true}).click()
  await sample('released')
  await page.evaluate(()=>{window.__failConsoleBoot=true})
  await page.getByRole('button',{name:'Load engine',exact:true}).click()
  await page.waitForFunction(()=>window.__engineCount===3&&document.querySelector('.bottom .status')?.textContent==='ready')
  await sample('fallback ready without requesting a new search')
  report.retained=report.samples[2].pv===report.samples[0].pv
  await page.screenshot({path:`${output}.png`})
  console.log(JSON.stringify(report,null,2))
 } finally {fs.writeFileSync(`${output}.json`,JSON.stringify(report,null,2));await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1})
