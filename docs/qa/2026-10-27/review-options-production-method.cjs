const fs=require('fs');
const path=require('path');
const {createRequire}=require('module');
const {execFileSync}=require('child_process');
const root='/workspace/web-chess';
const repoRequire=createRequire(path.join(root,'package.json'));
const source=fs.readFileSync(path.join(root,'scripts/test-ui-browser.cjs'),'utf8');
const name=process.env.UI_TEST_BROWSER||'chromium';
const names=(process.env.PRODUCTION_CHECKS||'checkEngineOptionEntry,checkReviewActionNames,checkThreadConfigurationOwnership,checkLabSettingsStayInSync,checkRawSpinOptionValues').split(',');
for(const item of names)if(!/^check[A-Za-z]+$/.test(item))throw new Error('Invalid check name');
const checks=new Function('require','__dirname','process',source.slice(0,source.lastIndexOf('\nmain().then('))+'\nreturn {'+names.join(',')+'};')(repoRequire,path.join(root,'scripts'),process);
(async()=>{
  console.log(JSON.stringify({browser:name,port:process.env.UI_TEST_PORT,commit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),build:'/tmp/web-chess-review-options-production',checks:names}));
  const browser=await repoRequire('playwright')[name].launch();
  try {
    for(const item of names){console.log(item);await checks[item](browser)}
    console.log('Production review/option checks passed.');
  }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
