'use strict';
const fs=require('fs');const path=require('path');const vm=require('vm');
const PROJ_DIR=process.cwd();const APP_JS=path.join(PROJ_DIR,'app.js');
function createDomMock(){const noopCtx=()=>{const ctx={setTransform(){},fillRect(){},clearRect(){},getImageData:(x,y,w,h)=>({data:new Uint8ClampedArray((w||800)*(h||600)*4)}),putImageData(){},createImageData:(w,h)=>({data:new Uint8ClampedArray((w||800)*(h||600)*4),width:w,height:h}),save(){},restore(){},translate(){},scale(){},rotate(){},beginPath(){},closePath(){},arc(){},ellipse(){},fill(){},stroke(){},moveTo(){},lineTo(){},fillText(){},measureText:()=>({width:0}),drawImage(){}};return ctx;};const worldCtx=noopCtx();const fakeCanvas={width:800,height:600,getContext:()=>worldCtx,getBoundingClientRect:()=>({width:800,height:600,left:0,top:0})};const fakeEl={textContent:'',innerHTML:'',value:'50',style:{},classList:{add(){},remove(){},toggle(){},contains:()=>false},appendChild(){},removeChild(){},querySelectorAll:()=>[],querySelector:()=>null,addEventListener(){},removeEventListener(){},setAttribute(){},getAttribute:()=>null,removeAttribute(){},scrollWidth:0,scrollHeight:0,clientWidth:800,clientHeight:600,offsetWidth:800,offsetHeight:800,close(){},showModal(){},hidden:false};const canvasIds=new Set(['world','graph','geneGraph','obsGraph']);const doc={getElementById:(id)=>canvasIds.has(id)?fakeCanvas:fakeEl,querySelector:()=>fakeEl,querySelectorAll:()=>[],createElement:(tag)=>tag==='canvas'?fakeCanvas:fakeEl,createTextNode:()=>fakeEl,body:fakeEl,documentElement:fakeEl,addEventListener(){},removeEventListener(){},readyState:'complete'};const win={innerWidth:800,innerHeight:600,devicePixelRatio:1,addEventListener(){},removeEventListener(){},requestAnimationFrame:()=>0,cancelAnimationFrame:()=>0};return{document:doc,window:win};}
function loadApp(){let src=fs.readFileSync(APP_JS,'utf8');const exportsCode="\n    globalThis.__sim = { simulate, counts, sim, resetWorld, setSeed, compactIfNeeded, rebuildGrid, saveSnapshot, loadSnapshot, experimentSample, experimentRunArmSync, buildExperimentReport, };\n  ";src=src.replace(/\n  init\(\);\n\}\)\(\);\s*$/,"\n"+exportsCode+"\n})();\n");const{document,window}=createDomMock();class RO{observe(){}unobserve(){}disconnect(){}}const ctx={window,document,performance:{now:()=>Date.now()},requestAnimationFrame:()=>0,Intl,Number,Math,Date,console,setTimeout:()=>{},clearTimeout:()=>{},setInterval:()=>{},clearInterval:()=>{},ResizeObserver:RO,Float32Array,Uint8ClampedArray,Map,Set,Array,Object,String,Boolean,JSON,Error,ImageData:class{constructor(a,b){if(a instanceof Uint8ClampedArray){this.data=a;this.width=b;this.height=arguments[2]||b;}else{this.width=a;this.height=b||a;this.data=new Uint8ClampedArray(this.width*this.height*4);}}}};window.ResizeObserver=RO;ctx.globalThis=ctx;ctx.self=ctx;vm.createContext(ctx);vm.runInContext(src,ctx,{filename:'app.js'});return ctx.__sim;}
const api=loadApp();
const DT=1/60;const sec=s=>Math.round(s*60);
const DURATION_S=Number(process.env.TASK_927_DURATION_S||15);
const BLOCKS=Number(process.env.TASK_927_BLOCKS||5);
const OUT_DIR=path.join(PROJ_DIR,'task_927_results');

function step(dur){for(let i=0;i<sec(dur);i++){api.compactIfNeeded();api.rebuildGrid();api.simulate(DT);}}
function native(dur){api.loadSnapshot(snap);step(dur);}
function arm(dur){api.experimentRunArmSync(snap,dur,1,[dur/2,dur]);}
function measure(fn){
  const cpuStart=process.cpuUsage();
  const wallStart=process.hrtime.bigint();
  fn();
  const cpu=process.cpuUsage(cpuStart);
  return {cpu_ms:(cpu.user+cpu.system)/1000,wall_ms:Number(process.hrtime.bigint()-wallStart)/1e6};
}
function percentile(values,q){const sorted=values.slice().sort((a,b)=>a-b);return sorted[Math.max(0,Math.ceil(q*sorted.length)-1)];}

api.setSeed(20260916);api.resetWorld();step(120);
const snap=api.saveSnapshot();
native(Math.min(10,DURATION_S));arm(Math.min(10,DURATION_S));

const samples=[];
for(let block=0;block<BLOCKS;block++){
  const order=block%2===0?['native','arm','arm','native']:['arm','native','native','arm'];
  const runs=[];
  for(const kind of order)runs.push({kind,...measure(()=>kind==='native'?native(DURATION_S):arm(DURATION_S))});
  const nativeCpu=runs.filter(r=>r.kind==='native').reduce((sum,r)=>sum+r.cpu_ms,0);
  const armCpu=runs.filter(r=>r.kind==='arm').reduce((sum,r)=>sum+r.cpu_ms,0);
  samples.push({block: block+1,order,runs,native_cpu_ms:nativeCpu,arm_cpu_ms:armCpu,ratio:armCpu/nativeCpu});
}
const nativeTotal=samples.reduce((sum,s)=>sum+s.native_cpu_ms,0);
const armTotal=samples.reduce((sum,s)=>sum+s.arm_cpu_ms,0);
const ratios=samples.map(s=>s.ratio);
const result={
  schema:'micromundo.perf-gate/1',task:'task_927',clock:'process.cpuUsage',protocol:'ABBA balanced blocks',
  seed:20260916,warmup_sim_s:120,duration_sim_s:DURATION_S,blocks:BLOCKS,
  threshold:{aggregate_overhead_max_pct:5},
  metrics:{aggregate_ratio:armTotal/nativeTotal,aggregate_overhead_pct:(armTotal/nativeTotal-1)*100,
    ratio_p50:percentile(ratios,.5),ratio_p95:percentile(ratios,.95)},
  samples
};
result.pass=result.metrics.aggregate_ratio<=1.05;
fs.mkdirSync(OUT_DIR,{recursive:true});
fs.writeFileSync(path.join(OUT_DIR,'perf_gate.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
process.exit(result.pass?0:1);
