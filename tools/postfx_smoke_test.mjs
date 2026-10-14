import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';

const address=new URL(process.env.PORTFOLIO_URL||'http://127.0.0.1:5174/Corden-Portfolio/');
assert(['127.0.0.1','localhost','[::1]'].includes(address.hostname),'smoke tests only use localhost');
const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const dir=path.resolve('.work/screenshots/postfx');
await fs.mkdir(dir,{recursive:true});
const records=[];

async function take(context,chapter,baseline,name) {
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url())});
  const url=new URL(address);url.search=new URLSearchParams({view:'scene',chapter,still:'1',postfx:baseline?'0':'1'}).toString();
  await page.goto(url.href,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__PAPER_3D?.ready||document.querySelector('.error-screen'),null,{timeout:60000});
  assert.equal(await page.locator('.error-screen').count(),0,'scene loaded '+name);
  await page.waitForFunction(()=>window.__PAPER_3D?.ready&&!window.__PAPER_3D.moving);
  await page.waitForTimeout(500);
  const stats=await page.evaluate(()=>({...window.__PAPER_3D}));
  const shot=await page.locator('.scene-canvas canvas').screenshot({path:path.join(dir,'smoke-'+name+'-'+(baseline?'baseline':'treated')+'.png')});
  const before=await page.evaluate(()=>({...window.__PAPER_3D}));
  await page.waitForTimeout(900);
  const after=await page.evaluate(()=>({...window.__PAPER_3D}));
  assert.equal(after.renderFrames,before.renderFrames,'stationary expensive frames reused: '+name);
  assert(after.cachedFrames>before.cachedFrames,'cached presentations: '+name);
  assert.equal(after.paperSwayStrength,0,'reading geometry is static: '+name);
  assert.deepEqual(errors,[],name+' errors');
  await page.close();
  return {image:shot.toString('base64'),stats,before,after};
}

async function compare(context,a,b){
  const page=await context.newPage();
  const metrics=await page.evaluate(async images=>{
    async function decode(base64){const im=new Image();im.src='data:image/png;base64,'+base64;await im.decode();const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(im,0,0);return {p:x.getImageData(0,0,c.width,c.height).data,w:c.width,h:c.height}}
    const before=await decode(images[0]),after=await decode(images[1]);
    if(before.w!==after.w||before.h!==after.h)throw new Error('different render resolutions');
    let delta=0,netLight=0,changed=0,baseEdge=0,tunedEdge=0,coreCount=0,centerDelta=0,centerCount=0,brightBefore=0,brightAfter=0;
    const n=before.w*before.h,p=before.p,q=after.p;
    for(let i=0;i<p.length;i+=4){
      const y=Math.floor(i/(4*before.w)),x=(i/4)%before.w;
      const dr=Math.abs(p[i]-q[i]),dg=Math.abs(p[i+1]-q[i+1]),db=Math.abs(p[i+2]-q[i+2]);
      const diff=(dr+dg+db)/3;
      delta+=diff;if(diff>3)changed++;
      const old=.2126*p[i]+.7152*p[i+1]+.0722*p[i+2];
      const now=.2126*q[i]+.7152*q[i+1]+.0722*q[i+2];
      netLight+=now-old;if(old>210)brightBefore++;if(now>210)brightAfter++;
      if(x>before.w*.25&&x<before.w*.75&&y>before.h*.22&&y<before.h*.70){
        centerDelta+=diff;centerCount++;
        if(x<before.w-1){const j=i+4;for(let k=0;k<3;k++){baseEdge+=Math.abs(p[i+k]-p[j+k]);tunedEdge+=Math.abs(q[i+k]-q[j+k]);}}
      }
    }
    return {meanDifference:delta/n,lightShift:netLight/n,changedFraction:changed/n,edgeRatio:tunedEdge/Math.max(1,baseEdge),centerDifference:centerDelta/Math.max(1,centerCount),brightRatio:brightAfter/Math.max(1,brightBefore)};
  },[a,b]);
  await page.close();
  return metrics;
}

