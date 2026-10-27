const EDITOR_STORAGE='sanpu.editor.v1';
export const LIVE_APP_URL='https://shandianchengzi.github.io/SanPu/';
export const LIVE_MANIFEST_URL=LIVE_APP_URL+'build-info.json';

function validCommit(value){return typeof value==='string'&&(/^[0-9a-f]{7,40}$/i.test(value)||value==='development');}
export function normalizeBuild(value){
  if(!value||typeof value!=='object')return null;
  const commit=validCommit(value.commit)?value.commit.toLowerCase():'development';
  return {
    version:typeof value.version==='string'?value.version:'0.0.0',
    commit,
    shortCommit:commit==='development'?'development':commit.slice(0,7),
    builtAt:typeof value.builtAt==='string'?value.builtAt:''
  };
}
export function hasNewBuild(current,latest){
  if(!latest||latest.commit==='development')return false;
  return !current||current.commit==='development'||current.commit!==latest.commit;
}
function bytesToBase64(bytes){
  let binary='';
  for(let start=0;start<bytes.length;start+=0x8000)
    binary+=String.fromCharCode(...bytes.subarray(start,start+0x8000));
  return btoa(binary).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
}
function base64ToBytes(encoded){
  const padded=encoded.replaceAll('-','+').replaceAll('_','/')+'==='.slice((encoded.length+3)%4);
  const binary=atob(padded),bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  return bytes;
}
export function encodeEditorState(raw){
  if(typeof raw!=='string'||!raw||raw.length>1500000)return '';
  try{
    const parsed=JSON.parse(raw);
    if(!parsed||typeof parsed.source!=='string')return '';
    return bytesToBase64(new TextEncoder().encode(raw));
  }catch{return '';}
}
export function decodeEditorState(encoded){
  if(typeof encoded!=='string'||!encoded||encoded.length>2200000)return '';
  try{
    const raw=new TextDecoder().decode(base64ToBytes(encoded));
    const parsed=JSON.parse(raw);
    return parsed&&typeof parsed.source==='string'?raw:'';
  }catch{return '';}
}
export function liveSyncUrl(commit,rawState=''){
  const url=new URL(LIVE_APP_URL);
  if(validCommit(commit)&&commit!=='development')url.searchParams.set('synced',commit.slice(0,7));
  const state=encodeEditorState(rawState);
  if(state)url.hash='sanpu-state='+state;
  return url.toString();
}
export function transferredState(hash){
  const match=String(hash||'').match(/^#sanpu-state=([A-Za-z0-9_-]+)$/);
  return match?decodeEditorState(match[1]):'';
}

function restoreTransferredState(){
  if(location.hostname!==new URL(LIVE_APP_URL).hostname)return false;
  const raw=transferredState(location.hash);
  if(!raw)return false;
  try{
    localStorage.setItem(EDITOR_STORAGE,raw);
    history.replaceState(null,'',location.pathname+location.search);
    return true;
  }catch{return false;}
}
async function fetchBuild(url){
  const join=url.includes('?')?'&':'?';
  const response=await fetch(url+join+'cache='+Date.now(),{cache:'no-store'});
  if(!response.ok)throw new Error('HTTP '+response.status);
  const build=normalizeBuild(await response.json());
  if(!build)throw new Error('invalid build manifest');
  return build;
}
function describe(build){return build?`${build.version} · ${build.shortCommit}`:'未知';}
function openDialog(dialog){
  if(typeof dialog.showModal==='function'&&!dialog.open)dialog.showModal();
  else dialog.setAttribute('open','');
}
function initUpdateChecker(){
  const button=document.getElementById('update-button');
  const label=document.getElementById('update-label');
  const dialog=document.getElementById('update-dialog');
  const message=document.getElementById('update-message');
  const currentText=document.getElementById('update-current');
  const latestText=document.getElementById('update-latest');
  const recheck=document.getElementById('update-recheck');
  const sync=document.getElementById('update-sync');
  if(!button||!dialog)return;
  let latest=null;
  async function check(showDialog=false){
    button.disabled=true;sync.disabled=true;button.dataset.state='checking';label.textContent='检查中…';
    message.textContent='正在连接 GitHub 检查最新版本……';
    if(showDialog)openDialog(dialog);
    try{
      const [current,remote]=await Promise.all([
        fetchBuild('./build-info.json').catch(()=>normalizeBuild({commit:'development',version:'开发版'})),
        fetchBuild(LIVE_MANIFEST_URL)
      ]);
      latest=remote;currentText.textContent=describe(current);latestText.textContent=describe(remote);
      if(hasNewBuild(current,remote)){
        button.dataset.state='available';label.textContent='发现更新';sync.disabled=false;
        message.textContent='GitHub 上已有更新版本。可立即在应用内同步，新功能无需等待重新安装。';
      }else{
        button.dataset.state='current';label.textContent='已是最新';
        message.textContent='当前功能已经与 GitHub 仓库的最新构建同步。';
      }
    }catch{
      latest=null;button.dataset.state='offline';label.textContent='离线可用';
      currentText.textContent='内置版本';latestText.textContent='无法连接';
      message.textContent='暂时无法连接 GitHub。你仍可使用安装包中的完整离线版本，联网后再检查。';
    }finally{button.disabled=false;}
  }
  button.addEventListener('click',()=>check(true));
  recheck.addEventListener('click',()=>check(false));
  sync.addEventListener('click',()=>{
    if(!latest)return;
    let saved='';
    try{saved=localStorage.getItem(EDITOR_STORAGE)||'';}catch{/* unavailable storage */}
    location.assign(liveSyncUrl(latest.commit,saved));
  });
  setTimeout(()=>check(false),650);
}

if(typeof document!=='undefined'&&typeof location!=='undefined'){
  restoreTransferredState();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initUpdateChecker,{once:true});
  else initUpdateChecker();
}
