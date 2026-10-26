import {EXAMPLE, parseSong, noteFrequency} from './core.mjs';

const $ = id => document.getElementById(id);
const SVG_NS = 'http://www.w3.org/2000/svg';
const STORAGE = 'sanpu.editor.v1';
const els = {
  source:$('source'), score:$('score'), warnings:$('warnings'),
  noteCount:$('note-count'), tempo:$('tempo'), tempoValue:$('tempo-value'),
  play:$('play-btn'),stop:$('stop-btn'),saved:$('saved')
};
const state = { song:null, tempo:72, audio:null, nodes:[], playing:false, position:0, origin:0, frame:0, schedule:[], total:0, active:-1 };
function message(msg) {els.saved.textContent=msg;}
function persist() {
  try { localStorage.setItem(STORAGE,JSON.stringify({source:els.source.value, tempo:state.tempo}));message('已自动保存在本机'); }
  catch {message('无法自动保存，请使用「保存源码」备份');}
}
function load() {
  let settings=null;
  try{settings=JSON.parse(localStorage.getItem(STORAGE)||'null');}catch{ /* corrupt storage */ }
  els.source.value=typeof settings?.source === 'string' ? settings.source : EXAMPLE;
  state.tempo=Math.max(35,Math.min(180,Number(settings?.tempo)||72));
  els.tempo.value=String(state.tempo);
  els.tempoValue.textContent=String(state.tempo);
}
function svg(tag,attrs={},text) {
  const el=document.createElementNS(SVG_NS,tag);
  for(const [k,v] of Object.entries(attrs))el.setAttribute(k,String(v));
  if(text!==undefined)el.textContent=String(text);
  return el;
}
// A bar is not a rhythmic constraint in free mode. Keep the recorded notes unchanged.
const SCORE = {"pad":30,"note":65,"dash":29,"bar":24,"height":195};
function estimateWidth(element,song) {
  if (element.kind==='bar') return SCORE.bar;
  const lyric=song.lyrics.get(element.id);
  const chars=Array.from(lyric?.text||'').length;
  const dash=(element.suffix.match(/-/g)||[]).length;
  return SCORE.note + dash*SCORE.dash + Math.max(0,chars-1)*29;
}
function systems(song) {
  const lines=[];
  let current=[];
  for(const element of song.elements) {
    if(element.kind==='break') {
      if(current.length){lines.push(current);current=[];}
      continue;
    }
    current.push(element);
  }
  if(current.length)lines.push(current);
  return lines;
}
function lineWidth(elements,song) {
  return SCORE.pad*2+elements.reduce((width,element)=>width+estimateWidth(element,song),0);
}
function drawSystem(elements,song,width) {
  const s=svg('svg',{viewBox:`0 0 ${width} ${SCORE.height}`,class:'score-line',role:'img','aria-label':'数字简谱与对应歌词'});
  const notes=elements.filter(e=>e.kind==='note');
  const natural=lineWidth(elements,song);
  const extra=Math.min(24,Math.max(0,(width-natural)/Math.max(1,notes.length)));
  let x=SCORE.pad;
  for(const e of elements) {
    if(e.kind==='bar'){
      const barX=x+9;
      s.append(svg('line',{x1:barX,x2:barX,y1:44,y2:115,class:'bar'}));
      x+=SCORE.bar;
      continue;
    }
    const n=e, w=estimateWidth(n,song)+extra, cx=x+SCORE.note/2;
    const g=svg('g',{class:'note-click','data-note-id':n.id,tabindex:0,role:'button','aria-label':`第 ${n.measure} 小节第 ${n.noteIndex} 音 ${n.raw}，点击从此处播放`});
    const lyr=song.lyrics.get(n.id);
    g.append(svg('rect',{x:x+1,y:15,width:w-2,height:171,rx:4,class:'note-bg'}));
    if(n.accidental)g.append(svg('text',{x:cx-23,y:80,'text-anchor':'middle',class:'accidental'},n.accidental));
    g.append(svg('text',{x:cx,y:80,class:'note-num','text-anchor':'middle'},n.degree));
    if(n.octave>0){
      for(let k=0;k<Math.min(n.octave,3);k++)g.append(svg('circle',{cx,cy:33-k*9,r:3.3,class:'octave'}));
    }else if(n.octave<0){
      for(let k=0;k<Math.min(-n.octave,3);k++)g.append(svg('circle',{cx,cy:113+k*9,r:3.3,class:'octave'}));
    }
    const under=(n.suffix.match(/_/g)||[]).length;
    for(let k=0;k<under;k++)g.append(svg('line',{x1:cx-18,x2:cx+18,y1:92+k*8,y2:92+k*8,class:'rhythm'}));
    const dots=(n.suffix.match(/\./g)||[]).length;
    for(let k=0;k<dots;k++)g.append(svg('circle',{cx:cx+27+k*11,cy:72,r:3,class:'octave'}));
    const dashes=(n.suffix.match(/-/g)||[]).length;
    for(let k=0;k<dashes;k++)g.append(svg('line',{x1:cx+25+k*SCORE.dash,x2:cx+44+k*SCORE.dash,y1:69,y2:69,class:'rhythm'}));
    if(lyr?.text)g.append(svg('text',{x:cx,y:164,'text-anchor':'middle',class:'lyrics-text'},lyr.text));
    g.addEventListener('click',()=>playFrom(n.id));
    g.addEventListener('keydown',ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();playFrom(n.id);}});
    s.append(g);
    x+=w;
  }
  return s;
}
function render() {
  const song=state.song;
  els.score.replaceChildren();
  els.noteCount.textContent=`${song.notes.length} 个音符`;
  const title=document.createElement('h2');title.className='score-title';title.textContent=song.title;
  const meta=document.createElement('div');meta.className='score-meta';
  const tonic=document.createElement('span');tonic.className='score-tonic';tonic.textContent=`1 = ${song.key}`;
  const tempo=document.createElement('span');tempo.className='score-tempo';
  tempo.textContent=`♩ = ${state.tempo}`;
  tempo.setAttribute('aria-label',`四分音符每分钟 ${state.tempo} 拍`);
  meta.append(tonic,tempo);
  els.score.append(title,meta);
  const lines=systems(song);
  const width=Math.max(980,...lines.map(line=>lineWidth(line,song)));
  if(!song.notes.length){const blank=document.createElement('p');blank.className='empty';blank.textContent='在左侧输入 .Voice 音符，即可开始创作。';els.score.append(blank);}
  for(const line of lines)els.score.append(drawSystem(line,song,width));
  els.warnings.replaceChildren();
  const msgs=[...new Set(song.warnings)];
  for(const w of msgs){const p=document.createElement('div');p.textContent='⚠ '+w;els.warnings.append(p);}
  highlight(state.active);
}
function refresh() {
  stopAudio();state.song=parseSong(els.source.value);
  render();persist();
}
function buildSchedule(){let cursor=0;const sec=60/state.tempo;state.schedule=state.song.notes.map(n=>{const item={id:n.id,start:cursor,end:cursor+n.beats*sec,freq:noteFrequency(n,state.song.key)};cursor=item.end;return item;});state.total=cursor;}
function clearNodes(){for(const n of state.nodes){try{n.stop();}catch{/* node already finished */}try{n.disconnect();}catch{}}state.nodes=[];}
function highlight(id) {
  state.active=id;
  for(const g of els.score.querySelectorAll('.note-click'))g.classList.toggle('active',Number(g.dataset.noteId)===id);
}
function stopAudio(){cancelAnimationFrame(state.frame);clearNodes();state.playing=false;state.position=0;highlight(-1);els.play.textContent='▶ 播放';}
async function runPlayback() {
  if(!state.song?.notes.length)return;
  if(state.playing){state.position=Math.max(0,state.audio.currentTime-state.origin);state.playing=false;clearNodes();cancelAnimationFrame(state.frame);els.play.textContent='▶ 继续';return;}
  if(!state.audio){const Ctor=window.AudioContext||window.webkitAudioContext;if(!Ctor){alert('当前浏览器不支持 Web Audio。');return;}state.audio=new Ctor();}
  try{await state.audio.resume();}catch{alert('浏览器无法启用音频。');return;}
  buildSchedule();if(state.position>=state.total-.01)state.position=0;
  const now=state.audio.currentTime;state.origin=now-state.position;
  for(const ev of state.schedule){
    if(ev.end<=state.position||!ev.freq)continue;
    const start=Math.max(ev.start,state.position);
    const begin=state.origin+start,end=state.origin+ev.end;
    const oscillator=state.audio.createOscillator(), gain=state.audio.createGain();
    oscillator.type='sine';oscillator.frequency.setValueAtTime(ev.freq,begin);
    gain.gain.setValueAtTime(.0001,begin);gain.gain.linearRampToValueAtTime(.14,begin+.018);
    gain.gain.setValueAtTime(.14,Math.max(begin+.019,end-.045));
    gain.gain.exponentialRampToValueAtTime(.0001,end);
    oscillator.connect(gain);gain.connect(state.audio.destination);
    oscillator.start(begin);oscillator.stop(end+.01);state.nodes.push(oscillator);
  }
  state.playing=true;els.play.textContent='Ⅱ 暂停';
  const tick=()=>{
    if(!state.playing)return;
    state.position=state.audio.currentTime-state.origin;
    if(state.position>=state.total){stopAudio();return;}
    const item=state.schedule.find(x=>state.position>=x.start && state.position<x.end);
    if(item && item.id!==state.active)highlight(item.id);
    state.frame=requestAnimationFrame(tick);
  };tick();
}
function playFrom(id){buildSchedule();state.position=state.schedule.find(i=>i.id===id)?.start??0;clearNodes();state.playing=false;cancelAnimationFrame(state.frame);runPlayback();}
function download(name,bytes,type) {
  const url=URL.createObjectURL(new Blob([bytes],{type}));const a=document.createElement('a');
  a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);
}
function fileName(){return (state.song.title||'SanPu').replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').slice(0,70)||'SanPu';}
function readTextFile(file) {
  return file.arrayBuffer().then(buf=>{
    const u=new Uint8Array(buf);
    if(u[0]===255 && u[1]===254) return new TextDecoder('utf-16le').decode(buf);
    if(u[0]===254 && u[1]===255) return new TextDecoder('utf-16be').decode(buf);
    if(u.length>6 && u[1]===0 && u[3]===0) return new TextDecoder('utf-16le').decode(buf);
    return new TextDecoder('utf-8').decode(buf);
  });
}
let saveTimer;
load();state.song=parseSong(els.source.value);render();
els.source.addEventListener('input',()=>{clearTimeout(saveTimer);saveTimer=setTimeout(refresh,180);});
$('import-btn').addEventListener('click',()=>$('file-input').click());
$('file-input').addEventListener('change',async ev=>{const file=ev.target.files[0];if(!file)return;try{els.source.value=await readTextFile(file);refresh();}catch(err){alert(`导入失败：${err.message}`);}finally{ev.target.value='';}});
$('save-btn').addEventListener('click',()=>download(fileName()+'.jpwabc','\ufeff'+els.source.value,'text/plain;charset=utf-8'));
$('example-btn').addEventListener('click',()=>{if(els.source.value!==EXAMPLE&&!confirm('将当前内容替换成示例谱？当前内容可以先用「保存源码」备份。'))return;els.source.value=EXAMPLE;refresh();});
$('pdf-btn').addEventListener('click',()=>{if(!state.song.notes.length)return;window.print();});
els.play.addEventListener('click',runPlayback);
els.stop.addEventListener('click',stopAudio);
els.tempo.addEventListener('input',ev=>{state.tempo=Number(ev.target.value);els.tempoValue.textContent=String(state.tempo);render();if(state.playing){const id=state.active;playFrom(Math.max(id,0));}persist();});
let resizeTimer;
window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(render,120);});
window.addEventListener('beforeprint',()=>{render();});
window.addEventListener('afterprint',()=>render());