async function run(name,chapter,viewport){
  const context=await browser.newContext({viewport,deviceScaleFactor:1,reducedMotion:'reduce'});
  await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.hostname==='fonts.googleapis.com')return route.fulfill({contentType:'text/css',body:''});return url.origin===address.origin?route.continue():route.abort()});
  try{
    const original=await take(context,chapter,true,name);
    const treated=await take(context,chapter,false,name);
    const measured=await compare(context,original.image,treated.image);
    assert(measured.meanDifference>.25,'postprocess makes measurable difference: '+name);
    assert(measured.meanDifference<6.0,'atmosphere remains bounded: '+name);
    assert(measured.edgeRatio>.93&&measured.edgeRatio<1.07,'foreground edges remain sharp: '+name);
    if (chapter !== 'intro') assert(measured.centerDifference<3.0,'reading surface contrast preserved: '+name);
    const brightLimit=chapter==='intro'?1.5:chapter==='screen'?1.2:1.1;
    assert(measured.brightRatio>.90&&measured.brightRatio<brightLimit,'highlight growth stays bounded: '+name);
    assert.equal(original.stats.frame,treated.stats.frame,'authored camera frame unchanged');
    assert.equal(original.stats.quality,viewport.width<720?'balanced':'cinema','quality tier intact');
    console.log('PASS',name,JSON.stringify(measured));
    records.push({name,chapter,viewport,measured,status:'passed'});
  }catch(e){console.error('FAIL',name,e.stack);records.push({name,status:'failed',error:e.message});}
  finally{await context.close();}
}
async function qualitySwitch() {
  const name='quality-switch-desktop';
  const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1,reducedMotion:'reduce'});
  await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.hostname==='fonts.googleapis.com')return route.fulfill({contentType:'text/css',body:''});return url.origin===address.origin?route.continue():route.abort()});
  try{
    const page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',message=>{if(message.type()==='error')errors.push(message.text())});
    const url=new URL(address);url.search=new URLSearchParams({chapter:'paper-a',still:'1'}).toString();
    await page.goto(url.href,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.__PAPER_3D?.ready,null,{timeout:60000});
    const control=page.locator('.quality-toggle');
    await control.click();
    await page.waitForFunction(()=>window.__PAPER_3D?.quality==='balanced');
    const lite=await page.locator('.scene-canvas canvas').screenshot();
    assert(lite.length>2000,'LITE rendered after update');
    await control.click();
    await page.waitForFunction(()=>window.__PAPER_3D?.quality==='cinema');
    // Canvas DPR/composer resets deliberately schedule a few warm-up frames.
    // Measure cached-idle behavior only after those known frames finish.
    await page.waitForTimeout(650);
    const before=await page.evaluate(()=>({...window.__PAPER_3D}));
    await page.waitForTimeout(900);
    const after=await page.evaluate(()=>({...window.__PAPER_3D}));
    assert.equal(after.renderFrames,before.renderFrames,'full-scene redraw not forced by film look');
    assert(after.cachedFrames>before.cachedFrames,'quality toggles retain cached presentation');
    assert.deepEqual(errors,[],'quality-change shader and render errors');
    records.push({name,status:'passed',liteBytes:lite.length});
    console.log('PASS',name);
  }catch(e){console.error('FAIL',name,e.stack);records.push({name,status:'failed',error:e.message});}
  finally{await context.close();}
}

try{
  await run('intro-desktop','intro',{width:1440,height:900});
  await run('reading-desktop','paper-a',{width:1440,height:900});
  await run('screen-desktop','screen',{width:1440,height:900});
  await run('reading-mobile','paper-a',{width:390,height:844});
  await qualitySwitch();
}finally{await browser.close();await fs.writeFile(path.join(dir,'smoke-results.json'),JSON.stringify({passed:records.filter(x=>x.status==='passed').length,failed:records.filter(x=>x.status==='failed').length,records},null,2))}
if(records.some(x=>x.status==='failed'))process.exitCode=1;
