const { chromium } = require('/Users/teo/Developer/web-chess/node_modules/playwright')
const fs = require('node:fs'), { execFileSync } = require('node:child_process')
const result = { base: 'http://127.0.0.1:4336/web-chess/', sourceCommit: 'c81dcac', snapshots: [] }
const pause = ms => new Promise(r => setTimeout(r, ms))
;(async () => {
  const browser = await chromium.launch()
  const root = await browser.newBrowserCDPSession()
  let messageId = 0
  const inspectWorker = async target => {
    const { sessionId } = await root.send('Target.attachToTarget', { targetId: target.targetId, flatten: false })
    const call = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++messageId
      const timer = setTimeout(() => { root.off('Target.receivedMessageFromTarget', listener); reject(new Error(`${method} timed out`)) }, 5000)
      const listener = event => {
        if (event.sessionId !== sessionId) return
        const answer = JSON.parse(event.message)
        if (answer.id !== id) return
        clearTimeout(timer); root.off('Target.receivedMessageFromTarget', listener)
        if (answer.error) reject(new Error(JSON.stringify(answer.error))); else resolve(answer.result)
      }
      root.on('Target.receivedMessageFromTarget', listener)
      root.send('Target.sendMessageToTarget', { sessionId, message: JSON.stringify({ id, method, params }) }).catch(reject)
    })
    try {
      const heap = await call('Runtime.getHeapUsage')
      const prototype = await call('Runtime.evaluate', { expression: 'WebAssembly.Memory.prototype', objectGroup: 'probe' })
      const objects = await call('Runtime.queryObjects', { prototypeObjectId: prototype.result.objectId, objectGroup: 'probe' })
      const memories = await call('Runtime.callFunctionOn', { objectId: objects.objects.objectId,
        functionDeclaration: 'function(){ return Array.from(this, m => ({ bytes: m.buffer.byteLength, shared: Object.prototype.toString.call(m.buffer) === "[object SharedArrayBuffer]" })) }', returnByValue: true })
      await call('Runtime.releaseObjectGroup', { objectGroup: 'probe' })
      return { url: target.url, heap, memories: memories.result.value }
    } finally { await root.send('Target.detachFromTarget', { sessionId }).catch(() => {}) }
  }
  const snapshot = async (label, page) => {
    await pause(500)
    const { processInfo } = await root.send('SystemInfo.getProcessInfo')
    const rows = execFileSync('ps', ['-p', processInfo.map(p => p.id).join(','), '-o', 'pid=,rss='], {encoding:'utf8'}).trim().split('\n')
    const rss = new Map(rows.map(r => r.trim().split(/\s+/).map(Number)))
    const { targetInfos } = await root.send('Target.getTargets')
    const workers = targetInfos.filter(t => t.type === 'worker')
    const primary = workers.filter(t => !t.url.endsWith(',worker'))
    const info = { label, status: await page.locator('.bottom .status').allTextContents(), workers: workers.length,
      processes: processInfo.map(p => ({...p,rssKiB:rss.get(p.id)})),
      mainWorkers: [] }
    for (const target of primary) {
      try { info.mainWorkers.push(await inspectWorker(target)) } catch(error) { info.mainWorkers.push({error:String(error),url:target.url}) }
    }
    result.snapshots.push(info); console.log(JSON.stringify(info))
  }
  try {
    const context = await browser.newContext({viewport:{width:1280,height:812}})
    await context.route(/https:\/\/(lichess\.org|[^/]*lichess\.ovh)\//,route=>route.fulfill({status:404,body:'{}'}))
    await context.addInitScript(() => {
      localStorage.setItem('webchess:analysis-settings:v1', JSON.stringify({workspaceMode:'analysis',analysisExperience:'pro',autoAnalyze:false,engineProfile:'lite-multi-local',analyzeMode:'deep',searchDepth:12,hashMb:64}))
      window.__commands=[]; window.__bestmoves=0
      const NativeWorker=Worker
      window.Worker=class extends NativeWorker {
        constructor(...args){super(...args);this.addEventListener('message',e=>{if(typeof e.data==='string'&&e.data.startsWith('bestmove '))window.__bestmoves++})}
        postMessage(data,...args){if(typeof data==='string')window.__commands.push(data);return super.postMessage(data,...args)}
      }
    })
    const page=await context.newPage(); await page.goto(result.base)
    await page.waitForFunction(()=>document.querySelector('.bottom .status')?.textContent==='ready')
    await snapshot('booted idle',page)
    await page.getByRole('button',{name:'Run analysis',exact:true}).click()
    await page.waitForFunction(()=>window.__bestmoves>=1)
    await snapshot('after depth-12 search',page)
    await page.getByRole('button',{name:'Play',exact:true}).click()
    await snapshot('engine disabled in Play',page)
    await pause(3000)
    await snapshot('Play after 3 more seconds',page)
    console.log('playwright workers',page.workers().map(w=>w.url()))
    await page.getByRole('button',{name:'Analysis',exact:true}).click()
    await page.waitForFunction(()=>document.querySelector('.bottom .status')?.textContent==='ready')
    await snapshot('Analysis reopened',page)
    await page.getByRole('button',{name:'Play',exact:true}).click()
    await pause(3000)
    await snapshot('second Play after 3 seconds',page)
    result.commands=await page.evaluate(()=>window.__commands)
  } finally { await browser.close(); fs.writeFileSync('/tmp/web-chess-engine-memory-probe.json',JSON.stringify(result,null,2)) }
})().catch(error=>{console.error(error);process.exitCode=1})
