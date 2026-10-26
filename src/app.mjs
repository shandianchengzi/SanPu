import {EXAMPLE, parseSong, noteFrequency} from './core.mjs';
import {FORMAT_GROUPS, DEFAULT_FORMAT, FORMAT_PRESETS, FONTS, normalizeFormat, formatPresetId} from './format.mjs';

const $ = id => document.getElementById(id);
const SVG_NS = 'http://www.w3.org/2000/svg';
const STORAGE = 'sanpu.editor.v1';
const els = {
  source:$('source'), score:$('score'), warnings:$('warnings'),
  noteCount:$('note-count'), tempo:$('tempo'), tempoValue:$('tempo-value'),
  play:$('play-btn'),stop:$('stop-btn'),saved:$('saved'), formatControls:$('format-controls'), formatPreset:$('format-preset')
};
const state = { song:null, tempo:72, audio:null, nodes:[], playing:false, position:0, origin:0, frame:0, schedule:[], total:0, active:-1, format:{...DEFAULT_FORMAT} };
function message(msg) {els.saved.textContent=msg;}
function persist() {
  try { localStorage.setItem(STORAGE,JSON.stringify({source:els.source.value, tempo:state.tempo,format:state.format}));message('已自动保存在本机'); }
  catch {message('无法自动保存，请使用「保存源码」备份');}
}
function load() {
  let settings=null;
  try{settings=JSON.parse(localStorage.getItem(STORAGE)||'null');}catch{ /* corrupt storage */ }
  els.source.value=typeof settings?.source === 'string' ? settings.source : EXAMPLE;
  state.tempo=Math.max(35,Math.min(180,Number(settings?.tempo)||72));
  state.format=normalizeFormat(settings?.format);
  els.tempo.value=String(state.tempo);
  els.tempoValue.textContent=String(state.tempo);
}
function svg(tag,attrs={},text) {
  const el=document.createElementNS(SVG_NS,tag);
  for(const [k,v] of Object.entries(attrs))el.setAttribute(k,String(v));
  if(text!==undefined)el.textContent=String(text);
  return el;
}
// Only normalized numbers and whitelisted fonts are applied to the score.
function applyAppearance(){
  const f=state.format, style=els.score.style;
  const sizes={
    '--title-size':f.titleSize+'px','--title-weight':f.titleWeight,
    '--title-font':FONTS[f.titleFont],'--title-spacing':f.titleLetterSpacing+'px',
    '--title-bottom':f.titleBottomGap+'px','--meta-size':f.metaSize+'px',
    '--meta-font':FONTS[f.metaFont],'--meta-gap':f.metaGap+'px',
    '--meta-bottom':f.metaBottomGap+'px','--note-size':f.noteSize+'px',
    '--note-weight':f.noteWeight,'--note-font':FONTS[f.noteFont],
    '--accidental-size':f.accidentalSize+'px',
    '--lyric-size':f.lyricSize+'px','--lyric-weight':f.lyricWeight,
    '--lyric-font':FONTS[f.lyricFont],'--lyric-spacing':f.lyricLetterSpacing+'px',
    '--bar-stroke':f.barStroke,'--rhythm-stroke':f.rhythmStroke,
    '--system-gap':f.systemGap+'px','--preview-padding':f.previewPadding+'px'
  };
  for(const [name,value] of Object.entries(sizes))style.setProperty(name,value);
  let paper=$('print-page-rules');
  if(!paper){paper=document.createElement('style');paper.id='print-page-rules';document.head.append(paper);}
  paper.textContent=`@page { size: A4; margin: ${f.printMarginY}mm ${f.printMarginX}mm; }`;
}
function syncAppearanceControls(){
  for(const control of els.formatControls.querySelectorAll('[data-format-key]'))
    control.value=String(state.format[control.dataset.formatKey]);
  els.formatPreset.value=formatPresetId(state.format);
}
function updateAppearance(changes){
  state.format=normalizeFormat({...state.format,...changes});
  syncAppearanceControls();render();persist();
}
function buildAppearanceControls(){
  for(const [index,group] of FORMAT_GROUPS.entries()){
    const details=document.createElement('details');details.className='format-group';details.open=index===0;
    const summary=document.createElement('summary');summary.textContent=group.title;details.append(summary);
    const body=document.createElement('div');body.className='format-group-body';
    const hint=document.createElement('p');hint.className='format-group-hint';hint.textContent=group.hint;body.append(hint);
    for(const field of group.fields){
      const box=document.createElement('div');box.className='format-field';
      const label=document.createElement('label');label.textContent=field.label;label.htmlFor='format-'+field.key;box.append(label);
      const controls=document.createElement('div');controls.className='format-field-controls';
      if(field.choices){
        const select=document.createElement('select');select.id=label.htmlFor;select.dataset.formatKey=field.key;
        for(const [value,name] of field.choices){
          const option=document.createElement('option');option.value=value;option.textContent=name;select.append(option);
        }
        select.addEventListener('change',()=>updateAppearance({[field.key]:select.value}));
        controls.append(select);
      }else{
        const range=document.createElement('input');range.type='range';range.id=label.htmlFor;
        range.min=String(field.min);range.max=String(field.max);range.step=String(field.step);
        range.dataset.formatKey=field.key;
        const number=document.createElement('input');number.type='number';
        number.min=range.min;number.max=range.max;number.step=range.step;
        number.id='format-'+field.key+'-value';number.dataset.formatKey=field.key;
        number.setAttribute('aria-label',field.label+'的精确数值');
        range.addEventListener('input',()=>updateAppearance({[field.key]:Number(range.value)}));
        number.addEventListener('change',()=>updateAppearance({[field.key]:number.value}));
        const unit=document.createElement('span');unit.className='format-unit';unit.textContent=field.unit;
        controls.append(range,number,unit);
      }
      box.append(controls);body.append(box);
    }
    details.append(body);els.formatControls.append(details);
  }
  els.formatPreset.addEventListener('change',()=>{
    const preset=FORMAT_PRESETS[els.formatPreset.value];
    if(preset)updateAppearance(preset);
  });
  $('format-reset').addEventListener('click',()=>updateAppearance(DEFAULT_FORMAT));
  syncAppearanceControls();
}

