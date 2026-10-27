const path=require('node:path'),pw=require(path.resolve('node_modules/playwright'))
;(async()=>{const browser=await pw.chromium.launch(),context=await browser.newContext({viewport:{width:375,height:812},hasTouch:true,reducedMotion:'reduce'}),page=await context.newPage(),errors=[],wasm=[]
page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.url().includes('.wasm'))wasm.push({url:r.url(),status:r.status()})})
try {
await page.addInitScript(()=>{
localStorage.setItem('webchess:analysis-settings:v1',JSON.stringify({workspaceMode:'play',autoAnalyze:false,lastDifficulty:7,timeControlId:'3+2',soundEnabled:false}))
window.__watchTitleTrace={commands:[],messages:[],titles:[]};const NativeWorker=Worker
function ObservedWorker(...args){const worker=new NativeWorker(...args),post=worker.postMessage.bind(worker);worker.postMessage=(...data)=>{const text=String(data[0]);if(/^(go |position |stop$|setoption name Threads)/.test(text))window.__watchTitleTrace.commands.push(text);return post(...data)};worker.addEventListener('message',event=>{const text=String(event.data);if(/^(bestmove|id name)/.test(text))window.__watchTitleTrace.messages.push({text,native:event.isTrusted})});return worker}
ObservedWorker.prototype=NativeWorker.prototype;Object.setPrototypeOf(ObservedWorker,NativeWorker);window.Worker=ObservedWorker
addEventListener('DOMContentLoaded',()=>new MutationObserver(()=>window.__watchTitleTrace.titles.push(document.title)).observe(document.querySelector('title'),{childList:true,subtree:true,characterData:true}))
})
await page.goto('http://127.0.0.1:4336/web-chess/',{waitUntil:'domcontentloaded'})
await page.getByRole('button',{name:'Start new game',exact:true}).first().click();const dialog=page.locator('.new-game-dialog');await dialog.locator('.mode-card',{hasText:'AI vs AI'}).click();await dialog.locator('.time-control-card',{hasText:'3 + 2'}).click();await dialog.locator('.btn-start').click();await dialog.waitFor({state:'detached'})
await page.getByRole('button',{name:'Set AI speed to Step',exact:true}).click()
const waitTitle=title=>page.waitForFunction(title=>document.title===title+' · Web Chess',title,{timeout:45000})
await waitTitle('AI waiting for Step');const before=await page.locator('.mtree-chip').count()
await page.getByRole('button',{name:'Advance one AI move',exact:true}).press('Enter');await waitTitle('Engine thinking');await waitTitle('AI waiting for Step');const stepped=await page.locator('.mtree-chip').count()
if(stepped!==before+1)throw Error('One Step did not play exactly one real move')
await page.getByRole('button',{name:'Set AI speed to Normal',exact:true}).click();await waitTitle('AI paused');await page.getByRole('button',{name:'Resume AI play',exact:true}).press('Enter');await waitTitle('Engine thinking');await page.getByRole('button',{name:'Pause AI',exact:true}).press('Enter');await waitTitle('AI paused');await page.waitForFunction(()=>document.querySelectorAll('.clock-face.running').length===0)
const trace=await page.evaluate(()=>window.__watchTitleTrace),moves=await page.locator('.mtree-chip').allTextContents(),banks=await page.locator('.clock-face strong').allTextContents()
console.log(JSON.stringify({before,stepped,moves,banks,title:await page.title(),trace,wasm,errors,appError:await page.locator('.app-error-shell').count()}))
if(!trace.messages.some(m=>m.native&&m.text.startsWith('bestmove'))||!trace.commands.includes('setoption name Threads value 1')||!wasm.some(r=>r.status===200)||errors.length||await page.locator('.app-error-shell').count())throw Error('Real watch-title verification failed')
}finally{await context.close();await browser.close()}})().catch(error=>{console.error(error);process.exitCode=1})
