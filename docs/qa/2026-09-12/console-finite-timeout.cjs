const { chromium }=require('/Users/teo/Developer/web-chess/node_modules/playwright')
const fs=require('node:fs'),vm=require('node:vm'),{execFileSync}=require('node:child_process')
const source=fs.readFileSync('/Users/teo/Developer/web-chess/scripts/test-ui-browser.cjs','utf8')
const code=source.slice(source.indexOf('function fakeEngineScript('),source.indexOf('async function checkHiddenAnalysisPausesAndResumes'))
const fake=vm.runInNewContext(code+"\nfakeEngineScript('console-search')",{SAMPLE_PGN:''})
;(async()=>{
 const b=await chromium.launch(),p=await b.newPage({viewport:{width:1280,height:812}})
 const result={sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),engine:'held UCI fixture',clock:'Playwright virtual time'}
 try {
 await p.clock.install();await p.addInitScript(fake)
 await p.addInitScript(()=>localStorage.setItem('webchess:analysis-settings:v1',JSON.stringify({workspaceMode:'analysis',analysisExperience:'pro',analysisTab:'engine-lab',autoAnalyze:false,engineProfile:'lite-single-local',expertModeEnabled:true})))
 await p.goto('http://127.0.0.1:4324/web-chess/');await p.waitForFunction(()=>document.querySelector('.bottom .status')?.textContent==='ready')
 const input=p.getByRole('textbox',{name:'UCI command',exact:true})
 await input.fill('position fen rnb1kbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');await input.press('Enter')
 await p.waitForFunction(()=>document.querySelector('[aria-label="UCI command"]')?.value==='')
 await input.fill('go movetime 120000');await input.press('Enter')
 await p.getByLabel('UCI console output',{exact:true}).filter({hasText:'score cp 900'}).waitFor()
 await p.clock.fastForward(90_100)
 result.after90Seconds=await p.evaluate(()=>({commands:window.__uciCommands,status:document.querySelector('.bottom .status')?.textContent,error:document.querySelector('.error-copy')?.textContent,lastRun:[...document.querySelectorAll('.command-summary')].find(el=>el.textContent.includes('Last run:'))?.textContent}))
 console.log(JSON.stringify(result))
 await p.locator('.error-copy').scrollIntoViewIfNeeded();await p.screenshot({path:'/tmp/web-chess-console-finite-timeout.png'})
 }finally{fs.writeFileSync('/tmp/web-chess-console-finite-timeout.json',JSON.stringify(result,null,2));await b.close()}
})().catch(e=>{console.error(e);process.exitCode=1})
