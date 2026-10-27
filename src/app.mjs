import {EXAMPLE, EXAMPLES, parseSong, noteFrequency, splitLyricPunctuation, pianoToNotation, pianoDurationSuffix, insertPianoNote, pianoKeyMidi, revisePianoNoteDuration} from './core.mjs';
import {TIMBRES, normalizeTimbre, createVoice} from './timbres.mjs';
import {FORMAT_GROUPS, DEFAULT_FORMAT, FORMAT_PRESETS, FONTS, normalizeFormat, formatPresetId, exportStyle, importStyle} from './format.mjs';

const $ = id => document.getElementById(id);
const SVG_NS = 'http://www.w3.org/2000/svg';
const STORAGE = 'sanpu.editor.v1';
const els = {
  source:$('source'), score:$('score'), warnings:$('warnings'),
  noteCount:$('note-count'), tempo:$('tempo'), tempoValue:$('tempo-value'),
  play:$('play-btn'),stop:$('stop-btn'),saved:$('saved'), formatControls:$('format-controls'), formatPreset:$('format-preset'),
  zoom:$('preview-zoom'), zoomValue:$('preview-zoom-value'), zoomFit:$('zoom-fit'),
  formatTabs:$('format-tabs'),timbre:$('timbre'),pianoAudition:$('piano-audition'),pianoTranspose:$('piano-transpose'),pianoContinuous:$('piano-continuous'),pianoKeys:$('piano-keys'),pianoStatus:$('piano-status')
};
const state = { song:null, tempo:72, audio:null, nodes:[], playing:false, position:0, origin:0, frame:0, schedule:[], total:0, active:-1, format:{...DEFAULT_FORMAT},zoom:100,timbre:'sine',pianoAudition:true,pianoTranspose:false,pianoContinuous:false,cursorNoteId:-1 };
function message(msg) {els.saved.textContent=msg;}
function persist() {
  try { localStorage.setItem(STORAGE,JSON.stringify({source:els.source.value, tempo:state.tempo,format:state.format,zoom:state.zoom,timbre:state.timbre,pianoAudition:state.pianoAudition,pianoTranspose:state.pianoTranspose,pianoContinuous:state.pianoContinuous}));message('已自动保存在本机'); }
  catch {message('无法自动保存，请使用「保存源码」备份');}
}
function load() {
  let settings=null;
  try{settings=JSON.parse(localStorage.getItem(STORAGE)||'null');}catch{ /* corrupt storage */ }
  els.source.value=typeof settings?.source === 'string' ? settings.source : EXAMPLE;
  state.tempo=Math.max(35,Math.min(180,Number(settings?.tempo)||72));
  state.format=normalizeFormat(settings?.format);
  state.timbre=normalizeTimbre(settings?.timbre);
  state.zoom=Math.min(300,Math.max(50,Number(settings?.zoom)||100));
  state.pianoAudition=settings?.pianoAudition!==false;
  els.pianoAudition.checked=state.pianoAudition;
  state.pianoTranspose=settings?.pianoTranspose===true;
  els.pianoTranspose.checked=state.pianoTranspose;
  state.pianoContinuous=settings?.pianoContinuous===true;
  els.pianoContinuous.checked=state.pianoContinuous;
  els.tempo.value=String(state.tempo);
  els.tempoValue.textContent=String(state.tempo);
}
function svg(tag,attrs={},text) {
  const el=document.createElementNS(SVG_NS,tag);
  for(const [k,v] of Object.entries(attrs))el.setAttribute(k,String(v));
  if(text!==undefined)el.textContent=String(text);
  return el;
}
function buildTimbreSelect(){
  for(const timbre of TIMBRES){
    const option=document.createElement('option');
    option.value=timbre.id;
    option.textContent=timbre.label;
    els.timbre.append(option);
  }
  els.timbre.value=state.timbre;
}
function buildExampleLibrary(){
  const select=$('example-select');
  for(const entry of EXAMPLES){
    const option=document.createElement('option');
    option.value=entry.id;
    option.textContent=entry.title+' · '+entry.description;
    select.append(option);
  }
  select.value=EXAMPLES[0]?.id||'';
}
function loadSelectedExample(){
  const example=EXAMPLES.find(item=>item.id===$('example-select').value);
  if(!example)return;
  if(els.source.value!==example.source && !confirm('将当前内容替换为《'+example.title+'》示例谱？当前内容可以先用「保存源码」备份。'))return;
  els.source.value=example.source;
  refresh();
}
const PIANO_FIRST=48,PIANO_LAST=83;
const PIANO_NAMES=['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
const PIANO_BLACK=new Set([1,3,6,8,10]);
function pianoLabel(midi){return PIANO_NAMES[midi%12]+String(Math.floor(midi/12)-1);}
function pianoSoundMidi(midi){return pianoKeyMidi(midi,state.song.key,state.pianoTranspose);}
function updatePianoLabels(){
  if(!state.song)return;
  for(const key of els.pianoKeys.children){
    const baseMidi=Number(key.dataset.midi);
    const soundMidi=pianoSoundMidi(baseMidi);
    const base=pianoLabel(baseMidi);
    const target=soundMidi===null?'不可用':pianoLabel(soundMidi);
    const notation=soundMidi===null?'':pianoToNotation(soundMidi,state.song.key);
    const label=state.pianoTranspose?base+' → '+target:base;
    key.setAttribute('title',label+' · '+notation);
    key.setAttribute('aria-label',label+'，简谱 '+notation);
    for(const child of key.children)
      if(child.className==='piano-key-name')child.textContent=target;
  }
}
async function auditionPiano(midi){
  const soundMidi=pianoSoundMidi(midi);
  if(soundMidi===null)return;
  if(!state.audio){
    const Ctor=window.AudioContext||window.webkitAudioContext;
    if(!Ctor){els.pianoStatus.textContent='当前浏览器不支持 Web Audio。';return;}
    state.audio=new Ctor();
  }
  try{await state.audio.resume();}
  catch{els.pianoStatus.textContent='浏览器未允许音频播放。';return;}
  const now=state.audio.currentTime;
  const voice=createVoice(state.audio,{frequency:440*Math.pow(2,(soundMidi-69)/12),
    start:now,end:now+.65,timbre:'piano'});
  if(!voice)els.pianoStatus.textContent='琴键未能发声。';
}
// The interval from one key-down to the next key-down, not the pointer-up time,
// determines the preceding note's rhythm. Only the final idle note uses its hold.
let pianoPending=null,pianoIdleTimer=null;
function pianoIdleMs(tempo){return Math.max(1800,4*60000/tempo);}
function clearPianoSequence(){
  clearTimeout(pianoIdleTimer);
  pianoIdleTimer=null;
  pianoPending=null;
}
function revisePending(ms){
  if(!pianoPending)return false;
  const pending=pianoPending;
  const suffix=pianoDurationSuffix(ms,pending.tempo);
  const edit=revisePianoNoteDuration(els.source.value,pending.noteId,pending.raw,suffix);
  if(!edit){clearPianoSequence();return false;}
  if(edit.raw!==pending.raw){
    const oldCaret=els.source.selectionStart;
    const nextCaret=oldCaret>=edit.to?oldCaret+edit.delta:
      oldCaret>edit.from?edit.from+edit.raw.length:oldCaret;
    els.source.value=edit.source;
    if(Number.isInteger(nextCaret))els.source.selectionStart=els.source.selectionEnd=nextCaret;
    pending.raw=edit.raw;
    state.song=parseSong(els.source.value);
    render();highlight(pending.noteId);
    persist();
  }
  return true;
}
function closePianoInterval(nextStartedAt){
  if(!pianoPending)return;
  const pending=pianoPending;
  // Browser background throttling may delay an idle timer: timestamps still win.
  const shouldJoin=pending.releasedAt===null ||
    nextStartedAt-pending.releasedAt<=pianoIdleMs(pending.tempo);
  if(shouldJoin){
    revisePending(Math.max(0,nextStartedAt-pending.startedAt));
    els.pianoStatus.textContent='上一音符 '+pianoPending?.raw+' · 已按两次按键的起始间隔修正节奏';
  }
  clearPianoSequence();
}
function armPianoIdle(pending){
  clearTimeout(pianoIdleTimer);
  const threshold=pianoIdleMs(pending.tempo);
  pianoIdleTimer=setTimeout(()=>{
    if(pianoPending!==pending)return;
    // Its held duration was already provisionally written at pointer-up.
    els.pianoStatus.textContent='末音 '+pending.raw+' · 无后续按键，按按住时长确定节奏';
    clearPianoSequence();
  },threshold);
}
function insertFromPiano(midi,heldMs,recordedAnchor=null){
  const soundMidi=pianoSoundMidi(midi);
  const degree=soundMidi===null?null:pianoToNotation(soundMidi,state.song.key);
  if(!degree)return;
  const token=degree+pianoDurationSuffix(heldMs,state.tempo);
  const anchor=recordedAnchor??(state.playing&&state.active>=0?state.active:state.cursorNoteId);
  const result=insertPianoNote(els.source.value,token,anchor,els.source.selectionStart);
  if(!result){els.pianoStatus.textContent='请先添加 .Voice 段再录入音符。';return;}
  stopAudio();
  els.source.value=result.source;
  els.source.selectionStart=els.source.selectionEnd=result.caret;
  state.cursorNoteId=result.noteId;
  state.song=parseSong(els.source.value);
  render();highlight(result.noteId);
  persist();
  els.pianoStatus.textContent=pianoLabel(midi)+' → '+pianoLabel(soundMidi)+' → '+token+' · 已插入第 '+(result.noteId+1)+' 个音符';
  return {noteId:result.noteId,raw:token};
}
function buildPiano(){
  let whites=0;
  for(let midi=PIANO_FIRST;midi<=PIANO_LAST;midi++){
    const black=PIANO_BLACK.has(midi%12);
    const key=document.createElement('button');
    key.type='button';key.className=black?'piano-key piano-black':'piano-key piano-white';
    const label=pianoLabel(midi);
    key.setAttribute('aria-label',label+'，'+(black?'黑键':'白键'));
    key.setAttribute('title',label);
    key.dataset.midi=String(midi);
    if(black)key.style.left=(whites*26-9)+'px';
    else{
      whites++;
      if(midi%12===0){
        const caption=document.createElement('span');
        caption.textContent=label;caption.className='piano-key-name';key.append(caption);
      }
    }
    let pressedAt=null,ignoreClick=false,pressedAnchor=null,pressedAudition=true,pressedContinuous=false,pressedTempo=72,pressedPending=null;
    const down=ev=>{
      if(ev.type==='pointerdown'&&ev.button!==0)return;
      if(ev.repeat||pressedAt!==null)return;
      pressedAt=Number.isFinite(ev.timeStamp)?ev.timeStamp:Date.now();
      pressedAnchor=state.playing&&state.active>=0?state.active:state.cursorNoteId;
      pressedAudition=state.pianoAudition;
      pressedContinuous=!pressedAudition&&state.pianoContinuous;
      pressedTempo=state.tempo;
      key.classList.toggle('is-pressed',true);
      if(ev.type==='pointerdown'&&key.setPointerCapture&&ev.pointerId!==undefined)
        key.setPointerCapture(ev.pointerId);
      if(pressedContinuous){
        closePianoInterval(pressedAt);
        const inserted=insertFromPiano(midi,60000/pressedTempo,pressedAnchor);
        if(inserted){
          pianoPending={...inserted,startedAt:pressedAt,releasedAt:null,tempo:pressedTempo};
          pressedPending=pianoPending;
          els.pianoStatus.textContent=label+' · 已记下起始时间，等待后续按键决定节奏';
        }
      }
      if(pressedAudition){
        const soundMidi=pianoSoundMidi(midi);
        els.pianoStatus.textContent=label+' → '+(soundMidi===null?'不可用':pianoLabel(soundMidi))+' · '+(soundMidi===null?'?':pianoToNotation(soundMidi,state.song.key))+' · 试听';
        auditionPiano(midi);
      }
    };
    const up=ev=>{
      if(pressedAt===null)return;
      const stamp=Number.isFinite(ev.timeStamp)?ev.timeStamp:Date.now();
      const duration=Math.max(0,stamp-pressedAt);
      pressedAt=null;key.classList.toggle('is-pressed',false);
      ignoreClick=true;
      if(pressedContinuous){
        if(pressedPending && pianoPending===pressedPending){
          pressedPending.releasedAt=stamp;
          revisePending(duration);
          if(pianoPending===pressedPending){
            els.pianoStatus.textContent='当前末音 '+pressedPending.raw+' · 等待下一键修正节奏';
            armPianoIdle(pressedPending);
          }
        }
        pressedPending=null;
      }else if(!pressedAudition)insertFromPiano(midi,duration,pressedAnchor);
    };
    const cancel=()=>{
      if(pressedPending&&pianoPending===pressedPending)clearPianoSequence();
      pressedPending=null;pressedAt=null;
      key.classList.toggle('is-pressed',false);ignoreClick=true;
    };
    key.addEventListener('pointerdown',down);
    key.addEventListener('pointerup',up);
    key.addEventListener('pointercancel',cancel);
    key.addEventListener('keydown',ev=>{
      if(ev.key===' '||ev.key==='Enter'){
        ev.preventDefault?.();
        if(!ev.repeat)down(ev);
      }
    });
    key.addEventListener('keyup',ev=>{
      if(ev.key===' '||ev.key==='Enter'){ev.preventDefault?.();up(ev);}
    });
    // Screen readers may generate a click without pointer/keyboard events.
    key.addEventListener('click',()=>{
      if(ignoreClick){ignoreClick=false;return;}
      if(state.pianoAudition)auditionPiano(midi);
      else{
        const now=typeof performance!=='undefined'?performance.now():Date.now();
        if(state.pianoContinuous)closePianoInterval(now);
        const inserted=insertFromPiano(midi,60000/state.tempo);
        // Assistive click-only activation has no meaningful hold time.
        if(state.pianoContinuous&&inserted){
          pianoPending={...inserted,startedAt:now,releasedAt:now,tempo:state.tempo};
          armPianoIdle(pianoPending);
        }
      }
    });
    els.pianoKeys.append(key);
  }
}
function changeTimbre(value){
  state.timbre=normalizeTimbre(value);
  els.timbre.value=state.timbre;
  if(state.playing){
    // Replace future scheduled notes without moving the playback cursor.
    state.position=Math.max(0,state.audio.currentTime-state.origin);
    state.playing=false;
    cancelAnimationFrame(state.frame);
    clearNodes();
    runPlayback();
  }
  persist();
}
// Percent-based width keeps every SVG viewBox visible in the available preview width.
// User zoom deliberately increases the SVG width; scrolling is enabled only when needed.
function applyPreviewZoom(){
  els.score.style.setProperty('--preview-width',state.zoom+'%');
  els.zoom.value=String(state.zoom);
  els.zoomValue.textContent=state.zoom===100?'适应宽度 · 100%':'缩放 · '+state.zoom+'%';
}
function changePreviewZoom(value){
  state.zoom=Math.min(300,Math.max(50,Math.round(Number(value)||100)));
  applyPreviewZoom();
  persist();
}
// Only normalized numbers and whitelisted fonts are applied to the score.
function applyAppearance(){
  const f=state.format, style=els.score.style;
  const sizes={
    '--title-size':f.titleSize+'px','--title-weight':f.titleWeight,
    '--title-font':FONTS[f.titleFont],'--title-spacing':f.titleLetterSpacing+'px',
    '--title-bottom':f.titleBottomGap+'px','--meta-size':f.metaSize+'px',
    '--meta-font':FONTS[f.metaFont],'--meta-weight':f.metaWeight,
    '--tempo-size':f.tempoSize+'px','--tempo-weight':f.tempoWeight,
    '--meta-gap':f.metaGap+'px',
    '--meta-bottom':f.metaBottomGap+'px','--note-size':f.noteSize+'px',
    '--note-weight':f.noteWeight,'--note-font':FONTS[f.noteFont],
    '--accidental-size':f.accidentalSize+'px',
    '--lyric-size':f.lyricSize+'px','--lyric-weight':f.lyricWeight,
    '--lyric-font':FONTS[f.lyricFont],'--lyric-spacing':f.lyricLetterSpacing+'px',
    '--punctuation-gap':f.punctuationGap+'px',
    '--bar-stroke':f.barStroke,'--rhythm-stroke':f.rhythmStroke,
    '--system-gap':f.systemGap+'px','--lyric-line-gap':f.lyricLineGap+'px',
    '--preview-padding':f.previewPadding+'px'
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
  const tabs=[],panels=[];
  function activateTab(index,focus=false){
    tabs.forEach((tab,i)=>{
      const active=i===index;
      tab.setAttribute('aria-selected',String(active));
      tab.tabIndex=active?0:-1;
      panels[i].hidden=!active;
    });
    if(focus)tabs[index].focus();
  }
  for(const [index,group] of FORMAT_GROUPS.entries()){
    const tab=document.createElement('button');
    tab.type='button';tab.className='format-tab';tab.id='format-tab-'+index;
    tab.textContent=group.title;
    tab.setAttribute('role','tab');
    tab.setAttribute('aria-controls','format-panel-'+index);
    tab.addEventListener('click',()=>activateTab(index));
    tab.addEventListener('keydown',ev=>{
      const next=ev.key==='ArrowRight'?(index+1)%tabs.length:
        ev.key==='ArrowLeft'?(index+tabs.length-1)%tabs.length:
        ev.key==='Home'?0:ev.key==='End'?tabs.length-1:null;
      if(next!==null){ev.preventDefault();activateTab(next,true);}
    });
    const panel=document.createElement('section');
    panel.className='format-tabpanel';panel.id='format-panel-'+index;
    panel.setAttribute('role','tabpanel');
    panel.setAttribute('aria-labelledby',tab.id);
    const hint=document.createElement('p');hint.className='format-group-hint';
    hint.textContent=group.hint;panel.append(hint);
    for(const field of group.fields){
      const box=document.createElement('div');box.className='format-field';
      const label=document.createElement('label');label.textContent=field.label;
      label.htmlFor='format-'+field.key;box.append(label);
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
      box.append(controls);panel.append(box);
    }
    tabs.push(tab);panels.push(panel);
    els.formatTabs.append(tab);els.formatControls.append(panel);
  }
  activateTab(0);
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
  const shrink=Math.min(0,f.noteSpacing);
  return Math.max(30,65+f.noteSpacing,f.noteSize+16+shrink,f.accidentalSize+28+shrink);
}
function estimateWidth(element,song){
  const f=state.format;
  if(element.kind==='bar')return f.barSpacing;
  if(element.kind==='spacer')return element.width;
  const lyric=song.lyrics.get(element.id);
  const {main,prefix,suffix}=splitLyricPunctuation(lyric?.text||'');
  const chars=Array.from(main+prefix+suffix).length;
  const dashes=(element.suffix.match(/-/g)||[]).length;
  // Reserve room for punctuation, but keep the lyric body anchored to the note.
  const punctSpace=(prefix||suffix)?Math.max(0,f.punctuationGap):0;
  return Math.max(noteCellWidth()+dashes*f.dashSpacing,
    noteCellWidth()+Math.max(0,chars-1)*(f.lyricSize*.93+f.lyricLetterSpacing)+punctSpace);
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
  // Reserve headroom when the high-octave dots move away from the numeral.
  // With a zero offset this preserves the original rendering exactly.
  const baseLift=Math.max(0,Math.ceil(f.noteSize*.95+2*f.octaveDotSize+32-80));
  const highLift=notes.some(n=>n.octave>0)?Math.max(0,f.highOctaveDotOffset):0;
  const lift=baseLift+highLift;
  const noteY=80+lift;
  const highDotStart=noteY-f.noteSize*.95-7-f.highOctaveDotOffset;
  const underY=noteY+Math.max(12,Math.round(f.noteSize*.28));
  const underStep=Math.max(8,Math.round(f.rhythmStroke*3));
  const lowDotStart=n=>Math.max(noteY+f.noteSize*.77,
    underY+Math.max(0,(n.suffix.match(/_/g)||[]).length-1)*underStep+19)
    +f.lowOctaveDotOffset;
  const bottom=notes.reduce((max,n)=>{
    const under=(n.suffix.match(/_/g)||[]).length;
    const underlineEnd=under?underY+(under-1)*underStep+f.rhythmStroke:noteY;
    const lowerEnd=n.octave<0?lowDotStart(n)+(Math.min(-n.octave,3)-1)*9+f.octaveDotSize:noteY;
    return Math.max(max,underlineEnd,lowerEnd);
  },noteY);
  // A negative offset is intentional: permit tighter layouts without letting lyrics
  // disappear entirely into the rhythm and octave markers.
  const lyricY=Math.max(164+lift+f.lyricOffset,bottom+Math.max(8,f.lyricSize*.45));
  const height=Math.max(195+lift,Math.ceil(lyricY+Math.max(31,f.lyricSize*.95)));
  const s=svg('svg',{viewBox:`0 0 ${width} ${height}`,class:'score-line',role:'img','aria-label':'数字简谱与对应歌词'});
  const punctuationPairs=[];
  let x=SCORE.pad;
  for(const e of elements){
    if(e.kind==='spacer'){
      // Layout-only width: no SVG mark, no note, no lyric or playback event.
      x+=e.width;
      continue;
    }
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
        g.append(svg('circle',{cx,cy:highDotStart-k*(f.octaveDotSize*2+2),r:f.octaveDotSize,class:'octave'}));
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
    if(lyr?.text){
      const {main,prefix,suffix}=splitLyricPunctuation(lyr.text);
      const body=svg('text',{x:cx,y:lyricY,'text-anchor':'middle',class:'lyrics-text'},main);
      g.append(body);
      if(prefix||suffix){
        const before=prefix?svg('text',{x:cx,y:lyricY,'text-anchor':'end',class:'lyrics-text lyric-punctuation'},prefix):null;
        const after=suffix?svg('text',{x:cx,y:lyricY,'text-anchor':'start',class:'lyrics-text lyric-punctuation'},suffix):null;
        if(before)g.append(before);
        if(after)g.append(after);
        punctuationPairs.push({body,before,after,cx,main});
      }
    }
    g.addEventListener('click',()=>playFrom(n.id));
    g.addEventListener('keydown',ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();playFrom(n.id);}});
    s.append(g);
    x+=w;
  }
  s.punctuationPairs=punctuationPairs;
  return s;
}
// Once a line is in the DOM, use the browser's actual text width (rather than a
// fixed CJK character estimate) so punctuation sits to the right of the body
// without shifting its existing text-anchor under the note.
function positionPunctuation(line){
  for(const {body,before,after,cx,main} of line.punctuationPairs){
    const letters=Array.from(main);
    const fallback=letters.reduce((n,char)=>n+state.format.lyricSize*
      (char.codePointAt(0)>127?1:.57),0)
      +Math.max(0,letters.length-1)*state.format.lyricLetterSpacing;
    let width=fallback;
    if(typeof body.getComputedTextLength==='function'){
      try{
        const measured=body.getComputedTextLength();
        if(Number.isFinite(measured)&&measured>0)width=measured;
      }catch{/* Detached or unsupported SVG: keep fallback. */}
    }
    const gap=state.format.punctuationGap;
    if(before)before.setAttribute('x',String(cx-width/2-gap));
    if(after)after.setAttribute('x',String(cx+width/2+gap));
  }
}
function render() {
  updatePianoLabels();
  applyAppearance();
  applyPreviewZoom();
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
  for(const line of lines){
    const system=drawSystem(line,song,width);
    els.score.append(system);
    positionPunctuation(system);
  }
  els.warnings.replaceChildren();
  const msgs=[...new Set(song.warnings)];
  for(const w of msgs){const p=document.createElement('div');p.textContent='⚠ '+w;els.warnings.append(p);}
  highlight(state.active);
}
function refresh() {
  clearPianoSequence();stopAudio();state.cursorNoteId=-1;state.song=parseSong(els.source.value);
  render();persist();
}
function buildSchedule(){let cursor=0;const sec=60/state.tempo;state.schedule=state.song.notes.map(n=>{const item={id:n.id,start:cursor,end:cursor+n.beats*sec,freq:noteFrequency(n,state.song.key)};cursor=item.end;return item;});state.total=cursor;}
function clearNodes(){for(const voice of state.nodes)voice.stop();state.nodes=[];}
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
    const voice=createVoice(state.audio,{frequency:ev.freq,start:begin,end,timbre:state.timbre});
    if(voice)state.nodes.push(voice);
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
function playFrom(id){state.cursorNoteId=id;buildSchedule();state.position=state.schedule.find(i=>i.id===id)?.start??0;clearNodes();state.playing=false;cancelAnimationFrame(state.frame);runPlayback();}
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
load();buildTimbreSelect();buildExampleLibrary();buildPiano();buildAppearanceControls();state.song=parseSong(els.source.value);render();
els.source.addEventListener('input',()=>{clearPianoSequence();clearTimeout(saveTimer);saveTimer=setTimeout(refresh,180);});
els.pianoAudition.addEventListener('change',()=>{clearPianoSequence();state.pianoAudition=els.pianoAudition.checked;els.pianoStatus.textContent=state.pianoAudition?'试听模式：按键发声，不修改源码':'录入模式：按住决定时值，松开后插入音符';persist();});
els.pianoTranspose.addEventListener('change',()=>{
  clearPianoSequence();
  state.pianoTranspose=els.pianoTranspose.checked;
  updatePianoLabels();
  els.pianoStatus.textContent=state.pianoTranspose?'已按 1='+state.song.key+' 移调（C → '+pianoLabel(pianoSoundMidi(60))+'）':'已恢复固定音高键盘（C → C）';
  persist();
});
els.pianoContinuous.addEventListener('change',()=>{
  clearPianoSequence();
  state.pianoContinuous=els.pianoContinuous.checked;
  els.pianoStatus.textContent=state.pianoContinuous?
    '延音连续：下一键的按下时间决定上一音时值；末音长时间无下一键时按按住时长结算':
    '普通模式：每个音符按住多久，就记多长时值';
  persist();
});
$('import-btn').addEventListener('click',()=>$('file-input').click());
$('file-input').addEventListener('change',async ev=>{const file=ev.target.files[0];if(!file)return;try{els.source.value=await readTextFile(file);refresh();}catch(err){alert(`导入失败：${err.message}`);}finally{ev.target.value='';}});
$('save-btn').addEventListener('click',()=>download(fileName()+'.jpwabc','\ufeff'+els.source.value,'text/plain;charset=utf-8'));
$('example-btn').addEventListener('click',loadSelectedExample);
$('insert-spacer-btn').addEventListener('click',()=>{
  const source=els.source;
  const start=source.selectionStart??source.value.length;
  const end=source.selectionEnd??start;
  // Explicit spaces delimit y40 from adjacent notes; the layout comes from y40.
  source.setRangeText(' y40 ',start,end,'end');
  source.focus();
  refresh();
});

