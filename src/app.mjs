import {EXAMPLE, EXAMPLES, parseSong, noteFrequency, splitLyricPunctuation, pianoToNotation, pianoDurationSuffix, insertPianoNote, pianoKeyMidi, revisePianoNoteDuration, noteSourceCaret, updateTranscriber, songSchedule, groupPlaybackEvents, transposeSongSemitones, insertPianoMarker, voiceEditItems, deleteVoiceItem} from './core.mjs';
import {TIMBRES, normalizeTimbre, createVoice, createLegatoVoice} from './timbres.mjs';
import {renderScoreToMp3} from './mp3.mjs';
import {FORMAT_GROUPS, DEFAULT_FORMAT, FORMAT_PRESETS, FONTS, normalizeFormat, formatPresetId, exportStyle, importStyle} from './format.mjs';

const $ = id => document.getElementById(id);
const SVG_NS = 'http://www.w3.org/2000/svg';
const STORAGE = 'sanpu.editor.v1';
const els = {
  source:$('source'), score:$('score'), warnings:$('warnings'), transcriber:$('transcriber-input'),
  noteCount:$('note-count'), tempo:$('tempo'), tempoValue:$('tempo-value'),
  play:$('play-btn'),stop:$('stop-btn'),loopCount:$('loop-count'),scoreType:$('score-type'),saved:$('saved'), formatControls:$('format-controls'), formatPreset:$('format-preset'),
  zoom:$('preview-zoom'), zoomValue:$('preview-zoom-value'), zoomFit:$('zoom-fit'),
  formatTabs:$('format-tabs'),timbre:$('timbre'),pianoAudition:$('piano-audition'),pianoTranspose:$('piano-transpose'),pianoContinuous:$('piano-continuous'),batchShift:$('batch-shift'),batchApply:$('batch-apply'),batchStatus:$('batch-status'),keyboardMode:$('piano-keyboard-mode'),keyboardDiagram:$('piano-keyboard-diagram'),pianoKeys:$('piano-keys'),pianoStatus:$('piano-status')
};
const state = { song:null, tempo:72, audio:null, nodes:[], playing:false, position:0, origin:0, frame:0, schedule:[], total:0, active:-1, format:{...DEFAULT_FORMAT},zoom:100,timbre:'piano',loopCount:0,loopsDone:0,scoreType:'jianpu',selectedItem:null,pianoAudition:true,pianoTranspose:true,pianoContinuous:true,keyboardMode:false,cursorNoteId:-1 };
function message(msg) {els.saved.textContent=msg;}
function normalizeLoopCount(value){
  const n=Number(value);
  return value===null||value===undefined||String(value).trim()===''||!Number.isSafeInteger(n)||n<-1?0:n;
}
function persist() {
  try { localStorage.setItem(STORAGE,JSON.stringify({source:els.source.value, tempo:state.tempo,format:state.format,zoom:state.zoom,timbre:state.timbre,pianoAudition:state.pianoAudition,pianoTranspose:state.pianoTranspose,pianoContinuous:state.pianoContinuous,keyboardMode:state.keyboardMode,loopCount:state.loopCount,scoreType:state.scoreType}));message('已自动保存在本机'); }
  catch {message('无法自动保存，请使用「保存源码」备份');}
}
function load() {
  let settings=null;
  try{settings=JSON.parse(localStorage.getItem(STORAGE)||'null');}catch{ /* corrupt storage */ }
  els.source.value=typeof settings?.source === 'string' ? settings.source : EXAMPLE;
  state.tempo=Math.max(35,Math.min(180,Number(settings?.tempo)||72));
  state.loopCount=normalizeLoopCount(settings?.loopCount);
  els.loopCount.value=String(state.loopCount);
  state.scoreType=['jianpu','staff','guitar'].includes(settings?.scoreType)?settings.scoreType:'jianpu';
  els.scoreType.value=state.scoreType;
  state.format=normalizeFormat(settings?.format);
  state.timbre=normalizeTimbre(settings?.timbre);
  state.zoom=Math.min(300,Math.max(50,Number(settings?.zoom)||100));
  state.pianoAudition=settings?.pianoAudition!==false;
  els.pianoAudition.checked=state.pianoAudition;
  state.pianoTranspose=settings?.pianoTranspose!==false;
  els.pianoTranspose.checked=state.pianoTranspose;
  state.pianoContinuous=settings?.pianoContinuous!==false;
  els.pianoContinuous.checked=state.pianoContinuous;
  state.keyboardMode=settings?.keyboardMode===true;
  els.keyboardMode.checked=state.keyboardMode;
  els.source.disabled=state.keyboardMode;
  els.tempo.value=String(state.tempo);
  els.tempoValue.value=String(state.tempo);
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
// Use the user's exact three 12-key mappings for C3, C4, and C5.
const PIANO_FIRST=48;
const KEYBOARD_ROWS=Object.freeze(['q2w3er5t6y7u','zsxdcvgbhnjm',',l.;/i9o0p-[']);
const KEYBOARD_LAYOUT=KEYBOARD_ROWS.join('');
// Arrange the SVG by physical key position, not by melodic order.
// Units match the width/offsets of a conventional desktop QWERTY keyboard.
const PHYSICAL_KEY_ROWS=Object.freeze([
  [['`',1],...Array.from('1234567890-=').map(k=>[k,1]),['Backspace',2]],
  [['Tab',1.5],...Array.from('qwertyuiop[]\\').map(k=>[k,1])],
  [['Caps',1.75],...Array.from("asdfghjkl;'").map(k=>[k,1]),['Enter',2.25]],
  [['Shift',2.25],...Array.from('zxcvbnm,./').map(k=>[k,1]),['Shift',2.75]],
  [['Ctrl',1.5],['Win',1.25],['Alt',1.25],['Space',5.5],['Alt',1.25],['Fn',1],['Ctrl',1.5]]
]);
const PIANO_LAST=PIANO_FIRST+KEYBOARD_LAYOUT.length-1;
const KEYBOARD_LAST=PIANO_LAST;
const keyboardDownByMidi=new Map(),keyboardUpByMidi=new Map(),keyboardCancelByMidi=new Map();
const activeKeyboardKeys=new Map();
const keyboardMapCells=new Map();
const keyboardSpecialCells=new Map();

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
  renderPianoKeyboardDiagram();
}
function renderPianoKeyboardDiagram(){
  if(!state.song)return;
  const host=els.keyboardDiagram;
  // Four physically staggered key rows: numbers, QWERTY, ASDF, ZXCV.
  // Extra computer keys are displayed in grey rather than repositioning the
  // user's deliberately ergonomic pitch assignments.
  const unit=77,gap=5,pad=22,top=50,rowStep=80,keyHeight=66;
  const width=15*unit+pad*2,height=472;
  const graphic=svg('svg',{viewBox:`0 0 ${width} ${height}`,
    class:'keyboard-map-svg',role:'img',
    'aria-label':'真实 QWERTY 键盘布局，36 个 C3 到 B5 的映射键；随谱面调号和移调更新'});
  graphic.append(svg('title',{},'标准电脑键盘键位 · 1='+state.song.key+
    (state.pianoTranspose?' · 按调号移调':' · 固定音高')));
  graphic.append(svg('text',{x:pad,y:26,class:'keyboard-map-heading'},
    '标准 QWERTY 键盘 · 按实际位置排列'));
  keyboardMapCells.clear();
  keyboardSpecialCells.clear();
  for(const [rowIndex,row] of PHYSICAL_KEY_ROWS.entries()){
    let x=pad;
    const y=top+rowIndex*rowStep;
    for(const [key,units] of row){
      const w=units*unit-gap;
      const position=KEYBOARD_LAYOUT.indexOf(key);
      const mapped=position>=0;
      const command=key==='`'||key==='Enter'||key==='Space'||key==='Backspace';
      const midi=mapped?PIANO_FIRST+position:null;
      const black=mapped&&PIANO_BLACK.has(midi%12);
      const group=svg('g',{class:mapped?
        'keyboard-map-cell keyboard-map-'+(black?'black':'white')+' keyboard-map-octave-'+(Math.floor(midi/12)-1):
        command?'keyboard-map-command':'keyboard-map-unused',
        'data-key':key,
        ...(mapped?{'data-midi':midi}:{})});
      group.append(svg('rect',{x,y,width:w,height:keyHeight,rx:7}));
      if(mapped){
        const sounding=pianoSoundMidi(midi);
        const original=pianoLabel(midi);
        const actual=sounding===null?'—':pianoLabel(sounding);
        const notation=sounding===null?'—':pianoToNotation(sounding,state.song.key);
        group.append(svg('text',{x:x+w/2,y:y+20,'text-anchor':'middle',
          class:'keyboard-map-letter'},/^[a-z]$/.test(key)?key.toUpperCase():key));
        group.append(svg('text',{x:x+w/2,y:y+41,'text-anchor':'middle',
          class:'keyboard-map-pitch'},state.pianoTranspose?original+' → '+actual:original));
        group.append(svg('text',{x:x+w/2,y:y+57,'text-anchor':'middle',
          class:'keyboard-map-notation'},'简谱 '+notation));
        keyboardMapCells.set(midi,group);
        // Preserve the pressed visual when an active note triggers a rerender.
        const pianoKey=Array.from(els.pianoKeys.children).find(k=>Number(k.dataset.midi)===midi);
        group.classList.toggle('is-pressed',pianoKey?.classList.contains('is-pressed')===true);
      }else if(command){
        const display=key==='`'?'·':key==='Enter'?'Enter ↵':key==='Backspace'?'⌫':'Space';
        const notation=key==='`'?'休止符 0':key==='Enter'?'换行 $(true)':key==='Backspace'?'删除':'小节线 |';
        group.append(svg('text',{x:x+w/2,y:y+27,'text-anchor':'middle',
          class:'keyboard-map-command-letter'},display));
        group.append(svg('text',{x:x+w/2,y:y+48,'text-anchor':'middle',
          class:'keyboard-map-command-notation'},notation));
        keyboardSpecialCells.set(key,group);
      }else{
        group.append(svg('text',{x:x+w/2,y:y+39,'text-anchor':'middle',
          class:'keyboard-map-unused-label'},key));
      }
      graphic.append(group);
      x+=units*unit;
    }
  }
  graphic.append(svg('text',{x:pad,y:height-13,class:'keyboard-map-caption'},
    '退格删除选中对象 · 空格划小节 · 回车换行 · 左上角 · 记休止符 0。'));
  host.replaceChildren(graphic);
}
function highlightKeyboardMap(midi,pressed){
  keyboardMapCells.get(midi)?.classList.toggle('is-pressed',pressed);
}
function highlightKeyboardSpecial(key,pressed){
  keyboardSpecialCells.get(key)?.classList.toggle('is-pressed',pressed);
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
    els.pianoStatus.textContent='上一音符 '+(pianoPending?.raw??pending.raw)+' · 已按两次按键的起始间隔修正节奏';
  }else if(pending.heldMs!==null){
    // Handle a new phrase even if a backgrounded timer fired late.
    revisePending(pending.heldMs);
  }
  clearPianoSequence();
}
function armPianoIdle(pending){
  clearTimeout(pianoIdleTimer);
  const threshold=pianoIdleMs(pending.tempo);
  pianoIdleTimer=setTimeout(()=>{
    if(pianoPending!==pending)return;
    // Only the confirmed final note uses its key-hold duration.
    if(pending.heldMs!==null)revisePending(pending.heldMs);
    els.pianoStatus.textContent='末音 '+pending.raw+' · 无后续按键，按按住时长确定节奏';
    clearPianoSequence();
  },threshold);
}
function insertFromPiano(midi,heldMs,recordedAnchor=null){
  const rest=midi===null;
  const soundMidi=rest?null:pianoSoundMidi(midi);
  const degree=rest?'0':soundMidi===null?null:pianoToNotation(soundMidi,state.song.key);
  if(!degree)return;
  const token=degree+pianoDurationSuffix(heldMs,state.tempo);
  const anchor=recordedAnchor??(state.playing&&state.active>=0?state.active:state.cursorNoteId);
  const result=insertPianoNote(els.source.value,token,anchor,els.source.selectionStart,['bar','break'].includes(state.selectedItem?.kind));
  if(!result){els.pianoStatus.textContent='请先添加 .Voice 段再录入音符。';return;}
  stopAudio();
  els.source.value=result.source;
  els.source.selectionStart=els.source.selectionEnd=result.caret;
  state.cursorNoteId=result.noteId;
  state.selectedItem={kind:'note',index:result.noteId};
  state.song=parseSong(els.source.value);
  render();highlight(result.noteId);
  persist();
  els.pianoStatus.textContent=(rest?'休止符':pianoLabel(midi)+' → '+pianoLabel(soundMidi))+' → '+token+' · 已插入第 '+(result.noteId+1)+' 个音符';
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
      highlightKeyboardMap(midi,true);
      if(ev.type==='pointerdown'&&key.setPointerCapture&&ev.pointerId!==undefined)
        key.setPointerCapture(ev.pointerId);
      if(pressedContinuous){
        closePianoInterval(pressedAt);
        // Provisional two-beat note (one '-'); next onset resolves its duration.
        const inserted=insertFromPiano(midi,120000/pressedTempo,pressedAnchor);
        if(inserted){
          pianoPending={...inserted,startedAt:pressedAt,releasedAt:null,heldMs:null,tempo:pressedTempo};
          pressedPending=pianoPending;
          els.pianoStatus.textContent=label+' · 已记下起始时间，等待后续按键决定节奏';
        }
      }
      if(pressedAudition){
        const soundMidi=pianoSoundMidi(midi);
        els.pianoStatus.textContent=label+' → '+(soundMidi===null?'不可用':pianoLabel(soundMidi))+' · '+(soundMidi===null?'?':pianoToNotation(soundMidi,state.song.key))+' · 试听';
      }
      // A piano key always sounds on key-down; audition mode only controls
      // whether the same gesture also writes a note to the source editor.
      auditionPiano(midi);
    };
    const up=ev=>{
      if(pressedAt===null)return;
      const stamp=Number.isFinite(ev.timeStamp)?ev.timeStamp:Date.now();
      const duration=Math.max(0,stamp-pressedAt);
      pressedAt=null;key.classList.toggle('is-pressed',false);
      highlightKeyboardMap(midi,false);
      ignoreClick=true;
      if(pressedContinuous){
        if(pressedPending && pianoPending===pressedPending){
          pressedPending.releasedAt=stamp;
          pressedPending.heldMs=duration;
          // Keep provisional '-' after mouse-up; pointer travel must not shorten it.
          els.pianoStatus.textContent='当前末音 '+pressedPending.raw+' · 等待下一键修正节奏';
          armPianoIdle(pressedPending);
        }
        pressedPending=null;
      }else if(!pressedAudition)insertFromPiano(midi,duration,pressedAnchor);
    };
    const cancel=()=>{
      if(pressedPending&&pianoPending===pressedPending)clearPianoSequence();
      pressedPending=null;pressedAt=null;
      key.classList.toggle('is-pressed',false);highlightKeyboardMap(midi,false);ignoreClick=true;
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
      // Click-only activation (e.g. assistive tech) also sounds when recording.
      auditionPiano(midi);
      if(!state.pianoAudition){
        const now=typeof performance!=='undefined'?performance.now():Date.now();
        if(state.pianoContinuous)closePianoInterval(now);
        const inserted=insertFromPiano(midi,(state.pianoContinuous?120000:60000)/state.tempo);
        // Click-only activation cannot measure held duration; use one beat.
        if(state.pianoContinuous&&inserted){
          pianoPending={...inserted,startedAt:now,releasedAt:now,heldMs:60000/state.tempo,tempo:state.tempo};
          armPianoIdle(pianoPending);
        }
      }
    });
    els.pianoKeys.append(key);
    keyboardDownByMidi.set(midi,down);
    keyboardUpByMidi.set(midi,up);
    keyboardCancelByMidi.set(midi,cancel);
  }
}
function keyboardEventCode(ev){
  if(ev.code==='Backspace'||ev.key==='Backspace')return 'Backspace';
  if(ev.code==='Space'||ev.key===' ')return 'Space';
  if(ev.code==='Enter'||ev.code==='NumpadEnter'||ev.key==='Enter')return 'Enter';
  if(ev.code==='Backquote'||['·','`','~'].includes(ev.key))return '`';
  if(typeof ev.code==='string'&&/^Key[A-Z]$/.test(ev.code))return ev.code.slice(3).toLowerCase();
  if(typeof ev.code==='string'&&/^(Digit|Numpad)[0-9]$/.test(ev.code))return ev.code.at(-1);
  const physical={Comma:',',Period:'.',Semicolon:';',Slash:'/',Minus:'-',
    BracketLeft:'[',Equal:'=',BracketRight:']'};
  if(Object.hasOwn(physical,ev.code))return physical[ev.code];
  if(typeof ev.key==='string'&&ev.key.length===1&&
    KEYBOARD_LAYOUT.includes(ev.key.toLowerCase()))return ev.key.toLowerCase();
  return null;
}
function isEditingTarget(target){
  if(!target)return false;
  const tag=String(target.tagName||target.tag||'').toLowerCase();
  // The keyboard-mode checkbox retains focus after activation. Allow piano
  // shortcuts while a checkbox/radio/button is focused, but not text editing.
  if(tag==='input')return !['checkbox','radio','button','submit','reset'].includes(String(target.type||'').toLowerCase());
  return tag==='textarea'||tag==='select'||target.isContentEditable===true||
    !!target.closest?.('[contenteditable="true"]');
}
// All keyboard-mode recording uses the same note anchor and source caret,
// including silent rests and structural separators.
function insertKeyboardMarker(marker){
  const result=insertPianoMarker(els.source.value,marker,state.cursorNoteId,els.source.selectionStart,['bar','break'].includes(state.selectedItem?.kind));
  if(!result){els.pianoStatus.textContent='请先添加 .Voice 段再划分小节或换行。';return;}
  clearTimeout(saveTimer);
  stopAudio();
  els.source.value=result.source;
  els.source.selectionStart=els.source.selectionEnd=result.caret;
  state.cursorNoteId=result.noteId;
  state.song=parseSong(els.source.value);
  const markerKind=marker==='|'?'bar':'break';
  const found=voiceEditItems(els.source.value).filter(e=>e.kind===markerKind&&
    e.from>=result.caret-(marker==='|'?3:12)&&e.to<=result.caret).at(-1);
  state.selectedItem=found?{kind:found.kind,index:found.index}:null;
  render();
  if(result.noteId>=0)highlight(result.noteId);
  persist();
  els.pianoStatus.textContent=marker==='|'?'已插入小节线 |':'已插入换行标记 $(true)';
}
let restPress=null;
function restKeyDown(ev){
  if(restPress)return;
  const time=Number.isFinite(ev.timeStamp)?ev.timeStamp:Date.now();
  const anchor=state.playing&&state.active>=0?state.active:state.cursorNoteId;
  const continuous=state.pianoContinuous;
  const tempo=state.tempo;
  restPress={start:time,anchor,continuous,tempo,pending:null};
  highlightKeyboardSpecial('`',true);
  if(continuous){
    closePianoInterval(time);
    const inserted=insertFromPiano(null,120000/tempo,anchor);
    if(inserted){
      pianoPending={...inserted,startedAt:time,releasedAt:null,heldMs:null,tempo};
      restPress.pending=pianoPending;
    }
  }
  // In continuous mode insertion rerenders the SVG; restore keycap feedback.
  highlightKeyboardSpecial('`',true);
  els.pianoStatus.textContent='休止符 0 · 按住决定时值，不发声';
}
function restKeyUp(ev){
  if(!restPress)return;
  const press=restPress;
  restPress=null;
  highlightKeyboardSpecial('`',false);
  const time=Number.isFinite(ev.timeStamp)?ev.timeStamp:Date.now();
  const held=Math.max(0,time-press.start);
  if(press.continuous){
    if(press.pending&&pianoPending===press.pending){
      press.pending.releasedAt=time;
      press.pending.heldMs=held;
      armPianoIdle(press.pending);
      els.pianoStatus.textContent='休止符 0 · 等待下一次按键决定持续拍数';
    }
  }else insertFromPiano(null,held,press.anchor);
}
function cancelRestPress(){
  if(restPress?.pending===pianoPending)clearPianoSequence();
  restPress=null;
  highlightKeyboardSpecial('`',false);
}
function deleteSelectedScoreItem(){
  const items=voiceEditItems(els.source.value);
  const selected=state.selectedItem&&items.find(e=>
    e.kind===state.selectedItem.kind&&e.index===state.selectedItem.index);
  const caret=els.source.selectionStart;
  const target=selected??items.filter(e=>!Number.isInteger(caret)||e.to<=caret).at(-1)??items.at(-1);
  if(!target)return;
  const changed=deleteVoiceItem(els.source.value,target.kind,target.index);
  if(!changed)return;
  clearPianoSequence();cancelRestPress();stopAudio();
  els.source.value=changed.source;
  els.source.selectionStart=els.source.selectionEnd=changed.caret;
  state.song=parseSong(changed.source);
  state.selectedItem=changed.previous;
  const previousNote=voiceEditItems(changed.source).filter(e=>e.kind==='note'&&e.to<=changed.caret).at(-1);
  state.cursorNoteId=previousNote?.index??-1;
  render();
  els.pianoStatus.textContent='已删除'+(target.kind==='note'?'音符':target.kind==='bar'?'小节线':'换行标记');
  persist();
}
function keyboardDown(ev){
  if(!state.keyboardMode||ev.defaultPrevented||ev.repeat||ev.isComposing||ev.ctrlKey||ev.altKey||ev.metaKey)return;
  if(isEditingTarget(ev.target||document.activeElement))return;
  const key=keyboardEventCode(ev);
  if(key==='Backspace'){
    ev.preventDefault?.();ev.stopPropagation?.();deleteSelectedScoreItem();highlightKeyboardSpecial('Backspace',true);return;
  }
  if(key==='Space'||key==='Enter'){
    ev.preventDefault?.();ev.stopPropagation?.();
    // A layout token has no duration; the previous interval still ends
    // at the next pitched/rest onset, not at the separator.
    insertKeyboardMarker(key==='Space'?'|':'$(true)');
    highlightKeyboardSpecial(key,true);
    return;
  }
  if(key==='`'){
    if(restPress)return;
    ev.preventDefault?.();ev.stopPropagation?.();
    restKeyDown(ev);
    return;
  }
  const position=KEYBOARD_LAYOUT.indexOf(key);
  if(position<0||PIANO_FIRST+position>KEYBOARD_LAST||activeKeyboardKeys.has(key))return;
  const midi=PIANO_FIRST+position;
  const down=keyboardDownByMidi.get(midi);
  if(!down)return;
  ev.preventDefault?.();ev.stopPropagation?.();
  activeKeyboardKeys.set(key,midi);
  down({type:'computer-keydown',timeStamp:ev.timeStamp});
}
function keyboardUp(ev){
  const key=keyboardEventCode(ev);
  if(key==='Backspace'){
    if(state.keyboardMode&&!isEditingTarget(ev.target||document.activeElement)){ev.preventDefault?.();ev.stopPropagation?.();highlightKeyboardSpecial('Backspace',false);}return;
  }
  if(key==='Space'||key==='Enter'){
    if(state.keyboardMode&&!isEditingTarget(ev.target||document.activeElement)){ev.preventDefault?.();ev.stopPropagation?.();highlightKeyboardSpecial(key,false);}
    return;
  }
  if(key==='`'){
    if(restPress){ev.preventDefault?.();ev.stopPropagation?.();restKeyUp(ev);}
    return;
  }
  if(!activeKeyboardKeys.has(key))return;
  const midi=activeKeyboardKeys.get(key);
  activeKeyboardKeys.delete(key);
  ev.preventDefault?.();ev.stopPropagation?.();
  keyboardUpByMidi.get(midi)?.({type:'computer-keyup',timeStamp:ev.timeStamp});
}
function releaseComputerKeys(){
  for(const midi of activeKeyboardKeys.values())keyboardCancelByMidi.get(midi)?.();
  activeKeyboardKeys.clear();
  cancelRestPress();
  highlightKeyboardSpecial('Space',false);
  highlightKeyboardSpecial('Enter',false);
  highlightKeyboardSpecial('Backspace',false);
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
    '--transcriber-size':f.transcriberSize+'px','--transcriber-font':FONTS[f.transcriberFont],
    '--credit-size':f.creditSize+'px','--credit-font':FONTS[f.creditFont],
    '--meta-gap':f.metaGap+'px',
    '--meta-bottom':f.metaBottomGap+'px','--note-size':f.noteSize+'px',
    '--note-weight':f.noteWeight,'--note-font':FONTS[f.noteFont],
    '--accidental-size':f.accidentalSize+'px',
    '--accidental-gap':f.accidentalGap+'px',
    '--duration-dot-gap':f.durationDotGap+'px',
    '--dash-note-gap':f.dashNoteGap+'px',
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
  // Allow more space around modified accidentals / augmentation dots without
  // moving notes that have no such symbols. Negative values can intentionally
  // tighten spacing, including overlaps.
  const accidentalInset=element.accidental?Math.max(0,f.accidentalGap):0;
  const dotInset=element.suffix.includes('.')?Math.max(0,f.durationDotGap):0;
  const dashInset=dashes?Math.max(0,f.dashNoteGap):0;
  // Reserve room for punctuation, but keep the lyric body anchored to the note.
  const punctSpace=(prefix||suffix)?Math.max(0,f.punctuationGap):0;
  return accidentalInset+dotInset+dashInset+Math.max(noteCellWidth()+dashes*f.dashSpacing,
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

const STAFF_LETTERS='CDEFGAB';
const STAFF_PCS=[0,2,4,5,7,9,11];
const KEY_SIGNATURES={C:0,G:1,D:2,A:3,E:4,B:5,'#F':6,'#C':7,F:-1,bB:-2,bE:-3,bA:-4,bD:-5,bG:-6,bC:-7};
const SHARP_ORDER='FCGDAEB',FLAT_ORDER='BEADGCF';
const GUITAR_OPEN=[64,59,55,50,45,40]; // E4 B3 G3 D3 A2 E2 (highest string first).
function soundingMidi(note,key){
  const frequency=noteFrequency(note,key);
  return frequency>0?Math.round(69+12*Math.log2(frequency/440)):null;
}
function staffPosition(note,key){
  const midi=soundingMidi(note,key);
  if(midi===null)return null;
  const tonic=STAFF_LETTERS.indexOf(String(key).replace(/^[#b]/,'')[0]);
  const letterIndex=((tonic<0?0:tonic)+note.degree-1)%7;
  const octave=Math.round((midi-12-STAFF_PCS[letterIndex])/12);
  const natural=12*(octave+1)+STAFF_PCS[letterIndex];
  const staff=note.degree?midi>=60?'treble':'bass':'treble';
  const baseline=staff==='treble'?136:236;
  const baseStep=staff==='treble'?4*7+2:2*7+4;
  const y=baseline-(octave*7+letterIndex-baseStep)*7;
  return {midi,letter:STAFF_LETTERS[letterIndex],octave,alter:midi-natural,staff,y};
}
function signatureDefault(letter,key){
  const count=KEY_SIGNATURES[key]??0;
  return count>0&&SHARP_ORDER.slice(0,count).includes(letter)?1:
    count<0&&FLAT_ORDER.slice(0,-count).includes(letter)?-1:0;
}
function staffWrittenAccidentals(song){
  const changes=new Map(),active=new Map();
  for(const element of song.elements){
    if(element.kind==='bar'){active.clear();continue;}
    if(element.kind!=='note'||element.degree===0)continue;
    const pitch=staffPosition(element,song.key);
    if(!pitch)continue;
    const label=pitch.letter+pitch.octave;
    const previous=active.has(label)?active.get(label):signatureDefault(pitch.letter,song.key);
    if(previous!==pitch.alter)
      changes.set(element.id,pitch.alter===0?'♮':pitch.alter===1?'♯':
        pitch.alter===-1?'♭':pitch.alter>1?'𝄪':'𝄫');
    active.set(label,pitch.alter);
  }
  return changes;
}
function guitarFingering(note,key,maxFret=20){
  const midi=soundingMidi(note,key);
  if(midi===null)return null;
  const positions=GUITAR_OPEN.map((open,string)=>({string,fret:midi-open}))
    .filter(p=>p.fret>=0&&p.fret<=maxFret);
  if(!positions.length)return {unplayable:true,midi};
  positions.sort((a,b)=>a.fret-b.fret||a.string-b.string);
  return {...positions[0],midi};
}
function drawAlternativeSystem(elements,song,sourceWidth,kind){
  const staff=kind==='staff', f=state.format;
  const width=sourceWidth+155, height=staff?395:335;
  const score=svg('svg',{viewBox:'0 0 '+width+' '+height,
    class:'score-line score-'+kind,role:'img',
    'aria-label':staff?'五线谱：高音谱表与低音谱表、节奏和歌词':'吉他指弹谱：标准调弦六线 TAB、弦品和歌词'});
  const left=140,right=width-18;
  const head=staff?'五线谱 · 高音与低音联合谱表':'吉他指弹谱 · 六线 TAB · 标准调弦 E A D G B E';
  score.append(svg('text',{x:20,y:25,class:'alt-caption'},head));
  if(staff){
    for(const offset of [0,100]){
      for(let i=0;i<5;i++)
        score.append(svg('line',{x1:82,x2:right,y1:80+offset+i*14,
          y2:80+offset+i*14,class:'alt-staff-line'}));
    }
    score.append(svg('line',{x1:82,x2:82,y1:80,y2:236,class:'alt-staff-line'}));
    score.append(svg('text',{x:87,y:132,class:'alt-clef'},'𝄞'));
    score.append(svg('text',{x:86,y:217,class:'alt-clef alt-bass-clef'},'𝄢'));
    const signature=KEY_SIGNATURES[song.key]??0;
    const sharpTreble=[80,101,73,94,115,87,108],sharpBass=[194,215,187,208,229,201,222];
    const flatTreble=[108,87,115,94,122,101,129],flatBass=[222,201,229,208,236,215,243];
    for(let i=0;i<Math.abs(signature);i++){
      const sharp=signature>0;
      score.append(svg('text',{x:103+i*13,y:(sharp?sharpTreble:flatTreble)[i],
        class:'alt-accidental'},sharp?'♯':'♭'));
      score.append(svg('text',{x:103+i*13,y:(sharp?sharpBass:flatBass)[i],
        class:'alt-accidental'},sharp?'♯':'♭'));
    }
  }else{
    const strings=['e','B','G','D','A','E'];
    for(let i=0;i<6;i++){
      const y=80+i*23;
      score.append(svg('line',{x1:82,x2:right,y1:y,y2:y,class:'alt-staff-line alt-tab-line'}));
      score.append(svg('text',{x:67,y:y+5,class:'alt-string-label'},strings[i]));
    }
    score.append(svg('text',{x:90,y:65,class:'alt-tab-label'},'TAB'));
  }
  const accidentalMarks=staff?staffWrittenAccidentals(song):new Map();
  const notes=elements.filter(e=>e.kind==='note');
  const firstNote=notes[0],lastNote=notes.at(-1);
  const slurs=firstNote?(song.slurs||[]).filter(s=>s.startId<=lastNote.id&&s.endId>=firstNote.id):[];
  const centers=new Map(),punctuationPairs=[];
  let x=left;
  for(const e of elements){
    if(e.kind==='spacer'){x+=e.width;continue;}
    if(e.kind==='bar'){
      const barX=x+9,barId=e.index;
      const bar=svg('g',{class:'bar-click','data-bar-id':barId,tabindex:0,role:'button',
        'aria-label':'第 '+e.measure+' 小节后的小节线，可点击选中'});
      bar.append(svg('rect',{x,y:67,width:Math.max(16,f.barSpacing),height:staff?177:139,class:'bar-hit'}));
      for(const [top,bottom] of staff?[[80,136],[180,236]]:[[80,195]])
        bar.append(svg('line',{x1:barX,x2:barX,y1:top,y2:bottom,class:'bar'}));
      bar.addEventListener('click',()=>selectScoreBar(barId));
      bar.addEventListener('keydown',ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();ev.stopPropagation?.();selectScoreBar(barId);}});
      score.append(bar);x+=f.barSpacing;continue;
    }
    const n=e,w=estimateWidth(n,song),cx=x+noteCellWidth()/2+Math.max(0,n.accidental?f.accidentalGap:0);
    centers.set(n.id,cx);
    const g=svg('g',{class:'note-click','data-note-id':n.id,tabindex:0,role:'button',
      'aria-label':'第 '+n.measure+' 小节第 '+n.noteIndex+' 音 '+n.raw+'，点击定位源码'});
    g.append(svg('rect',{x,y:35,width:w,height:height-42,rx:4,class:'note-bg'}));
    if(staff){
      const p=staffPosition(n,song.key);
      if(!p){
        g.append(svg('text',{x:cx,y:120,class:'alt-rest','text-anchor':'middle'},'𝄽'));
        g.append(svg('text',{x:cx,y:149,class:'alt-duration','text-anchor':'middle'},
          n.beats+' 拍休止'));
      }else{
        const top=p.staff==='treble'?80:180,bottom=p.staff==='treble'?136:236;
        for(let y=bottom+14;y<=p.y;y+=14)
          g.append(svg('line',{x1:cx-17,x2:cx+17,y1:y,y2:y,class:'alt-ledger'}));
        for(let y=top-14;y>=p.y;y-=14)
          g.append(svg('line',{x1:cx-17,x2:cx+17,y1:y,y2:y,class:'alt-ledger'}));
        const accidental=accidentalMarks.get(n.id);
        if(accidental)g.append(svg('text',{x:cx-24,y:p.y+6,class:'alt-accidental'},accidental));
        const open=n.beats>=2,whole=n.beats>=4;
        g.append(svg('ellipse',{cx,cy:p.y,rx:whole?11:10,ry:6,
          transform:'rotate(-17 '+cx+' '+p.y+')',class:open?'alt-notehead alt-open':'alt-notehead'}));
        if(!whole){
          const up=p.y>=108,stemX=cx+(up?9:-9);
          const stemEnd=p.y+(up?-44:44);
          g.append(svg('line',{x1:stemX,x2:stemX,y1:p.y,y2:stemEnd,class:'alt-stem'}));
          const flags=n.beats<=.125?3:n.beats<=.375?2:n.beats<1?1:0;
          for(let k=0;k<flags;k++)
            g.append(svg('path',{d:'M '+stemX+' '+(stemEnd+k*(up?9:-9))+
              ' Q '+(stemX+16)+' '+(stemEnd+(up?14:-14)+k*(up?9:-9))+
              ' '+(stemX+8)+' '+(stemEnd+(up?27:-27)+k*(up?9:-9)),
              class:'alt-flag'}));
        }
        if(n.suffix.includes('.'))
          g.append(svg('circle',{cx:cx+19,cy:p.y-3,r:3,class:'alt-augmentation'}));
        if(n.beats>4)
          g.append(svg('text',{x:cx,y:staff?264:230,class:'alt-duration',
            'text-anchor':'middle'},n.beats+' 拍'));
      }
    }else{
      const tab=guitarFingering(n,song.key);
      if(!tab){
        g.append(svg('text',{x:cx,y:149,class:'alt-rest','text-anchor':'middle'},'休'));
      }else if(tab.unplayable){
        g.append(svg('text',{x:cx,y:149,class:'alt-unplayable','text-anchor':'middle'},'×'));
        g.append(svg('title',{},'超出标准调弦 20 品的可弹奏音域'));
      }else{
        const y=80+tab.string*23,text=String(tab.fret);
        g.append(svg('rect',{x:cx-(text.length>1?15:11),y:y-11,
          width:text.length>1?30:22,height:22,class:'alt-fret-bg'}));
        g.append(svg('text',{x:cx,y:y+6,class:'alt-fret','text-anchor':'middle'},text));
        g.append(svg('title',{},'第 '+(tab.string+1)+' 弦，第 '+tab.fret+' 品'));
      }
      g.append(svg('text',{x:cx,y:233,'text-anchor':'middle',class:'alt-duration'},
        n.beats+' 拍'));
    }
    const lyric=song.lyrics.get(n.id);
    if(lyric?.text){
      const y=staff?341:292;
      const {main,prefix,suffix}=splitLyricPunctuation(lyric.text);
      const body=svg('text',{x:cx,y,'text-anchor':'middle',class:'lyrics-text'},main);
      g.append(body);
      if(prefix||suffix){
        const before=prefix?svg('text',{x:cx,y,'text-anchor':'end',class:'lyrics-text lyric-punctuation'},prefix):null;
        const after=suffix?svg('text',{x:cx,y,'text-anchor':'start',class:'lyrics-text lyric-punctuation'},suffix):null;
        if(before)g.append(before);
        if(after)g.append(after);
        punctuationPairs.push({body,before,after,cx,main});
      }
    }
    g.addEventListener('click',()=>selectScoreNote(n.id));
    g.addEventListener('keydown',ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();selectScoreNote(n.id);}});
    score.append(g);x+=w;
  }
  if(firstNote&&lastNote){
    for(const [index,slur] of slurs.entries()){
      const l=slur.startId<firstNote.id?centers.get(firstNote.id)-18:centers.get(slur.startId);
      const r=slur.endId>lastNote.id?centers.get(lastNote.id)+18:centers.get(slur.endId);
      if(l===undefined||r===undefined||r<=l)continue;
      const y=staff?45-index*8:49-index*8;
      score.append(svg('path',{d:'M '+l+' '+y+' Q '+((l+r)/2)+' '+(y-22)+' '+r+' '+y,
        class:'score-slur','aria-hidden':'true'}));
    }
  }
  score.punctuationPairs=punctuationPairs;
  return score;
}
function drawSystem(elements,song,width){
  const f=state.format;
  const notes=elements.filter(element=>element.kind==='note');
  // Reserve headroom when the high-octave dots move away from the numeral.
  // With a zero offset this preserves the original rendering exactly.
  const baseLift=Math.max(0,Math.ceil(f.noteSize*.95+2*f.octaveDotSize+32-80));
  const highLift=notes.some(n=>n.octave>0)?Math.max(0,f.highOctaveDotOffset):0;
  // Slur arches need headroom even when every note is in the middle octave.
  const firstNote=notes[0],lastNote=notes.at(-1);
  const lineSlurs=firstNote? (song.slurs||[]).filter(s=>s.startId<=lastNote.id&&s.endId>=firstNote.id):[];
  const lift=baseLift+highLift+(lineSlurs.length?30:0);
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
  const noteCenters=new Map();
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
    const n=e,w=estimateWidth(n,song);
    // Extra leading space is reserved only for notes carrying accidentals.
    const cx=x+(n.accidental?Math.max(0,f.accidentalGap):0)+noteCellWidth()/2;
    noteCenters.set(n.id,cx);
    const g=svg('g',{class:'note-click','data-note-id':n.id,tabindex:0,role:'button',
      'aria-label':`第 ${n.measure} 小节第 ${n.noteIndex} 音 ${n.raw}，点击定位到源码`});
    const lyr=song.lyrics.get(n.id);
    g.append(svg('rect',{x:x+1,y:5,width:w-2,height:height-9,rx:4,class:'note-bg'}));
    if(n.accidental)g.append(svg('text',{x:cx-f.noteSize*.54-f.accidentalGap,y:noteY,'text-anchor':'middle',class:'accidental'},n.accidental));
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
      g.append(svg('circle',{cx:cx+f.noteSize*.63+f.durationDotGap+k*11,cy:noteY-8,r:Math.min(4,f.octaveDotSize),class:'octave duration-dot'}));
    const dashes=(n.suffix.match(/-/g)||[]).length;
    for(let k=0;k<dashes;k++){
      const x1=cx+f.noteSize*.58+f.dashNoteGap+k*f.dashSpacing;
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
    g.addEventListener('click',()=>selectScoreNote(n.id));
    g.addEventListener('keydown',ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();selectScoreNote(n.id);}});
    s.append(g);
    x+=w;
  }
  // Cross-system slurs continue on the following system. A separate path
  // keeps the note click hitboxes and lyric anchors unchanged.
  for(const [index,slur] of lineSlurs.entries()){
    const left=slur.startId<firstNote.id?noteCenters.get(firstNote.id)-noteCellWidth()/2:noteCenters.get(slur.startId);
    const right=slur.endId>lastNote.id?noteCenters.get(lastNote.id)+noteCellWidth()/2:noteCenters.get(slur.endId);
    const y=Math.min(noteY-f.noteSize*.95-24,highDotStart-16)-index*9;
    if(left===undefined||right===undefined||right<=left)continue;
    s.append(svg('path',{d:`M ${left} ${y} Q ${(left+right)/2} ${y-22} ${right} ${y}`,
      class:'score-slur','aria-hidden':'true'}));
  }
  s.punctuationPairs=punctuationPairs;
  return s;
}
// Do not modify drawSystem: numbered notation is the original baseline renderer,
// including its direct bar <line> children, dimensions, and styles.
// Interactive hit targets are appended separately and are invisible until hovered
// or selected. Thus the default numbered score paints the same SVG as before.
// Numbered score uses the original unchanged drawSystem implementation.
// Each new selection rectangle is a separate transparent SVG hit target,
// positioned from the ORIGINAL barline's own coordinates. This also tracks
// custom note size, lyric offset and system height without moving any glyph.
function addJianpuBarSelectionTargets(svgNode,elements){
  const attr=(node,name)=>node.getAttribute?.(name)??node.attrs?.[name];
  const sourceBars=Array.from(svgNode.children).filter(node=>
    attr(node,'class')==='bar' && (node.tagName?.toLowerCase?.()==='line'||node.tag==='line'));
  const parsedBars=elements.filter(item=>item.kind==='bar');
  if(parsedBars.length!==sourceBars.length)return;
  for(let i=0;i<parsedBars.length;i++){
    const item=parsedBars[i],line=sourceBars[i];
    const originalX=Number(attr(line,'x1'));
    const originalTop=Number(attr(line,'y1'));
    const originalBottom=Number(attr(line,'y2'));
    const rectWidth=Math.max(14,state.format.barSpacing);
    const hit=svg('g',{class:'bar-click','data-bar-id':item.index,
      tabindex:0,role:'button','aria-label':'选中第 '+item.measure+' 小节的小节线'});
    hit.append(svg('rect',{x:originalX-rectWidth/2,
      y:Math.min(originalTop,originalBottom)-9,width:rectWidth,
      height:Math.abs(originalBottom-originalTop)+18,class:'bar-hit'}));
    hit.addEventListener('click',()=>selectScoreBar(item.index));
    hit.addEventListener('keydown',ev=>{
      if(ev.key==='Enter'||ev.key===' '){
        ev.preventDefault();ev.stopPropagation?.();selectScoreBar(item.index);
      }
    });
    svgNode.append(hit);
  }
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
  els.transcriber.value=song.transcriber;
  els.score.replaceChildren();
  els.noteCount.textContent=`${song.notes.length} 个音符`;
  const title=document.createElement('h2');title.className='score-title';title.textContent=song.title;
  const meta=document.createElement('div');meta.className='score-meta';
  const left=document.createElement('div');left.className='score-meta-left';
  const tonic=document.createElement('span');tonic.className='score-tonic';tonic.textContent=`1 = ${song.key}`;
  const tempo=document.createElement('span');tempo.className='score-tempo';
  tempo.textContent=`♩ = ${state.tempo}`;
  tempo.setAttribute('aria-label',`四分音符每分钟 ${state.tempo} 拍`);
  left.append(tonic,tempo);
  if(song.transcriber){
    const transcriber=document.createElement('span');transcriber.className='score-transcriber';
    transcriber.textContent='记谱人：'+song.transcriber;
    left.append(transcriber);
  }
  const right=document.createElement('div');right.className='score-meta-right';
  if(song.composer){
    const credit=document.createElement('span');credit.className='score-credit';
    credit.textContent='词曲作者：'+song.composer;right.append(credit);
  }
  if(song.singer){
    const singer=document.createElement('span');singer.className='score-singer';
    singer.textContent='演唱者：'+song.singer;right.append(singer);
  }
  meta.append(left,right);
  els.score.append(title,meta);
  const lines=systems(song);
  const width=Math.max(state.format.minLineWidth,...lines.map(line=>lineWidth(line,song)));
  if(!song.notes.length){const blank=document.createElement('p');blank.className='empty';blank.textContent='在左侧输入 .Voice 音符，即可开始创作。';els.score.append(blank);}
  for(const line of lines){
    const system=state.scoreType==='jianpu'?drawSystem(line,song,width):drawAlternativeSystem(line,song,width,state.scoreType);
    if(state.scoreType==='jianpu')addJianpuBarSelectionTargets(system,line);
    els.score.append(system);
    positionPunctuation(system);
  }
  els.warnings.replaceChildren();
  const msgs=[...new Set(song.warnings)];
  for(const w of msgs){const p=document.createElement('div');p.textContent='⚠ '+w;els.warnings.append(p);}
  highlight(state.active);
}
function refresh() {
  clearPianoSequence();stopAudio();state.cursorNoteId=-1;state.selectedItem=null;state.song=parseSong(els.source.value);
  render();persist();
}
function buildSchedule(){const schedule=songSchedule(state.song,state.tempo);state.schedule=schedule.timeline;state.total=schedule.total;}
function clearNodes(){for(const voice of state.nodes)voice.stop();state.nodes=[];}
function highlight(id) {
  state.active=id;
  for(const g of els.score.querySelectorAll('.note-click'))g.classList.toggle('active',Number(g.dataset.noteId)===id);
  for(const g of els.score.querySelectorAll('.bar-click'))
    g.classList.toggle('active',state.selectedItem?.kind==='bar'&&Number(g.dataset.barId)===state.selectedItem.index);
}
function stopAudio(){cancelAnimationFrame(state.frame);clearNodes();state.playing=false;state.position=0;state.loopsDone=0;highlight(-1);els.play.textContent='▶ 播放';}
function scheduleAudioPass(position=0){
  for(const group of groupPlaybackEvents(state.schedule,position)){
    const events=group.map(ev=>({...ev,start:state.origin+ev.start,end:state.origin+ev.end}));
    const voice=events.length>1?createLegatoVoice(state.audio,{events,timbre:state.timbre}):
      createVoice(state.audio,{frequency:events[0].freq,start:events[0].start,end:events[0].end,timbre:state.timbre});
    if(voice)state.nodes.push(voice);
  }
}
function advanceLoop(){
  if(state.total<=0)return false;
  const elapsed=state.audio.currentTime-state.origin;
  if(elapsed<state.total)return true;
  const passed=Math.floor(elapsed/state.total);
  if(state.loopCount!==-1 && state.loopsDone+passed>state.loopCount)return false;
  state.loopsDone+=passed;
  state.origin+=passed*state.total;
  state.position=Math.max(0,state.audio.currentTime-state.origin);
  clearNodes();
  scheduleAudioPass(state.position);
  highlight(-1);
  return true;
}
async function runPlayback() {
  if(!state.song?.notes.length)return;
  if(state.playing){state.position=Math.max(0,state.audio.currentTime-state.origin);state.playing=false;clearNodes();cancelAnimationFrame(state.frame);els.play.textContent='▶ 继续';return;}
  if(!state.audio){const Ctor=window.AudioContext||window.webkitAudioContext;if(!Ctor){alert('当前浏览器不支持 Web Audio。');return;}state.audio=new Ctor();}
  try{await state.audio.resume();}catch{alert('浏览器无法启用音频。');return;}
  buildSchedule();if(state.position>=state.total-.01)state.position=0;
  if(state.total<=0)return;
  const now=state.audio.currentTime;state.origin=now-state.position;
  scheduleAudioPass(state.position);
  state.playing=true;els.play.textContent='Ⅱ 暂停';
  const tick=()=>{
    if(!state.playing)return;
    state.position=state.audio.currentTime-state.origin;
    if(state.position>=state.total && !advanceLoop()){stopAudio();return;}
    const item=state.schedule.find(x=>state.position>=x.start && state.position<x.end);
    if(item && item.id!==state.active)highlight(item.id);
    state.frame=requestAnimationFrame(tick);
  };tick();
}
function playFrom(id){state.cursorNoteId=id;state.loopsDone=0;buildSchedule();state.position=state.schedule.find(i=>i.id===id)?.start??0;clearNodes();state.playing=false;cancelAnimationFrame(state.frame);runPlayback();}
function selectScoreNote(id){
  state.selectedItem={kind:'note',index:id};
  const caret=noteSourceCaret(els.source.value,id);
  if(caret===null)return;
  clearPianoSequence();
  if(state.pianoAudition)playFrom(id);
  else{
    // Record mode: stop playback immediately and preserve the selected note
    // as the resume point and the insertion anchor, without replaying.
    stopAudio();
    buildSchedule();
    state.position=state.schedule.find(item=>item.id===id)?.start??0;
    state.loopsDone=0;
    els.play.textContent='▶ 继续';
    state.cursorNoteId=id;
    highlight(id);
  }
  els.source.focus();
  if(typeof els.source.setSelectionRange==='function')els.source.setSelectionRange(caret,caret);
  else els.source.selectionStart=els.source.selectionEnd=caret;
}
function selectScoreBar(index){
  const item=voiceEditItems(els.source.value).find(e=>e.kind==='bar'&&e.index===index);
  if(!item)return;
  clearPianoSequence();stopAudio();
  state.selectedItem={kind:'bar',index};
  const previous=voiceEditItems(els.source.value).filter(e=>e.kind==='note'&&e.to<=item.from).at(-1);
  state.cursorNoteId=previous?.index??-1;
  els.source.selectionStart=els.source.selectionEnd=item.to;
  highlight(-1);
  els.pianoStatus.textContent='已选中小节线：按退格删除，或从此处录入';
}
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
document.addEventListener('keydown',keyboardDown,true);
document.addEventListener('keyup',keyboardUp,true);
window.addEventListener('blur',releaseComputerKeys);
els.source.addEventListener('input',()=>{clearPianoSequence();clearTimeout(saveTimer);saveTimer=setTimeout(refresh,180);});
els.batchApply.addEventListener('click',()=>{
  const raw=els.batchShift.value,n=Number(raw);
  if(raw.trim()===''||!Number.isSafeInteger(n)){
    els.batchStatus.textContent='请输入有效的整数半音数（支持负数）。';return;
  }
  if(n===0){els.batchStatus.textContent='音程为 0，谱面不需要修改。';return;}
  let changed;
  try{changed=transposeSongSemitones(els.source.value,n);}
  catch(err){els.batchStatus.textContent='批量编辑未生效：'+err.message;return;}
  if(changed.count===0){els.batchStatus.textContent='谱面没有需要移调的发声音符。';return;}
  const direction=n>0?'升高 '+n:'降低 '+Math.abs(n);
  if(!confirm('确认将全谱 '+changed.count+' 个音符'+direction+'个半音吗？\\n歌词、时值、圆滑线、排版空位与调号保持不变。')) {
    els.batchStatus.textContent='已取消，谱面未修改。';return;
  }
  clearPianoSequence();
  els.source.value=changed.source;
  refresh();
  els.batchStatus.textContent='已'+direction+'个半音，共修改 '+changed.count+' 个音符。';
});
els.transcriber.addEventListener('change',()=>{
  const updated=updateTranscriber(els.source.value,els.transcriber.value);
  if(updated===null){message('源码缺少 .Title 段，无法保存记谱人');return;}
  if(updated===els.source.value)return;
  els.source.value=updated;
  refresh();
});
els.pianoAudition.addEventListener('change',()=>{clearPianoSequence();state.pianoAudition=els.pianoAudition.checked;els.pianoStatus.textContent=state.pianoAudition?'仅试听：按键发声，不修改源码':'边听边录：按键发声，并按节奏写入音符';persist();});
els.pianoTranspose.addEventListener('change',()=>{
  clearPianoSequence();
  state.pianoTranspose=els.pianoTranspose.checked;
  updatePianoLabels();
  els.pianoStatus.textContent=state.pianoTranspose?'已按 1='+state.song.key+' 移调（C → '+pianoLabel(pianoSoundMidi(60))+'）':'已恢复固定音高键盘（C → C）';
  persist();
});
els.keyboardMode.addEventListener('change',()=>{
  releaseComputerKeys();clearPianoSequence();state.keyboardMode=els.keyboardMode.checked;
  els.source.disabled=state.keyboardMode;
  if(state.keyboardMode){
    // The checkbox would otherwise eat Space as a toggle while the player
    // expects it to write a barline. Capturing keydown prevents that default.
    if(document.activeElement===els.source)els.source.blur?.();
  }
  els.pianoStatus.textContent=state.keyboardMode?'键盘模式已开启：36 个琴键；空格分小节、回车换行、· 记休止符；源码框禁用':'键盘模式已关闭：源谱输入框可编辑';
  persist();
});
els.scoreType.addEventListener('change',()=>{
  if(!['jianpu','staff','guitar'].includes(els.scoreType.value))return;
  state.scoreType=els.scoreType.value;
  render();persist();
  // Once the native picker is closed, release its text-editing focus so
  // Space/Enter immediately resume piano entry rather than reopening it.
  if(state.keyboardMode)els.scoreType.blur?.();
});
els.pianoContinuous.addEventListener('change',()=>{
  clearPianoSequence();
  state.pianoContinuous=els.pianoContinuous.checked;
  els.pianoStatus.textContent=state.pianoContinuous?
    '延音连续：新音符默认延长一拍；下一键按下后修正上一音，末音待超时按实际按住时长结算':
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
$('mp3-btn').addEventListener('click',async()=>{
  const button=$('mp3-btn'),status=$('mp3-status');
  if(button.disabled||!state.song?.notes.length)return;
  button.disabled=true;button.textContent='正在导出…';status.textContent='正在离线生成音频…';
  try{
    const bytes=await renderScoreToMp3({
      song:state.song,tempo:state.tempo,timbre:state.timbre,
      OfflineContext:window.OfflineAudioContext||window.webkitOfflineAudioContext,
      onProgress:percent=>{status.textContent='MP3 编码 '+percent+'%';}
    });
    download(fileName()+'.mp3',bytes,'audio/mpeg');
    status.textContent='MP3 已生成 · '+state.tempo+' BPM · '+state.timbre;
  }catch(error){
    status.textContent='MP3 导出失败：'+(error?.message||String(error));
  }finally{
    button.disabled=false;button.textContent='↓ 导出 MP3';
  }
});
els.play.addEventListener('click',runPlayback);
els.stop.addEventListener('click',()=>{clearPianoSequence();stopAudio();});
els.timbre.addEventListener('change',ev=>changeTimbre(ev.target.value));
els.loopCount.addEventListener('change',()=>{
  const raw=els.loopCount.value,n=Number(raw);
  if(raw.trim()===''||!Number.isSafeInteger(n)||n<-1){
    els.loopCount.value=String(state.loopCount);
    return;
  }
  state.loopCount=n;
  els.loopCount.value=String(n);
  persist();
});
els.zoom.addEventListener('input',ev=>changePreviewZoom(ev.target.value));
els.zoomFit.addEventListener('click',()=>changePreviewZoom(100));
function changeTempo(value){
  const parsed=Number(value);
  const next=String(value).trim()===''||!Number.isFinite(parsed)?
    state.tempo:Math.min(180,Math.max(35,Math.round(parsed)));
  els.tempo.value=String(next);
  els.tempoValue.value=String(next);
  if(next===state.tempo)return;
  clearPianoSequence();
  state.tempo=next;
  render();
  if(state.playing){const id=state.active;playFrom(Math.max(id,0));}
  persist();
}
els.tempo.addEventListener('input',ev=>changeTempo(ev.target.value));
els.tempoValue.addEventListener('change',ev=>changeTempo(ev.target.value));
let resizeTimer;
window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(render,120);});
window.addEventListener('beforeprint',()=>{render();});
window.addEventListener('afterprint',()=>render());