// A bar is a separator, not a rhythmic constraint in SanPu.
const SCORE = {pad:30};
function noteCellWidth(){
  const f=state.format;
  return Math.max(50,65+f.noteSpacing,f.noteSize+16,f.accidentalSize+28);
}
function estimateWidth(element,song){
  const f=state.format;
  if(element.kind==='bar')return f.barSpacing;
  const lyric=song.lyrics.get(element.id);
  const chars=Array.from(lyric?.text||'').length;
  const dashes=(element.suffix.match(/-/g)||[]).length;
  return Math.max(noteCellWidth()+dashes*f.dashSpacing,
    noteCellWidth()+Math.max(0,chars-1)*(f.lyricSize*.93+f.lyricLetterSpacing));
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
function drawSystem(elements,song,width){
  const f=state.format;
  const notes=elements.filter(element=>element.kind==='note');
  // Extra headroom for large numerals and up to three high-octave dots.
  const lift=Math.max(0,Math.ceil(f.noteSize*.95+2*f.octaveDotSize+32-80));
  const noteY=80+lift;
  const underY=noteY+Math.max(12,Math.round(f.noteSize*.28));
  const underStep=Math.max(8,Math.round(f.rhythmStroke*3));
  const lowDotStart=n=>Math.max(noteY+f.noteSize*.77,
    underY+Math.max(0,(n.suffix.match(/_/g)||[]).length-1)*underStep+19);
  const bottom=notes.reduce((max,n)=>{
    const under=(n.suffix.match(/_/g)||[]).length;
    const underlineEnd=under?underY+(under-1)*underStep+f.rhythmStroke:noteY;
    const lowerEnd=n.octave<0?lowDotStart(n)+(Math.min(-n.octave,3)-1)*9+f.octaveDotSize:noteY;
    return Math.max(max,underlineEnd,lowerEnd);
  },noteY);
  const lyricY=Math.max(164+lift+f.lyricOffset,bottom+f.lyricSize+9);
  const height=Math.max(195+lift,Math.ceil(lyricY+Math.max(31,f.lyricSize*.95)));
  const s=svg('svg',{viewBox:`0 0 ${width} ${height}`,class:'score-line',role:'img','aria-label':'数字简谱与对应歌词'});
  s.style.setProperty('--line-render-width',width+'px');
  let x=SCORE.pad;
  for(const e of elements){
    if(e.kind==='bar'){
      const barX=x+9;
      s.append(svg('line',{x1:barX,x2:barX,y1:noteY-36,y2:lyricY-49,class:'bar'}));
      x+=f.barSpacing;
      continue;
    }
    const n=e,w=estimateWidth(n,song),cx=x+noteCellWidth()/2;
    const g=svg('g',{class:'note-click','data-note-id':n.id,tabindex:0,role:'button',
      'aria-label':`第 ${n.measure} 小节第 ${n.noteIndex} 音 ${n.raw}，点击从此处播放`});
    const lyr=song.lyrics.get(n.id);
    g.append(svg('rect',{x:x+1,y:5,width:w-2,height:height-9,rx:4,class:'note-bg'}));
    if(n.accidental)g.append(svg('text',{x:cx-f.noteSize*.54,y:noteY,'text-anchor':'middle',class:'accidental'},n.accidental));
    g.append(svg('text',{x:cx,y:noteY,class:'note-num','text-anchor':'middle'},n.degree));
    if(n.octave>0){
      for(let k=0;k<Math.min(n.octave,3);k++)
        g.append(svg('circle',{cx,cy:noteY-f.noteSize*.95-7-k*(f.octaveDotSize*2+2),r:f.octaveDotSize,class:'octave'}));
    }else if(n.octave<0){
      for(let k=0;k<Math.min(-n.octave,3);k++)
        g.append(svg('circle',{cx,cy:lowDotStart(n)+k*9,r:f.octaveDotSize,class:'octave'}));
    }
    const under=(n.suffix.match(/_/g)||[]).length;
    for(let k=0;k<under;k++)
      g.append(svg('line',{x1:cx-18,x2:cx+18,y1:underY+k*underStep,y2:underY+k*underStep,class:'rhythm'}));
    const dots=(n.suffix.match(/\./g)||[]).length;
    for(let k=0;k<dots;k++)
      g.append(svg('circle',{cx:cx+f.noteSize*.63+k*11,cy:noteY-8,r:Math.min(4,f.octaveDotSize),class:'octave'}));
    const dashes=(n.suffix.match(/-/g)||[]).length;
    for(let k=0;k<dashes;k++){
      const x1=cx+f.noteSize*.58+k*f.dashSpacing;
      g.append(svg('line',{x1,x2:x1+Math.min(19,f.dashSpacing-9),y1:noteY-11,y2:noteY-11,class:'rhythm'}));
    }
    if(lyr?.text)g.append(svg('text',{x:cx,y:lyricY,'text-anchor':'middle',class:'lyrics-text'},lyr.text));
    g.addEventListener('click',()=>playFrom(n.id));
    g.addEventListener('keydown',ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();playFrom(n.id);}});
    s.append(g);
    x+=w;
  }
  return s;
}
function render() {
  applyAppearance();
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
  const width=Math.max(state.format.minLineWidth,...lines.map(line=>lineWidth(line,song)));
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
load();buildAppearanceControls();state.song=parseSong(els.source.value);render();
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