// Export only the appearance settings. Song text, BPM, timbre and zoom stay local.
$('style-export-btn').addEventListener('click',()=>{
  const status=$('style-transfer-status');
  try{
    download('SanPu-谱面样式.sanpu-style.json',exportStyle(state.format),'application/json;charset=utf-8');
    status.textContent='已导出谱面样式 JSON';
  }catch(err){status.textContent='导出失败：'+err.message;}
});
$('style-import-btn').addEventListener('click',()=>$('style-file-input').click());
$('style-file-input').addEventListener('change',async ev=>{
  const input=ev.target,file=input.files?.[0];
  if(!file)return;
  const status=$('style-transfer-status');
  try{
    if(file.size>1024*1024)throw new Error('样式文件超过 1 MB。');
    const content=await readTextFile(file);
    if(content.length>1024*1024)throw new Error('样式文件超过 1 MB。');
    const imported=importStyle(content);
    updateAppearance(imported);
    status.textContent='已导入谱面样式（'+Object.keys(imported).length+' 项）';
  }catch(err){
    status.textContent='导入失败：'+err.message;
  }finally{
    input.value='';
  }
});
$('pdf-btn').addEventListener('click',()=>{if(!state.song.notes.length)return;window.print();});
els.play.addEventListener('click',runPlayback);
els.stop.addEventListener('click',()=>{clearPianoSequence();stopAudio();});
els.timbre.addEventListener('change',ev=>changeTimbre(ev.target.value));
els.zoom.addEventListener('input',ev=>changePreviewZoom(ev.target.value));
els.zoomFit.addEventListener('click',()=>changePreviewZoom(100));
els.tempo.addEventListener('input',ev=>{clearPianoSequence();state.tempo=Number(ev.target.value);els.tempoValue.textContent=String(state.tempo);render();if(state.playing){const id=state.active;playFrom(Math.max(id,0));}persist();});
let resizeTimer;
window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(render,120);});
window.addEventListener('beforeprint',()=>{render();});
window.addEventListener('afterprint',()=>render());
