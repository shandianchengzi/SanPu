import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
function stripped(code){
  return code.replace(/^import .*;\s*/gm,'').replaceAll('export const ','const ').replaceAll('export function ','function ').replaceAll('export async function ','async function ');
}
class FakeElement {
  constructor(tag){
    this.tag=tag;this.children=[];this.attrs={};this.listeners={};this.dataset={};
    this.style={props:{},setProperty:(key,value)=>{this.style.props[key]=String(value)}};
    this.classes=new Set();this.classList={toggle:(name,on)=>{if(on??!this.classes.has(name))this.classes.add(name);else this.classes.delete(name);},contains:name=>this.classes.has(name)};this.value='';this.textContent='';
  }
  setAttribute(key,value){this.attrs[key]=String(value);if(key==='class')this.className=String(value);if(key==='data-bar-id')this.dataset.barId=String(value);if(key==='data-break-id')this.dataset.breakId=String(value);if(key==='data-note-id')this.dataset.noteId=String(value)}
  focus(){
    if(this.ownerDocument?.activeElement&&this.ownerDocument.activeElement!==this)
      this.ownerDocument.activeElement.focused=false;
    if(this.ownerDocument)this.ownerDocument.activeElement=this;
    this.focused=true;
  }
  blur(){this.blurred=true;this.focused=false;if(this.ownerDocument?.activeElement===this)this.ownerDocument.activeElement=null}
  closest(selector){
    for(let item=this;item;item=item.parent){
      if(selector.includes('.note-click')&&item.className==='note-click')return item;
      if(selector.includes('.bar-click')&&item.className==='bar-click')return item;
      if(selector.includes('.break-click')&&item.className==='break-click')return item;
    }
    return null;
  }
  contains(item){return this===item||this.children.some(child=>child.contains?.(item))}

  setRangeText(text,start,end){
    this.value=this.value.slice(0,start)+text+this.value.slice(end);
    this.selectionStart=this.selectionEnd=start+text.length;
  }
  click(){this.clicked=true;return this.dispatch('click')}
  remove(){this.removed=true}
  append(...children){for(const child of children){child.parent=this;this.children.push(child)}}
  replaceChildren(...children){this.children=[];this.append(...children)}
  addEventListener(type,listener){(this.listeners[type]??=[]).push(listener)}
  dispatch(type,event={}){let result;for(const listener of this.listeners[type]??[])result=listener(event);return result}
  querySelectorAll(selector){
    const found=[];
    const walk=node=>{for(const child of node.children){
      if(selector==='[data-format-key]' && child.dataset?.formatKey)found.push(child);
      if(selector==='.note-click' && child.className==='note-click')found.push(child);
      if(selector==='.bar-click' && child.className==='bar-click')found.push(child);
       if(selector==='.break-click' && child.className==='break-click')found.push(child);
      walk(child);
    }};
    walk(this);return found;
  }
}
function boot(saved,allowOverwrite=false){
  const ids={};
  for(const id of ['source','score','warnings','note-count','tempo','tempo-value',
    'play-btn','stop-btn','loop-count','score-type','mp3-btn','mp3-status','batch-shift','batch-apply','batch-status','batch-rhythm','batch-rhythm-apply','batch-slur','batch-clear','batch-target-label','batch-rhythm-target','batch-selection-count','backspace-previous','saved','transcriber-input','format-controls','format-preset','format-reset',
    'import-btn','file-input','save-btn','example-select','example-btn','pdf-btn','preview-zoom','preview-zoom-value','zoom-fit','format-tabs','timbre',
    'style-export-btn','style-import-btn','style-file-input','style-transfer-status','insert-spacer-btn',
     'piano-keys','piano-audition','piano-transpose','piano-continuous','piano-keyboard-diagram','piano-status']){
    ids[id]=new FakeElement('div');ids[id].id=id;
  }
  const head=new FakeElement('head'),documentEvents={};
  const document={
    head,body:new FakeElement('body'),activeElement:null,
    createElement:tag=>Object.assign(new FakeElement(tag),{ownerDocument:document}),
    createElementNS:(ns,tag)=>Object.assign(new FakeElement(tag),{ownerDocument:document}),
    getElementById:id=>id==='print-page-rules'?head.children.find(el=>el.id===id)??null:ids[id]??null,
    addEventListener:(type,cb)=>{(documentEvents[type]??=[]).push(cb);},
    dispatch:(type,event={})=>{for(const cb of documentEvents[type]??[])cb(event);}
  };
  for(const el of Object.values(ids))el.ownerDocument=document;
  head.ownerDocument=document;
  const localStorage={
    data:saved?{'sanpu.editor.v1':JSON.stringify(saved)}:{},
    getItem(key){return this.data[key]??null},
    setItem(key,value){this.data[key]=value}
  };
  const windowEvents={};
  const window={addEventListener(type,cb){(windowEvents[type]??=[]).push(cb);},
    dispatch(type,event={}){for(const cb of windowEvents[type]??[])cb(event);},
    print(){window.printed=true}};
  const code=[stripped(read('src/core.mjs')),stripped(read('src/format.mjs')),
    stripped(read('src/timbres.mjs')),stripped(read('src/mp3.mjs')),stripped(read('src/app.mjs')),
    'return {state,els,refresh,render};'].join('\n');
  const downloads=[];
  const fakeURL={
    createObjectURL(blob){downloads.push(blob);return 'blob:sanpu-test';},
    revokeObjectURL(){}
  };
  class FakeBlob{
    constructor(parts,opts){this.parts=parts;this.type=opts.type;}
  }
  class FakeDecoder{
    decode(buffer){return Array.from(new Uint8Array(buffer),value=>String.fromCharCode(value)).join('');}
  }
  const confirmations=[];
  const timers=new Map();let nextTimer=1;
  const setTimer=(fn,delay)=>{const id=nextTimer++;timers.set(id,{fn,delay});return id;};
  const clearTimer=id=>timers.delete(id);
  const frames=new Map();let nextFrame=1;
  const requestFrame=cb=>{const id=nextFrame++;frames.set(id,cb);return id;};
  const cancelFrame=id=>frames.delete(id);
  const api=new Function('document','window','localStorage',
    'cancelAnimationFrame','requestAnimationFrame','URL','Blob','setTimeout','clearTimeout','TextDecoder','confirm',code)(
    document,window,localStorage,cancelFrame,requestFrame,fakeURL,FakeBlob,setTimer,clearTimer,FakeDecoder,(msg)=>{confirmations.push(msg);return allowOverwrite;}
  );
  // Legacy keyboard-on fixtures now mean the score received focus by a click,
  // not that a persistent keyboard checkbox was checked.
  if(saved?.keyboardMode)ids.score.querySelectorAll('.note-click')[0]?.focus();
  return {...api,document,window,localStorage,head,downloads,confirmations,timers,frames,
    fireFrame(){const entry=frames.entries().next().value;if(entry){frames.delete(entry[0]);entry[1]();}},
    fireTimer(id){const item=timers.get(id);timers.delete(id);item?.fn();}};
}
const field=(els,key,suffix='')=>els.formatControls.querySelectorAll('[data-format-key]')
  .find(el=>el.id==='format-'+key+suffix);
const scoreLine=els=>els.score.children.find(el=>el.className==='score-line');

test('full appearance editor renders and updates score and persisted settings',()=>{
  const {state,els,localStorage,head,window}=boot();
  assert.equal(els.formatControls.children.length,3);
  assert.equal(els.formatControls.querySelectorAll('[data-format-key]').length,75);
  assert.equal(els.formatTabs.children.length,3);
  assert.ok(scoreLine(els));
  assert.equal(els.score.children.find(el=>el.className==='score-meta').children[0].children[1].textContent,'♩ = 72');
  const original=els.source.value;
  const slider=field(els,'lyricSize');slider.value='55';slider.dispatch('input');
  assert.equal(state.format.lyricSize,55);
  assert.equal(els.score.style.props['--lyric-size'],'55px');
  assert.equal(els.formatPreset.value,'custom');
  assert.equal(JSON.parse(localStorage.data['sanpu.editor.v1']).format.lyricSize,55);
  assert.equal(els.source.value,original,'appearance changes cannot rewrite source');
  els.formatPreset.value='compact';els.formatPreset.dispatch('change');
  assert.equal(state.format.lyricSize,45);
  assert.equal(els.formatPreset.value,'compact');
  const margin=field(els,'printMarginX','-value');
  margin.value='27';margin.dispatch('change');
  assert.match(head.children.find(el=>el.id==='print-page-rules').textContent,/27mm/);
  els.tempo.dispatch('input',{target:{value:'112'}});
  assert.equal(els.score.children.find(el=>el.className==='score-meta').children[0].children[1].textContent,'♩ = 112');
  assert.equal(window.printed,undefined);
});

test('oversized notation adds height, retains note timing and never draws curved ties',()=>{
  const {state,els,refresh}=boot({
    source:'.Title\nTitle = 测试\nKeyAndMeters = {1=C,3/4}\n.Voice\n7,,, 3___ 5\' |$(true)',
    format:{noteSize:80,lyricSize:65,lyricOffset:60}
  });
  assert.equal(state.song.meter,'3/4');
  const line=scoreLine(els);
  assert.ok(Number(line.attrs.viewBox.split(' ')[3])>195);
  assert.ok(!line.children.some(el=>el.tag==='path'),'no melisma curves');
  assert.equal(state.song.notes.length,3);
  assert.equal(els.score.style.props['--note-size'],'80px');
  assert.equal(els.score.style.props['--lyric-size'],'65px');
  els.source.value='.Voice\n1 2 3';
  refresh();
  assert.equal(state.song.notes.length,3);
});

test('reset restores standard preset without changing the input source',()=>{
  const {state,els,document}=boot({format:{noteSize:70,systemGap:45}});
  const before=els.source.value;
  assert.equal(state.format.noteSize,70);
  document.getElementById('format-reset').dispatch('click');
  assert.equal(state.format.noteSize,50);
  assert.equal(state.format.systemGap,-5);
  assert.equal(els.formatPreset.value,'standard');
  assert.equal(els.source.value,before);
});

test('SVG preview fits to container by default and user zoom does not alter its viewBox',()=>{
  const {state,els,document,localStorage}=boot();
  const viewBox=scoreLine(els).attrs.viewBox;
  assert.equal(state.zoom,100);
  assert.equal(els.score.style.props['--preview-width'],'100%');
  assert.equal(els.zoomValue.textContent,'适应宽度 · 100%');
  els.zoom.dispatch('input',{target:{value:'180'}});
  assert.equal(state.zoom,180);
  assert.equal(els.score.style.props['--preview-width'],'180%');
  assert.equal(scoreLine(els).attrs.viewBox,viewBox);
  assert.equal(JSON.parse(localStorage.data['sanpu.editor.v1']).zoom,180);
  document.getElementById('zoom-fit').dispatch('click');
  assert.equal(state.zoom,100);
  assert.equal(els.score.style.props['--preview-width'],'100%');
  const css=read('styles.css');
  assert.match(css,/\.score-page \.score-line\{width:var\(--preview-width,100%\)/);
  assert.match(css,/@media print\{\.score-page \.score-line\{width:100%!important/);
  assert.doesNotMatch(css,/\.score-page \.score-line\{width:var\(--line-render-width/);
});

test('saved SVG zoom preference is bounded independently from score formatting',()=>{
  const {state,els}=boot({zoom:240,format:{lyricSize:53}});
  assert.equal(state.zoom,240);
  assert.equal(els.score.style.props['--preview-width'],'240%');
  assert.equal(state.format.lyricSize,53);
  const overflowing=boot({zoom:1000000});
  assert.equal(overflowing.state.zoom,300);
  assert.equal(overflowing.els.score.style.props['--preview-width'],'300%');
});

test('score metadata supports separate tonic and tempo type sizes and weights, including printing',()=>{
  const {state,els}=boot({tempo:80});
  const meta=els.score.children.find(el=>el.className==='score-meta');
  assert.equal(meta.children[0].children[0].textContent,'1 = D');
  assert.equal(meta.children[0].children[1].textContent,'♩ = 80');
  assert.equal(meta.children[0].children[2].textContent,'记谱人：shandianchengzi');
  assert.deepEqual(meta.children[1].children.map(el=>el.textContent),['词曲作者：唐书琛（词）／卢冠廷（曲）','演唱者：周深（原唱：卢冠廷、莫文蔚）']);
  const tonic=field(els,'metaSize');
  tonic.value='48';tonic.dispatch('input');
  assert.equal(state.format.metaSize,48);
  assert.equal(els.score.style.props['--meta-size'],'48px');
  assert.equal(els.score.style.props['--tempo-size'],'21px');
  const tempo=field(els,'tempoSize','-value');
  tempo.value='37';tempo.dispatch('change');
  assert.equal(state.format.tempoSize,37);
  assert.equal(els.score.style.props['--meta-size'],'48px');
  assert.equal(els.score.style.props['--tempo-size'],'37px');
  const weight=field(els,'tempoWeight');
  weight.value='700';weight.dispatch('change');
  assert.equal(els.score.style.props['--tempo-weight'],'700');
  const css=read('styles.css');
  assert.match(css,/\.score-page \.score-tonic\{font-size:var\(--meta-size,21px\)/);
  assert.match(css,/\.score-page \.score-tempo\{font-size:var\(--tempo-size,21px\)/);
  assert.match(css,/@media print\{[\s\S]*?\.score-page \.score-tempo\{font-size:var\(--tempo-size,21px\)!important/);
  assert.match(css,/\.format-panel\{display:none!important\}/);
});

test('appearance tabs are keyboard accessible and show only the selected settings group',()=>{
  const {els}=boot();
  const [first,second,last]=els.formatTabs.children;
  const [firstPanel,secondPanel,lastPanel]=els.formatControls.children;
  assert.equal(first.attrs.role,'tab');
  assert.equal(first.attrs['aria-selected'],'true');
  assert.equal(firstPanel.hidden,false);
  assert.equal(secondPanel.hidden,true);
  second.dispatch('click');
  assert.equal(first.attrs['aria-selected'],'false');
  assert.equal(second.attrs['aria-selected'],'true');
  assert.equal(firstPanel.hidden,true);
  assert.equal(secondPanel.hidden,false);
  assert.equal(lastPanel.hidden,true);
  let prevented=false;
  second.dispatch('keydown',{key:'ArrowRight',preventDefault(){prevented=true;}});
  assert.equal(prevented,true);
  assert.equal(lastPanel.hidden,false);
  assert.equal(last.focused,true);
  last.dispatch('keydown',{key:'Home',preventDefault(){}});
  assert.equal(firstPanel.hidden,false);
  assert.equal(first.focused,true);
  assert.equal(last.attrs['aria-selected'],'false');
  assert.equal(first.tabIndex,0);
  assert.equal(second.tabIndex,-1);
});

test('appearance editor occupies a collapsed full-width section after the workspace',()=>{
  const html=read('index.html'),css=read('styles.css');
  assert.match(html,/<\/section>\s*<details class="format-panel" id="format-panel">/);
  assert.doesNotMatch(html,/<details class="format-panel" id="format-panel" open/);
  const editorStart=html.indexOf('<div class="editor-pane">');
  const previewStart=html.indexOf('<div class="preview-pane">');
  const formatStart=html.indexOf('<details class="format-panel"');
  assert.ok(editorStart>=0 && editorStart<previewStart && previewStart<formatStart);
  assert.match(html,/id="format-tabs" class="format-tabs" role="tablist"/);
  assert.match(html,/id="preview-zoom"/);
  assert.match(css,/\.format-tabpanel\[hidden\]\{display:none!important\}/);
});

test('negative lyric-to-lyric spacing updates layout variables, print and local storage',()=>{
  const source='.Title\nTitle = 测试\n.Voice\n1 2 $(true)\n3 4 $(true)\n5 6';
  const {state,els,localStorage}=boot({source});
  assert.equal(els.score.children.filter(el=>el.className==='score-line').length,3);
  const before=els.score.children.filter(el=>el.className==='score-line')
    .map(el=>el.attrs.viewBox);
  const slider=field(els,'lyricLineGap');
  const numeric=field(els,'lyricLineGap','-value');
  assert.equal(slider.min,'-160');
  assert.equal(numeric.min,'-160');
  slider.value='-70';slider.dispatch('input');
  assert.equal(state.format.lyricLineGap,-70);
  assert.equal(numeric.value,'-70');
  assert.equal(els.score.style.props['--lyric-line-gap'],'-70px');
  numeric.value='-115';numeric.dispatch('change');
  assert.equal(state.format.lyricLineGap,-115);
  assert.equal(slider.value,'-115');
  assert.equal(els.score.style.props['--lyric-line-gap'],'-115px');
  const saved=JSON.parse(localStorage.data['sanpu.editor.v1']);
  assert.equal(saved.format.lyricLineGap,-115);
  assert.deepEqual(els.score.children.filter(el=>el.className==='score-line').map(el=>el.attrs.viewBox),before);
  const css=read('styles.css');
  assert.match(css,/margin-bottom:calc\(var\(--system-gap,-5px\) \+ var\(--lyric-line-gap,0px\)\)/);
  assert.match(css,/margin-bottom:calc\(var\(--system-gap,-5px\) \+ var\(--lyric-line-gap,0px\)\)!important/);
});

test('signed distances can be negative through sliders, numeric inputs, and saved settings',()=>{
  const {state,els,localStorage}=boot();
  const offsets=[
    ['titleLetterSpacing',-3],['titleBottomGap',-25],['metaGap',-18],
    ['metaBottomGap',-25],['lyricLetterSpacing',-4],['systemGap',-31],
    ['lyricOffset',-25],['noteSpacing',-25]
  ];
  for(const [key,value] of offsets){
    const control=field(els,key,'-value');
    assert.ok(Number(control.min)<0,key+' numeric min');
    control.value=String(value);control.dispatch('change');
    assert.equal(state.format[key],value,key);
    assert.equal(field(els,key).value,String(value),key+' slider sync');
  }
  assert.equal(els.score.style.props['--meta-gap'],'-18px');
  assert.equal(els.score.style.props['--system-gap'],'-31px');
  assert.equal(els.score.style.props['--lyric-spacing'],'-4px');
  assert.equal(els.score.style.props['--title-bottom'],'-25px');
  assert.equal(JSON.parse(localStorage.data['sanpu.editor.v1']).format.noteSpacing,-25);
  const css=read('styles.css');
  assert.match(css,/\.score-page \.score-meta\{[\s\S]*?gap:0;/);
  assert.match(css,/\.score-page \.score-tempo\{[^}]*margin-left:var\(--meta-gap,9px\)/);
});

test('negative note and lyric offsets change actual SVG coordinates',()=>{
  const source='.Title\nTitle = t\n.Voice\n1 2 $(true)\n3 4\n.Words\nW1@1,1:\n天地玄黄';
  const standard=boot({source});
  const tight=boot({source,format:{noteSpacing:-30,lyricOffset:-45}});
  const getNoteRects=app=>app.els.score.children
    .filter(el=>el.className==='score-line')[0].children
    .filter(el=>el.className==='note-click')
    .map(group=>group.children.find(el=>el.tag==='rect').attrs.x);
  const getLyricY=app=>app.els.score.children
    .filter(el=>el.className==='score-line')[0].children
    .filter(el=>el.className==='note-click')[0].children
    .find(el=>el.className==='lyrics-text').attrs.y;
  const normalX=getNoteRects(standard),tightX=getNoteRects(tight);
  assert.ok(Number(tightX[1])-Number(tightX[0])<Number(normalX[1])-Number(normalX[0]));
  assert.ok(Number(getLyricY(tight))<Number(getLyricY(standard)));
  const css=read('styles.css');
  assert.match(css,/\.score-page \.score-line:last-child\{margin-bottom:0\}/);
  assert.match(css,/\.score-page \.score-line:last-child\{margin-bottom:0!important\}/);
});

test('timbre selector offers all offline instruments, saves and restores the choice',()=>{
  const {state,els,localStorage}=boot();
  assert.equal(state.timbre,'piano');
  assert.equal(els.timbre.children.length,7);
  assert.deepEqual(els.timbre.children.map(option=>option.value),
    ['sine','piano','guitar','flute','strings','organ','chip']);
  const source=els.source.value;
  els.timbre.dispatch('change',{target:{value:'flute'}});
  assert.equal(state.timbre,'flute');
  assert.equal(els.timbre.value,'flute');
  assert.equal(els.source.value,source,'sound selection must not edit score');
  assert.equal(JSON.parse(localStorage.data['sanpu.editor.v1']).timbre,'flute');
  const restored=boot({source,timbre:'guitar',tempo:90,format:{lyricLineGap:-21}});
  assert.equal(restored.state.timbre,'guitar');
  assert.equal(restored.els.timbre.value,'guitar');
  assert.equal(restored.state.tempo,90);
  assert.equal(restored.state.format.lyricLineGap,-21);
  restored.els.timbre.dispatch('change',{target:{value:'invalid-instrument'}});
  assert.equal(restored.state.timbre,'piano','unsupported preset falls back to default piano');
});

test('PDF print stylesheet removes the whole playback and timbre toolbar',()=>{
  const html=read('index.html'),css=read('styles.css');
  assert.match(html,/<div class="preview-toolbar">/);
  assert.match(html,/<label class="timbre-picker" for="timbre">/);
  assert.match(html,/id="timbre"/);
  assert.match(css,/@media print\s*\{\s*\.preview-toolbar\{display:none!important\}/);
});

test('changing timbre during playback resumes at the same timeline position',async()=>{
  const {state,els}=boot();
  const oscillators=[];
  const audio={
    currentTime:0,
    destination:{},
    resume:async()=>{},
    createPeriodicWave(real,imag){return {real,imag}},
    createOscillator(){
      const osc={
        frequency:{setValueAtTime(){},linearRampToValueAtTime(){}},setPeriodicWave(w){osc.wave=w},
        connect(){},start(){},stop(){osc.stopped=true},
        disconnect(){osc.disconnected=true}
      };
      oscillators.push(osc);return osc;
    },
    createGain(){
      return {
        gain:{setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},
        connect(){},disconnect(){}
      };
    }
  };
  state.audio=audio;
  els.play.dispatch('click');
  await Promise.resolve();
  assert.equal(state.playing,true);
  assert.ok(state.nodes.length>0);
  const initial=state.nodes.map(voice=>voice.oscillator);
  const before=state.song.notes.map(note=>note.beats);
  const position=state.schedule[2].start+.03;
  audio.currentTime=position;
  els.timbre.dispatch('change',{target:{value:'strings'}});
  await Promise.resolve();
  assert.equal(state.playing,true);
  assert.equal(state.timbre,'strings');
  assert.ok(Math.abs(state.position-position)<.001);
  assert.deepEqual(state.song.notes.map(note=>note.beats),before);
  assert.ok(initial.every(osc=>osc.disconnected));
  assert.ok(state.nodes.length>0);
  assert.ok(state.nodes.every(voice=>voice.oscillator.wave),'new voices use selected partials');
  els.stop.dispatch('click');
  assert.equal(state.playing,false);
  assert.equal(state.nodes.length,0);
});

test('high and low octave dot offsets change distance independently without altering source',()=>{
  const source=".Title\nTitle = 八度点\n.Voice\n1'' 7,,__ 3 4,";
  const {state,els,localStorage,document}=boot({source});
  assert.equal(state.song.notes.length,4);
  const dots=(index)=>scoreLine(els).children.filter(el=>el.className==='note-click')[index].children
    .filter(el=>el.tag==='circle'&&el.className==='octave');
  const numeralY=index=>Number(scoreLine(els).children.filter(el=>el.className==='note-click')[index]
    .children.find(el=>el.className==='note-num').attrs.y);
  const distanceAbove=()=>numeralY(0)-Number(dots(0)[0].attrs.cy);
  const distanceBelow=()=>Number(dots(1)[0].attrs.cy)-numeralY(1);
  assert.equal(dots(0).length,2);
  assert.equal(dots(1).length,2);
  const initialHigh=distanceAbove(),initialLow=distanceBelow(),defaultLow=state.format.lowOctaveDotOffset;
  const highSlider=field(els,'highOctaveDotOffset');
  const highNumber=field(els,'highOctaveDotOffset','-value');
  const lowSlider=field(els,'lowOctaveDotOffset');
  const lowNumber=field(els,'lowOctaveDotOffset','-value');
  assert.equal(highSlider.min,'-50');
  assert.equal(lowNumber.min,'-50');
  highSlider.value='45';highSlider.dispatch('input');
  assert.equal(state.format.highOctaveDotOffset,45);
  assert.equal(highNumber.value,'45');
  assert.ok(Math.abs(distanceAbove()-(initialHigh+45))<.001);
  assert.equal(distanceBelow(),initialLow);
  lowNumber.value='30';lowNumber.dispatch('change');
  assert.equal(state.format.lowOctaveDotOffset,30);
  assert.equal(lowSlider.value,'30');
  assert.ok(Math.abs(distanceBelow()-(initialLow+30-defaultLow))<.001);
  assert.ok(Math.abs(distanceAbove()-(initialHigh+45))<.001);
  highNumber.value='-20';highNumber.dispatch('change');
  lowSlider.value='-15';lowSlider.dispatch('input');
  assert.ok(Math.abs(distanceAbove()-(initialHigh-20))<.001);
  assert.ok(Math.abs(distanceBelow()-(initialLow-15-defaultLow))<.001);
  assert.equal(els.source.value,source);
  assert.equal(JSON.parse(localStorage.data['sanpu.editor.v1']).format.highOctaveDotOffset,-20);
  assert.equal(JSON.parse(localStorage.data['sanpu.editor.v1']).format.lowOctaveDotOffset,-15);
  document.getElementById('format-reset').dispatch('click');
  assert.equal(state.format.highOctaveDotOffset,0);
  assert.equal(state.format.lowOctaveDotOffset,-13);
  assert.ok(Math.abs(distanceAbove()-initialHigh)<.001);
  assert.ok(Math.abs(distanceBelow()-initialLow)<.001);
});

test('large positive octave dot offsets remain inside SVG viewBox and leave lyrics clear',()=>{
  const source=".Title\nTitle = 音点排版\n.Voice\n1''' 7,,,___ 2\n.Words\nW1@1,1:\n天/地";
  const {state,els}=boot({
    source,format:{highOctaveDotOffset:80,lowOctaveDotOffset:80,noteSize:80,lyricSize:65}
  });
  assert.equal(state.song.notes.length,3);
  const line=scoreLine(els);
  const height=Number(line.attrs.viewBox.split(' ')[3]);
  const groups=line.children.filter(el=>el.className==='note-click');
  const upperDots=groups[0].children.filter(el=>el.tag==='circle'&&el.className==='octave');
  const lowerDots=groups[1].children.filter(el=>el.tag==='circle'&&el.className==='octave');
  assert.equal(upperDots.length,3);
  assert.equal(lowerDots.length,3);
  assert.ok(upperDots.every(dot=>Number(dot.attrs.cy)-Number(dot.attrs.r)>0),'upper dots not clipped');
  assert.ok(lowerDots.every(dot=>Number(dot.attrs.cy)+Number(dot.attrs.r)<height),'lower dots not clipped');
  assert.ok(height>195,'SVG grows to fit octave dots');
  assert.ok(state.format.lowOctaveDotOffset>0);
  const lyric=groups[0].children.find(el=>el.className==='lyrics-text');
  if(lyric)assert.ok(Number(lyric.attrs.y)>Number(lowerDots.at(-1).attrs.cy));
  assert.equal(state.song.notes[0].octave,3);
  assert.equal(state.song.notes[1].octave,-3);
});

test('trailing punctuation is rendered to the right without shifting lyric body off its note',()=>{
  const source='.Title\nTitle = 标点对齐\n.Voice\n1 2 3 4\n.Words\nW1@1,1:\n天，海。你好！';
  const {state,els,localStorage,document}=boot({source});
  const groups=()=>scoreLine(els).children.filter(el=>el.className==='note-click');
  const notes=()=>groups().map(g=>g.children.find(x=>x.className==='note-num'));
  const main=idx=>groups()[idx].children.find(x=>x.className==='lyrics-text');
  const mark=idx=>groups()[idx].children.find(x=>x.className==='lyrics-text lyric-punctuation');
  assert.equal(groups().length,4);
  assert.equal(main(0).textContent,'天');
  assert.equal(mark(0).textContent,'，');
  assert.equal(main(1).textContent,'海');
  assert.equal(mark(1).textContent,'。');
  assert.equal(main(2).textContent,'你');
  assert.equal(mark(2),undefined);
  assert.equal(main(3).textContent,'好');
  assert.equal(mark(3).textContent,'！');
  for(const idx of [0,1,3]){
    assert.equal(Number(main(idx).attrs.x),Number(notes()[idx].attrs.x),'body centered under note');
    assert.ok(Number(mark(idx).attrs.x)>Number(main(idx).attrs.x),'mark on right');
    assert.equal(main(idx).attrs['text-anchor'],'middle');
    assert.equal(mark(idx).attrs['text-anchor'],'start');
  }
  const baseBodyX=Number(main(0).attrs.x),baseMarkX=Number(mark(0).attrs.x),baseGap=state.format.punctuationGap;
  const gapInput=field(els,'punctuationGap','-value');
  const slider=field(els,'punctuationGap');
  assert.equal(gapInput.min,'-30');
  assert.equal(slider.min,'-30');
  gapInput.value='-13';gapInput.dispatch('change');
  assert.equal(state.format.punctuationGap,-13);
  assert.equal(Number(main(0).attrs.x),baseBodyX);
  assert.equal(Number(mark(0).attrs.x),baseMarkX-13-baseGap);
  assert.equal(slider.value,'-13');
  slider.value='37';slider.dispatch('input');
  assert.equal(state.format.punctuationGap,37);
  assert.equal(Number(main(0).attrs.x),baseBodyX);
  assert.equal(Number(mark(0).attrs.x),baseMarkX+37-baseGap);
  assert.equal(gapInput.value,'37');
  assert.equal(els.source.value,source);
  assert.equal(JSON.parse(localStorage.data['sanpu.editor.v1']).format.punctuationGap,37);
  document.getElementById('format-reset').dispatch('click');
  assert.equal(state.format.punctuationGap,2);
  assert.equal(Number(mark(0).attrs.x),baseMarkX);
});

test('paired quotation marks keep the body centered with punctuation outside both sides',()=>{
  const source='.Voice\n1 2\n.Words\nW1@1,1:\n“天”海，';
  const {els}=boot({source});
  const groups=scoreLine(els).children.filter(el=>el.className==='note-click');
  const g=groups[0];
  const main=g.children.find(x=>x.className==='lyrics-text');
  const punctuation=g.children.filter(x=>x.className==='lyrics-text lyric-punctuation');
  assert.equal(main.textContent,'天');
  assert.equal(punctuation.length,2);
  const [prefix,suffix]=punctuation;
  assert.equal(prefix.textContent,'“');
  assert.equal(suffix.textContent,'”');
  assert.ok(Number(prefix.attrs.x)<Number(main.attrs.x));
  assert.ok(Number(suffix.attrs.x)>Number(main.attrs.x));
  assert.equal(main.attrs.x,g.children.find(x=>x.className==='note-num').attrs.x);
  assert.equal(groups[1].children.find(x=>x.className==='lyrics-text').textContent,'海');
});

test('punctuation placement uses the measured SVG lyric width where available',()=>{
  const original=FakeElement.prototype.getComputedTextLength;
  FakeElement.prototype.getComputedTextLength=function(){
    return this.className==='lyrics-text'?112:0;
  };
  try{
    const source='.Voice\n1\n.Words\nW1@1,1:\n天！';
    const {els}=boot({source,format:{punctuationGap:14}});
    const g=scoreLine(els).children.find(el=>el.className==='note-click');
    const main=g.children.find(el=>el.className==='lyrics-text');
    const mark=g.children.find(el=>el.className==='lyrics-text lyric-punctuation');
    assert.equal(main.textContent,'天');
    assert.equal(Number(mark.attrs.x),Number(main.attrs.x)+112/2+14);
  }finally{
    if(original===undefined)delete FakeElement.prototype.getComputedTextLength;
    else FakeElement.prototype.getComputedTextLength=original;
  }
});

function styleFile(text){
  const bytes=Uint8Array.from(Array.from(text,char=>char.charCodeAt(0)));
  return {size:bytes.length,async arrayBuffer(){return bytes.buffer}};
}
test('export style button produces a portable JSON with all current values and no song text',()=>{
  const {state,els,document,downloads}=boot({source:'.Voice\n1 2 3',
    format:{noteSize:69,lyricLineGap:-48,punctuationGap:21,highOctaveDotOffset:33},
    zoom:210,tempo:92,timbre:'flute'});
  document.getElementById('style-export-btn').dispatch('click');
  assert.equal(downloads.length,1);
  const blob=downloads[0];
  assert.match(blob.type,/application\/json/);
  const exported=JSON.parse(blob.parts.join(''));
  assert.equal(exported.type,'sanpu-score-style');
  assert.equal(exported.version,1);
  assert.equal(exported.settings.noteSize,69);
  assert.equal(exported.settings.lyricLineGap,-48);
  assert.equal(exported.settings.punctuationGap,21);
  assert.equal(exported.settings.highOctaveDotOffset,33);
  assert.equal(Object.keys(exported.settings).length,Object.keys(state.format).length);
  assert.equal(exported.source,undefined);
  assert.equal(exported.tempo,undefined);
  assert.equal(exported.timbre,undefined);
  assert.equal(exported.zoom,undefined);
  assert.equal(document.body.children.length,1);
  assert.equal(document.body.children[0].download,'SanPu-谱面样式.sanpu-style.json');
  assert.equal(document.body.children[0].clicked,true);
  assert.match(document.getElementById('style-transfer-status').textContent,/已导出/);
  assert.equal(els.source.value,'.Voice\n1 2 3');
});

test('import restores all appearance settings while keeping music and playback preferences',async()=>{
  const app=boot({source:'.Voice\n1 2 3',format:{noteSize:33,lyricLineGap:10},
    tempo:86,timbre:'guitar',zoom:180});
  const {state,els,document,localStorage}=app;
  const beforeSource=els.source.value;
  const payload={
    type:'sanpu-score-style',version:1,
    settings:{noteSize:65,lyricLineGap:-67,highOctaveDotOffset:-25,punctuationGap:31}
  };
  document.getElementById('style-import-btn').dispatch('click');
  const input=document.getElementById('style-file-input');
  assert.equal(input.clicked,true);
  input.files=[styleFile(JSON.stringify(payload))];
  await input.dispatch('change',{target:input});
  assert.equal(state.format.noteSize,65);
  assert.equal(state.format.lyricLineGap,-67);
  assert.equal(state.format.highOctaveDotOffset,-25);
  assert.equal(state.format.punctuationGap,31);
  assert.equal(els.score.style.props['--note-size'],'65px');
  assert.equal(els.score.style.props['--punctuation-gap'],'31px');
  assert.equal(els.formatPreset.value,'custom');
  assert.equal(field(els,'noteSize','-value').value,'65');
  assert.equal(field(els,'lyricLineGap').value,'-67');
  assert.equal(els.source.value,beforeSource);
  assert.equal(state.tempo,86);
  assert.equal(state.timbre,'guitar');
  assert.equal(state.zoom,180);
  assert.equal(input.value,'','allows reimporting the same file');
  assert.match(document.getElementById('style-transfer-status').textContent,/已导入/);
  assert.equal(JSON.parse(localStorage.data['sanpu.editor.v1']).format.punctuationGap,31);
});

test('bad or oversized style import is rejected without changing active editor state',async()=>{
  const {state,els,document,localStorage}=boot({
    source:'.Voice\n1 2',format:{lyricSize:54},tempo:105});
  const input=document.getElementById('style-file-input');
  const before=JSON.stringify(state.format);
  const beforeSource=els.source.value;
  const beforeSaved=localStorage.data['sanpu.editor.v1'];
  for(const raw of ['{broken',JSON.stringify({type:'bad',version:1,settings:{lyricSize:22}})]){
    input.files=[styleFile(raw)];
    await input.dispatch('change',{target:input});
    assert.equal(JSON.stringify(state.format),before);
    assert.equal(els.source.value,beforeSource);
    assert.match(document.getElementById('style-transfer-status').textContent,/导入失败/);
    assert.equal(input.value,'');
  }
  input.files=[{size:1024*1024+1,async arrayBuffer(){throw Error('must not read')}}];
  await input.dispatch('change',{target:input});
  assert.equal(JSON.stringify(state.format),before);
  assert.match(document.getElementById('style-transfer-status').textContent,/超过 1 MB/);
  assert.equal(state.tempo,105);
  assert.equal(localStorage.data['sanpu.editor.v1'],beforeSaved);
  input.files=[];
  await input.dispatch('change',{target:input});
});

test('style file controls are in the existing collapsible appearance panel',()=>{
  const html=read('index.html');
  const start=html.indexOf('<details class="format-panel"');
  const actions=html.indexOf('id="style-export-btn"');
  const upload=html.indexOf('id="style-import-btn"');
  const status=html.indexOf('id="style-transfer-status"');
  assert.ok(start>=0&&actions>start&&upload>actions&&status>upload);
  assert.match(html,/id="style-file-input" hidden accept="\.json,application\/json"/);
});

test('layout-only y spacers align barlines across SVG rows without touching notes or PDF',()=>{
  const plain='.Title\nTitle = 空位测试\n.Voice\n1 2 | 3 4 $(true)\n1 | 3 4\n.Words\nW1@1,1:\n天地玄黄宇宙洪';
  const noGap=boot({source:plain});
  const lines=app=>app.els.score.children.filter(el=>el.className==='score-line');
  const firstBar=el=>Number(el.children.find(x=>x.className==='bar').attrs.x1);
  const correction=firstBar(lines(noGap)[0])-firstBar(lines(noGap)[1]);
  const spaced=plain.replace('1 | 3 4',`1 y${correction} | 3 4`);
  const withGap=boot({source:spaced});
  assert.equal(lines(noGap).length,2);
  assert.equal(lines(withGap).length,2);
  assert.equal(lines(withGap)[0].attrs.viewBox,lines(withGap)[1].attrs.viewBox);
  assert.ok(firstBar(lines(noGap)[1])<firstBar(lines(noGap)[0]));
  assert.equal(firstBar(lines(withGap)[0]),firstBar(lines(withGap)[1]));
  assert.equal(withGap.state.song.notes.length,noGap.state.song.notes.length);
  assert.deepEqual(withGap.state.song.notes.map(n=>n.beats),noGap.state.song.notes.map(n=>n.beats));
  assert.deepEqual(withGap.state.song.notes.map(n=>withGap.state.song.lyrics.get(n.id)?.text),
    noGap.state.song.notes.map(n=>noGap.state.song.lyrics.get(n.id)?.text));
  assert.equal(lines(withGap)[1].children.filter(el=>el.className==='note-click').length,3);
  assert.equal(lines(noGap)[1].children.filter(el=>el.className==='note-click').length,3);
  assert.equal(withGap.state.song.warnings.length,0);
  const pdf=read('styles.css');
  assert.match(pdf,/@media print\{\.score-page \.score-line\{width:100%!important/);
});

test('insert layout gap button places y40 at source caret and saves original text',()=>{
  const source='.Voice\n1 | 2';
  const {state,els,document,localStorage}=boot({source});
  const at=els.source.value.indexOf('|');
  els.source.selectionStart=at;
  els.source.selectionEnd=at;
  document.getElementById('insert-spacer-btn').dispatch('click');
  assert.equal(els.source.value,'.Voice\n1  y40 | 2');
  assert.equal(els.source.focused,true);
  assert.equal(els.source.selectionStart,at+' y40 '.length);
  assert.equal(state.song.notes.length,2);
  assert.deepEqual(state.song.elements.filter(e=>e.kind==='spacer').map(e=>e.width),[40]);
  assert.equal(JSON.parse(localStorage.data['sanpu.editor.v1']).source,els.source.value);
  const html=read('index.html');
  assert.match(html,/id="insert-spacer-btn"/);
  assert.match(html,/<code>y40<\/code> 留白 40 单位/);
});

test('example library initializes with the provided score, preserving previously saved drafts',()=>{
  const initial=boot();
  assert.equal(initial.document.getElementById('example-select').children.length,1);
  assert.equal(initial.document.getElementById('example-select').value,'yi-sheng-suo-ai');
  assert.match(initial.els.source.value,/KeyAndMeters = \{1=D,3\/4\}/);
  assert.ok(initial.els.source.value.includes('y y y y y y y30|'));
  assert.ok(initial.els.source.value.includes('从前，现在,过去了再不来'));
  assert.equal(initial.state.song.notes.length,92);
  assert.equal(initial.state.song.warnings.length,0);
  const draft=boot({source:'.Voice\n1 2',format:{titleSize:62}});
  assert.equal(draft.els.source.value,'.Voice\n1 2');
  assert.equal(draft.state.format.titleSize,62);
  draft.document.getElementById('example-btn').click();
  assert.equal(draft.els.source.value,'.Voice\n1 2');
  assert.equal(draft.confirmations.length,1);
  const approved=boot({source:'.Voice\n1 2'},true);
  approved.document.getElementById('example-btn').click();
  assert.match(approved.els.source.value,/Title = 一生所爱/);
  assert.equal(approved.state.song.key,'D');
  assert.equal(approved.state.song.notes.length,92);
});

test('piano keyboard and saved audition mode',()=>{
  const {document,state,els,localStorage}=boot({pianoTranspose:false});
  const keys=document.getElementById('piano-keys').children;
  assert.equal(keys.length,36);
  assert.equal(keys[0].attrs.title,'C3 · b7,,');
  assert.equal(keys[1].attrs.title,'C♯3 · 7,,');
  assert.equal(keys.at(-1).attrs.title,"B5 · 6'");
  const checkbox=document.getElementById('piano-audition');
  assert.equal(checkbox.checked,true);
  const before=els.source.value;
  checkbox.checked=false;checkbox.dispatch('change');
  assert.equal(state.pianoAudition,false);
  assert.equal(JSON.parse(localStorage.data['sanpu.editor.v1']).pianoAudition,false);
  assert.equal(els.source.value,before);
});
test('piano inserts after selected note and subsequent notes, with duration',()=>{
  const source='.Title\nKeyAndMeters = {1=D,3/4}\n.Voice\n1 2 | 3\n.Words\nW1@1,1:\n天地玄';
  const {state,els,document,localStorage}=boot({source,pianoAudition:false,pianoTranspose:false,pianoContinuous:false});
  const keys=document.getElementById('piano-keys').children;
  const d4=keys.find(k=>k.dataset.midi==='62');
  const e4=keys.find(k=>k.dataset.midi==='64');
  state.cursorNoteId=0;
  d4.dispatch('pointerdown',{type:'pointerdown',button:0,timeStamp:0,pointerId:1});
  d4.dispatch('pointerup',{type:'pointerup',timeStamp:1500,pointerId:1});
  d4.dispatch('click');
  assert.deepEqual(state.song.notes.map(n=>n.raw),['1','1-','2','3']);
  assert.equal(state.cursorNoteId,1);
  e4.dispatch('pointerdown',{type:'pointerdown',button:0,timeStamp:2000,pointerId:2});
  e4.dispatch('pointerup',{type:'pointerup',timeStamp:2375,pointerId:2});
  assert.deepEqual(state.song.notes.map(n=>n.raw),['1','1-','2_','2','3']);
  assert.ok(els.source.value.includes('.Words\nW1@1,1:\n天地玄'));
  assert.equal(JSON.parse(localStorage.data['sanpu.editor.v1']).source,els.source.value);
  assert.match(document.getElementById('piano-status').textContent,/已插入/);
});

test('keyboard activation inserts exactly once at keyup and respects pressed duration',()=>{
  const src='.Title\nKeyAndMeters = {1=C,3/4}\n.Voice\n1';
  const {state,document}=boot({source:src,pianoAudition:false,pianoTranspose:false,pianoContinuous:false});
  const key=document.getElementById('piano-keys').children.find(x=>x.dataset.midi==='60');
  let suppressed=0;
  key.dispatch('keydown',{type:'keydown',key:'Enter',timeStamp:100,preventDefault(){suppressed++;}});
  key.dispatch('keydown',{type:'keydown',key:'Enter',repeat:true,timeStamp:200,preventDefault(){suppressed++;}});
  key.dispatch('keyup',{type:'keyup',key:'Enter',timeStamp:850,preventDefault(){suppressed++;}});
  key.dispatch('click');
  assert.deepEqual(state.song.notes.map(n=>n.raw),['1','1']);
  assert.equal(suppressed,3);
});

test('key-signature transposition checkbox retunes note entry and labels without touching source',()=>{
  const source='.Title\nKeyAndMeters = {1=D,3/4}\n.Voice\n1';
  const {els,document,state,localStorage}=boot({source,pianoAudition:false,pianoTranspose:false,pianoContinuous:false});
  const transpose=document.getElementById('piano-transpose');
  const keyboard=document.getElementById('piano-keys').children;
  const c4=keyboard.find(x=>x.dataset.midi==='60');
  assert.equal(transpose.checked,false,'explicitly saved false preserves untransposed keyboard');
  assert.equal(state.pianoTranspose,false);
  assert.equal(c4.attrs.title,'C4 · b7,');
  transpose.checked=true;transpose.dispatch('change');
  assert.equal(state.pianoTranspose,true);
  assert.equal(c4.attrs.title,'C4 → D4 · 1');
  assert.equal(c4.attrs['aria-label'],'C4 → D4，简谱 1');
  assert.equal(JSON.parse(localStorage.data['sanpu.editor.v1']).pianoTranspose,true);
  assert.equal(els.source.value,source,'checkbox must not modify score');
  state.cursorNoteId=0;
  c4.dispatch('pointerdown',{type:'pointerdown',button:0,timeStamp:1000,pointerId:7});
  c4.dispatch('pointerup',{type:'pointerup',timeStamp:1850,pointerId:7});
  assert.deepEqual(state.song.notes.map(x=>x.raw),['1','1']);
  transpose.checked=false;transpose.dispatch('change');
  assert.equal(c4.attrs.title,'C4 · b7,');
  c4.dispatch('pointerdown',{type:'pointerdown',button:0,timeStamp:2000,pointerId:7});
  c4.dispatch('pointerup',{type:'pointerup',timeStamp:2850,pointerId:7});
  assert.deepEqual(state.song.notes.map(x=>x.raw),['1','1','b7,']);
  assert.equal(boot({source,pianoTranspose:true}).state.pianoTranspose,true);
});
test('piano audition uses the same transposed sounding pitch as notation',async()=>{
  const source='.Title\nKeyAndMeters = {1=D,3/4}\n.Voice\n1';
  const {state,document}=boot({source,pianoAudition:true,pianoTranspose:true});
  const frequencies=[];
  state.audio={
    currentTime:0,destination:{},resume:async()=>{},
    createPeriodicWave(){return {};},
    createOscillator(){
      return {frequency:{setValueAtTime(value){frequencies.push(value);}},
        setPeriodicWave(){},connect(){},start(){},stop(){},disconnect(){}};
    },
    createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(){},
      exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};}
  };
  const c4=document.getElementById('piano-keys').children.find(x=>x.dataset.midi==='60');
  c4.dispatch('pointerdown',{type:'pointerdown',button:0,timeStamp:100});
  await Promise.resolve();await Promise.resolve();
  assert.ok(frequencies.length>0);
  assert.ok(Math.abs(frequencies[0]-440*Math.pow(2,(62-69)/12))<1e-8,'C4 sounds D4');
  c4.dispatch('pointerup',{type:'pointerup',timeStamp:200});
  assert.equal(state.song.notes.length,1,'audition never inserts');
});

test('continuous mode measures note-on to next note-on, not mouse-up, and finalizes the last held note',()=>{
  const source='.Title\nKeyAndMeters = {1=C,3/4}\n.Voice\n1 | y40 2\n.Words\nW1@1,1:\n甲乙';
  const {els,document,state,localStorage,timers,fireTimer}=boot({source,pianoAudition:false,pianoContinuous:true,tempo:120});
  const keys=document.getElementById('piano-keys').children;
  const c4=keys.find(k=>k.dataset.midi==='60');
  const d4=keys.find(k=>k.dataset.midi==='62');
  assert.equal(document.getElementById('piano-continuous').checked,true);
  state.cursorNoteId=0;
  c4.dispatch('pointerdown',{type:'pointerdown',button:0,timeStamp:100,pointerId:1});
  assert.deepEqual(state.song.notes.map(n=>n.raw),['1','1-','2']);
  c4.dispatch('pointerup',{type:'pointerup',timeStamp:200,pointerId:1});
  assert.deepEqual(state.song.notes.map(n=>n.raw),['1','1-','2'],'mouse-up retains provisional two-beat note');
  const oldTimer=[...timers.entries()].find(([,v])=>v.delay>=1800)?.[0];
  assert.ok(oldTimer);
  // One beat after first key-down, despite releasing early to move mouse.
  d4.dispatch('pointerdown',{type:'pointerdown',button:0,timeStamp:600,pointerId:2});
  assert.deepEqual(state.song.notes.map(n=>n.raw),['1','1','2-','2']);
  assert.equal(timers.has(oldTimer),false,'next onset cancels previous idle timeout');
  d4.dispatch('pointerup',{type:'pointerup',timeStamp:850,pointerId:2});
  assert.deepEqual(state.song.notes.map(n=>n.raw),['1','1','2-','2']);
  const idleId=[...timers.entries()].find(([,v])=>v.delay>=1800)?.[0];
  assert.ok(idleId);
  assert.equal(JSON.parse(localStorage.data['sanpu.editor.v1']).source,els.source.value);
  fireTimer(idleId);
  assert.deepEqual(state.song.notes.map(n=>n.raw),['1','1','2_','2']);
  assert.match(document.getElementById('piano-status').textContent,/末音/);
  assert.ok(els.source.value.includes(' | y40 2'));
  assert.ok(els.source.value.endsWith('.Words\nW1@1,1:\n甲乙'));
});
test('continuous mode survives overlapping holds and does not rewrite finalized notes',()=>{
  const source='.Title\nKeyAndMeters = {1=C,3/4}\n.Voice\n1';
  const {state,document,timers,fireTimer}=boot({source,pianoAudition:false,pianoContinuous:true,tempo:120});
  const keys=document.getElementById('piano-keys').children;
  const c=keys.find(x=>x.dataset.midi==='60'),e=keys.find(x=>x.dataset.midi==='64'),g=keys.find(x=>x.dataset.midi==='67');
  state.cursorNoteId=0;
  c.dispatch('pointerdown',{type:'pointerdown',button:0,timeStamp:100});
  e.dispatch('pointerdown',{type:'pointerdown',button:0,timeStamp:1100});
  assert.deepEqual(state.song.notes.map(x=>x.raw),['1','1-','3-']);
  c.dispatch('pointerup',{type:'pointerup',timeStamp:1300});
  assert.deepEqual(state.song.notes.map(x=>x.raw),['1','1-','3-'],'late release must not overwrite inter-onset duration');
  e.dispatch('pointerup',{type:'pointerup',timeStamp:1500});
  assert.deepEqual(state.song.notes.map(x=>x.raw),['1','1-','3-']);
  const timeout=[...timers.entries()].find(([,v])=>v.delay>=1800)?.[0];
  fireTimer(timeout);
  assert.deepEqual(state.song.notes.map(x=>x.raw),['1','1-','3_.']);
  g.dispatch('pointerdown',{type:'pointerdown',button:0,timeStamp:5000});
  g.dispatch('pointerup',{type:'pointerup',timeStamp:5250});
  assert.deepEqual(state.song.notes.map(x=>x.raw),['1','1-','3_.','5-'],'next phrase cannot retime old last note');
});
test('continuous mode ignored during audition and preference transitions stop pending rewrites',()=>{
  const source='.Title\nKeyAndMeters = {1=C,3/4}\n.Voice\n1';
  const {state,els,document,localStorage}=boot({source,pianoContinuous:false,pianoAudition:false,tempo:100});
  const mode=document.getElementById('piano-continuous');
  assert.equal(mode.checked,false,'explicitly saved false keeps this feature off');
  mode.checked=true;mode.dispatch('change');
  assert.equal(state.pianoContinuous,true);
  assert.equal(JSON.parse(localStorage.data['sanpu.editor.v1']).pianoContinuous,true);
  const c=document.getElementById('piano-keys').children.find(x=>x.dataset.midi==='60');
  c.dispatch('pointerdown',{type:'pointerdown',button:0,timeStamp:100});
  c.dispatch('pointerup',{type:'pointerup',timeStamp:300});
  assert.deepEqual(state.song.notes.map(x=>x.raw),['1','1-']);
  // Switch off before another event; first note keeps its held duration.
  mode.checked=false;mode.dispatch('change');
  c.dispatch('pointerdown',{type:'pointerdown',button:0,timeStamp:600});
  c.dispatch('pointerup',{type:'pointerup',timeStamp:1200});
  assert.deepEqual(state.song.notes.map(x=>x.raw),['1','1-','1']);
  const audition=document.getElementById('piano-audition');
  audition.checked=true;audition.dispatch('change');
  const before=els.source.value;
  c.dispatch('pointerdown',{type:'pointerdown',button:0,timeStamp:1300});
  c.dispatch('pointerup',{type:'pointerup',timeStamp:1600});
  assert.equal(els.source.value,before);
  assert.equal(boot({source,pianoContinuous:true}).state.pianoContinuous,true);
});
test('new onset after idle threshold does not retroactively expand final note even before throttled timer',()=>{
  const source='.Title\nKeyAndMeters = {1=C,3/4}\n.Voice\n1';
  const {state,document}=boot({source,pianoContinuous:true,pianoAudition:false,tempo:120});
  const c=document.getElementById('piano-keys').children.find(x=>x.dataset.midi==='60');
  state.cursorNoteId=0;
  c.dispatch('pointerdown',{type:'pointerdown',button:0,timeStamp:100});
  c.dispatch('pointerup',{type:'pointerup',timeStamp:225});
  c.dispatch('pointerdown',{type:'pointerdown',button:0,timeStamp:5000});
  assert.deepEqual(state.song.notes.map(x=>x.raw),['1','1__','1-']);
  c.dispatch('pointerup',{type:'pointerup',timeStamp:5500});
  assert.deepEqual(state.song.notes.map(x=>x.raw),['1','1__','1-']);
});

test('piano sounds on key-down even with audition unchecked, and records only once on release',async()=>{
  const source='.Title\nKeyAndMeters = {1=D,3/4}\n.Voice\n1';
  const {state,els,document}=boot({source,pianoAudition:false,pianoTranspose:true,pianoContinuous:false,tempo:120});
  const frequencies=[];
  state.audio={
    currentTime:0,destination:{},resume:async()=>{},
    createPeriodicWave(){return {};},
    createOscillator(){
      return {frequency:{setValueAtTime(freq){frequencies.push(freq);}},
        setPeriodicWave(){},connect(){},start(){},stop(){},disconnect(){}};
    },
    createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(){},
      exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};}
  };
  const c4=document.getElementById('piano-keys').children.find(key=>key.dataset.midi==='60');
  c4.dispatch('pointerdown',{type:'pointerdown',button:0,timeStamp:100,pointerId:7});
  await Promise.resolve();await Promise.resolve();
  assert.equal(frequencies.length,1,'key-down must trigger sound even when recording');
  assert.ok(Math.abs(frequencies[0]-440*Math.pow(2,(62-69)/12))<1e-8,'transposed C4 sounds D4');
  assert.equal(els.source.value,source,'ordinary recording still writes at release');
  c4.dispatch('pointerup',{type:'pointerup',timeStamp:600,pointerId:7});
  c4.dispatch('click');
  assert.deepEqual(state.song.notes.map(n=>n.raw),['1','1']);
  assert.equal(frequencies.length,1,'synthetic click after pointer-up must not play twice');
});
test('continuous piano recording also sounds immediately on each successive key-down',async()=>{
  const source='.Title\nKeyAndMeters = {1=C,3/4}\n.Voice\n1';
  const {state,document}=boot({source,pianoAudition:false,pianoContinuous:true,tempo:120});
  const frequencies=[];
  state.audio={
    currentTime:0,destination:{},resume:async()=>{},
    createPeriodicWave(){return {};},
    createOscillator(){
      return {frequency:{setValueAtTime(freq){frequencies.push(freq);}},
        setPeriodicWave(){},connect(){},start(){},stop(){},disconnect(){}};
    },
    createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(){},
      exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};}
  };
  const keys=document.getElementById('piano-keys').children;
  const c4=keys.find(k=>k.dataset.midi==='60'),e4=keys.find(k=>k.dataset.midi==='64');
  state.cursorNoteId=0;
  c4.dispatch('pointerdown',{type:'pointerdown',button:0,timeStamp:100});
  await Promise.resolve();await Promise.resolve();
  assert.equal(frequencies.length,1);
  assert.deepEqual(state.song.notes.map(n=>n.raw),['1','1-']);
  c4.dispatch('pointerup',{type:'pointerup',timeStamp:150});
  e4.dispatch('pointerdown',{type:'pointerdown',button:0,timeStamp:600});
  await Promise.resolve();await Promise.resolve();
  assert.equal(frequencies.length,2,'next key-down sounds and updates previous duration');
  assert.ok(Math.abs(frequencies[1]-440*Math.pow(2,(64-69)/12))<1e-8);
  assert.deepEqual(state.song.notes.map(n=>n.raw),['1','1','3-']);
  e4.dispatch('pointerup',{type:'pointerup',timeStamp:850});
  assert.equal(state.song.notes.length,3);
});
test('click-only piano activation produces audio and a note in record mode',async()=>{
  const source='.Title\nKeyAndMeters = {1=C,3/4}\n.Voice\n1';
  const {state,document}=boot({source,pianoAudition:false,pianoTranspose:false,pianoContinuous:false});
  let sounds=0;
  state.audio={
    currentTime:0,destination:{},resume:async()=>{},
    createPeriodicWave(){return {};},
    createOscillator(){
      sounds++;
      return {frequency:{setValueAtTime(){}},setPeriodicWave(){},
        connect(){},start(){},stop(){},disconnect(){}};
    },
    createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(){},
      exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};}
  };
  document.getElementById('piano-keys').children.find(k=>k.dataset.midi==='60').click();
  await Promise.resolve();await Promise.resolve();
  assert.equal(sounds,1);
  assert.deepEqual(state.song.notes.map(n=>n.raw),['1','1']);
});

test('clicking a score note also plays in recording mode while retaining score focus',async()=>{
  const source='.Title\nKeyAndMeters = {1=G,3/4}\n.Voice\n3,_ y40 3,_ | #4,... $(true)\n3,_\n.Words\nW1@1,1:\n甲乙丙丁';
  const {state,els,document}=boot({source,pianoAudition:false});
  let stopped=0;
  state.playing=true;state.audio={currentTime:1,destination:{},resume:async()=>{},
    createPeriodicWave(){return {};},
    createOscillator(){return {frequency:{setValueAtTime(){}},setPeriodicWave(){},
      connect(){},start(){},stop(){},disconnect(){}}},
    createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(){},
      exponentialRampToValueAtTime(){}},connect(){},disconnect(){}}}
  };
  state.nodes=[{stop(){stopped++;}}];
  const notes=els.score.querySelectorAll('.note-click');
  assert.equal(notes.length,4);
  notes[2].dispatch('click');
  await Promise.resolve();await Promise.resolve();
  assert.equal(stopped,1,'currently sounding notes must stop');
  assert.equal(state.playing,true);
  assert.equal(els.play.textContent,'Ⅱ 暂停');
  assert.equal(state.cursorNoteId,2);
  assert.equal(state.active,2);
  assert.notEqual(els.source.focused,true);
  assert.equal(document.activeElement,notes[2]);
  assert.equal(els.source.selectionStart,source.indexOf('#4,...')+6);
  assert.equal(els.source.selectionEnd,els.source.selectionStart);
  let prevented=0;
  notes[1].dispatch('keydown',{key:'Enter',preventDefault(){prevented++;}});
  assert.equal(prevented,1);
  assert.equal(state.cursorNoteId,1);
  assert.equal(els.source.selectionStart,source.indexOf('3,_',source.indexOf('y40'))+3);
  assert.equal(els.source.value,source);
});
test('clicking score note in audition mode continues playing from selected note and focuses source',async()=>{
  const source='.Title\nKeyAndMeters = {1=C,3/4}\n.Voice\n1 2 | 3';
  const {state,els}=boot({source,pianoAudition:true});
  let oscillators=0;
  state.audio={
    currentTime:0,destination:{},resume:async()=>{},
    createPeriodicWave(){return {};},
    createOscillator(){
      oscillators++;
      return {frequency:{setValueAtTime(){}},setPeriodicWave(){},
        connect(){},start(){},stop(){},disconnect(){}};
    },
    createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(){},
      exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};}
  };
  els.score.querySelectorAll('.note-click')[1].dispatch('click');
  await Promise.resolve();await Promise.resolve();
  assert.equal(state.cursorNoteId,1);
  assert.notEqual(els.source.focused,true);
  assert.equal(state.selectedNoteIds.has(1),true);
  assert.equal(els.source.selectionStart,source.indexOf('2 |')+1);
  assert.equal(state.playing,true);
  assert.ok(oscillators>0);
  els.stop.dispatch('click');
});

test('accidental and augmentation-dot gaps move markers separately and reserve horizontal room',()=>{
  const source='.Title\nKeyAndMeters = {1=C,3/4}\n.Voice\n#4... 4... 4 #5';
  const {state,els,localStorage}=boot({source});
  const notes=()=>scoreLine(els).children.filter(el=>el.className==='note-click');
  const numeral=group=>Number(group.children.find(el=>el.className==='note-num').attrs.x);
  const accidental=group=>Number(group.children.find(el=>el.className==='accidental').attrs.x);
  const dot=group=>Number(group.children.find(el=>el.className==='octave duration-dot').attrs.cx);
  const before=notes();
  const baseAccDistance=numeral(before[0])-accidental(before[0]);
  const baseDotDistance=dot(before[0])-numeral(before[0]);
  const baselineWidth=Number(scoreLine(els).attrs.viewBox.split(' ')[2]);
  assert.equal(state.format.accidentalGap,0);
  assert.equal(state.format.durationDotGap,0);
  const accSlider=field(els,'accidentalGap');
  const dotValue=field(els,'durationDotGap','-value');
  assert.equal(accSlider.min,'-25');
  assert.equal(dotValue.max,'70');
  accSlider.value='30';accSlider.dispatch('input');
  const afterAcc=notes();
  assert.equal(numeral(afterAcc[0])-accidental(afterAcc[0]),baseAccDistance+30);
  assert.equal(dot(afterAcc[0])-numeral(afterAcc[0]),baseDotDistance);
  assert.equal(numeral(afterAcc[1]),numeral(before[1])+30,
    'next note shifts only to reserve the preceding accidental');
  assert.equal(numeral(afterAcc[0]),numeral(before[0])+30);
  dotValue.value='38';dotValue.dispatch('change');
  const afterDots=notes();
  assert.equal(numeral(afterDots[0])-accidental(afterDots[0]),baseAccDistance+30);
  assert.equal(dot(afterDots[0])-numeral(afterDots[0]),baseDotDistance+38);
  assert.equal(dot(afterDots[1])-numeral(afterDots[1]),baseDotDistance+38);
  assert.equal(numeral(afterDots[2]),numeral(afterAcc[2])+76,
    'two preceding dotted notes each reserve their own increased right gap');
  assert.equal(afterDots[2].children.filter(el=>el.className==='octave duration-dot').length,0,
    'undotted note must not acquire a dot');
  assert.equal(Number(scoreLine(els).attrs.viewBox.split(' ')[2]),baselineWidth,
    'short lines retain their configured minimum width while their note cells expand');
  assert.equal(state.format.accidentalGap,30);
  assert.equal(state.format.durationDotGap,38);
  assert.equal(JSON.parse(localStorage.data['sanpu.editor.v1']).format.accidentalGap,30);
  assert.equal(JSON.parse(localStorage.data['sanpu.editor.v1']).format.durationDotGap,38);
  assert.equal(els.score.style.props['--accidental-gap'],'30px');
  assert.equal(els.score.style.props['--duration-dot-gap'],'38px');
  assert.equal(els.source.value,source,'spacing never changes note source');
  dotValue.value='-18';dotValue.dispatch('change');
  assert.equal(dot(notes()[0])-numeral(notes()[0]),baseDotDistance-18);
  const restored=boot({source,format:{accidentalGap:19,durationDotGap:-12}});
  assert.equal(numeral(restored.els.score.children.find(el=>el.className==='score-line').children.find(el=>el.className==='note-click')) -
    Number(restored.els.score.children.find(el=>el.className==='score-line').children.find(el=>el.className==='note-click').children.find(el=>el.className==='accidental').attrs.x),
    baseAccDistance+19);
});

test('credits are aligned on tonic row, editable per-song and typographically independent',()=>{
  const src='.Title\nTitle = 样例\nKeyAndMeters = {1=A,4/4}\nWordsByAndMusicBy = 作者甲\nTranscriber = 用户乙\nSinger = 歌手丙\n.Voice\n1 2';
  const {els,state,localStorage}=boot({source:src});
  const meta=els.score.children.find(e=>e.className==='score-meta');
  assert.equal(meta.children[0].className,'score-meta-left');
  assert.deepEqual(meta.children[0].children.map(e=>e.textContent),
    ['1 = A','♩ = 72','记谱人：用户乙']);
  assert.equal(meta.children[1].className,'score-meta-right');
  assert.deepEqual(meta.children[1].children.map(e=>e.textContent),
    ['词曲作者：作者甲','演唱者：歌手丙']);
  const size=field(els,'transcriberSize');
  size.value='29';size.dispatch('input');
  const font=field(els,'transcriberFont');
  font.value='kai';font.dispatch('change');
  const right=field(els,'creditSize','-value');
  right.value='23';right.dispatch('change');
  assert.equal(state.format.transcriberSize,29);
  assert.equal(state.format.transcriberFont,'kai');
  assert.equal(state.format.creditSize,23);
  assert.equal(els.score.style.props['--transcriber-size'],'29px');
  assert.equal(els.score.style.props['--credit-size'],'23px');
  assert.equal(JSON.parse(localStorage.data['sanpu.editor.v1']).format.transcriberFont,'kai');
  assert.equal(els.source.value,src);
  const css=read('styles.css');
  assert.match(css,/\.score-page \.score-meta-right\{display:flex;flex-direction:column;align-items:flex-end/);
  assert.match(css,/\.score-page \.score-transcriber\{/);
  assert.match(css,/@media print\{[\s\S]*?\.score-page \.score-transcriber\{/);
});
test('BPM digit field accepts typing, clamps limits and synchronizes audio, slider and score',()=>{
  const {els,state,document,localStorage}=boot({tempo:72});
  const number=document.getElementById('tempo-value');
  assert.equal(number.value,'72');
  number.value='135';number.dispatch('change',{target:number});
  assert.equal(state.tempo,135);
  assert.equal(els.tempo.value,'135');
  assert.equal(number.value,'135');
  assert.equal(els.score.children.find(e=>e.className==='score-meta').children[0].children[1].textContent,'♩ = 135');
  assert.equal(JSON.parse(localStorage.data['sanpu.editor.v1']).tempo,135);
  number.value='999';number.dispatch('change',{target:number});
  assert.equal(state.tempo,180);
  assert.equal(number.value,'180');
  number.value='-1';number.dispatch('change',{target:number});
  assert.equal(state.tempo,35);
  number.value='';number.dispatch('change',{target:number});
  assert.equal(state.tempo,35);
  assert.equal(number.value,'35');
  els.tempo.value='90';els.tempo.dispatch('input',{target:els.tempo});
  assert.equal(number.value,'90');
  assert.equal(state.tempo,90);
  assert.match(read('index.html'),/id="tempo-value" type="number"/);
});

test('transcriber input can be changed and explicitly emptied without erasing old notation',()=>{
  const input='.Title\nTitle = T\nKeyAndMeters = {1=C,3/4}\n.Voice\n1 2';
  const {state,els,document,localStorage}=boot({source:input});
  const name=document.getElementById('transcriber-input');
  assert.equal(name.value,'shandianchengzi');
  name.value='小橙子';name.dispatch('change');
  assert.equal(state.song.transcriber,'小橙子');
  assert.ok(els.source.value.includes('Transcriber = 小橙子'));
  assert.equal(els.source.value.split('.Voice')[1],'\n1 2');
  assert.equal(els.score.children.find(e=>e.className==='score-meta').children[0].children[2].textContent,'记谱人：小橙子');
  name.value='';name.dispatch('change');
  assert.equal(state.song.transcriber,'');
  assert.ok(els.source.value.includes('Transcriber = \n'));
  assert.equal(els.score.children.find(e=>e.className==='score-meta').children[0].children.length,2);
  assert.equal(JSON.parse(localStorage.data['sanpu.editor.v1']).source,els.source.value);
  assert.equal(name.value,'');
});
test('slurs draw independent SVG arcs, including continuation across manual score rows',()=>{
  const source='.Title\nTitle = Slur\n.Voice\n(1 2 $(true) 3 4) 5';
  const {state,els}=boot({source});
  assert.deepEqual(state.song.slurs,[{startId:0,endId:3}]);
  const lines=els.score.children.filter(e=>e.className==='score-line');
  assert.equal(lines.length,2);
  for(const line of lines){
    assert.equal(line.children.filter(e=>e.className==='score-slur').length,1);
    const path=line.children.find(e=>e.className==='score-slur');
    assert.match(path.attrs.d,/^M [\d.]+ [\d.-]+ Q [\d.]+ [\d.-]+ [\d.]+ [\d.-]+$/);
    assert.equal(path.attrs['aria-hidden'],'true');
  }
  assert.equal(state.song.notes[0].beats,1);
  assert.equal(state.song.notes[1].beats,1);
  assert.equal(els.source.value,source);
});

test('MP3 button reports missing offline renderer gracefully without changing source',async()=>{
  const source='.Title\nTitle = 示例\n.Voice\n1 2';
  const {state,els,document}=boot({source});
  const button=document.getElementById('mp3-btn');
  const status=document.getElementById('mp3-status');
  assert.equal(button.disabled,undefined);
  await button.dispatch('click');
  assert.equal(button.disabled,false);
  assert.equal(button.textContent,'↓ 导出 MP3');
  assert.match(status.textContent,/不支持离线音频渲染/);
  assert.equal(els.source.value,source);
  assert.equal(state.playing,false);
});

test('fresh editor defaults to all checked piano options and synthesized piano',()=>{
  const {state,els,document}=boot();
  for(const [id,key] of [['piano-audition','pianoAudition'],
    ['piano-transpose','pianoTranspose'],['piano-continuous','pianoContinuous']]){
    assert.equal(state[key],true,id);
    assert.equal(document.getElementById(id).checked,true,id);
    assert.match(read('index.html'),new RegExp('id="'+id+'"[^>]*checked'));
  }
  assert.equal(state.timbre,'piano');
  assert.equal(els.timbre.value,'piano');
  const saved=boot({source:'.Voice\n1',pianoAudition:false,
    pianoTranspose:false,pianoContinuous:false,timbre:'sine'});
  for(const key of ['pianoAudition','pianoTranspose','pianoContinuous'])
    assert.equal(saved.state[key],false,key+' persists');
  assert.equal(saved.state.timbre,'sine');
});

test('raw input wraps display without altering source newlines or recording content',()=>{
  const original='.Voice\n'+'1_ y40 '.repeat(120)+'\n.Words\n今/天';
  const {state,els}=boot({source:original});
  assert.equal(els.source.value,original);
  assert.equal(state.song.raw,original);
  assert.match(read('index.html'),/<textarea id="source" wrap="soft"/);
  const css=read('styles.css');
  assert.match(css,/#source\{white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;overflow-x:hidden\}/);
  assert.equal(els.source.value.split('\n').length,4);
});

test('extension dash distance adjusts only the dash start, supports signed values and persists',()=>{
  const source='.Title\nKeyAndMeters = {1=C,3/4}\n.Voice\n3-- 4 5-';
  const {state,els,localStorage}=boot({source});
  const notes=()=>scoreLine(els).children.filter(x=>x.className==='note-click');
  const numeral=group=>Number(group.children.find(x=>x.className==='note-num').attrs.x);
  const firstLine=group=>group.children.find(x=>x.tag==='line'&&x.className==='rhythm'&&x.attrs.x1!==undefined);
  const base=Number(firstLine(notes()[0]).attrs.x1)-numeral(notes()[0]);
  assert.equal(state.format.dashNoteGap,0);
  assert.equal(field(els,'dashNoteGap').min,'-25');
  const slider=field(els,'dashNoteGap');
  slider.value='25';slider.dispatch('input');
  assert.equal(Number(firstLine(notes()[0]).attrs.x1)-numeral(notes()[0]),base+25);
  assert.equal(Number(firstLine(notes()[2]).attrs.x1)-numeral(notes()[2]),base+25);
  assert.equal(notes()[1].children.filter(x=>x.tag==='line').length,0);
  assert.equal(state.format.dashNoteGap,25);
  assert.equal(JSON.parse(localStorage.data['sanpu.editor.v1']).format.dashNoteGap,25);
  const numeric=field(els,'dashNoteGap','-value');numeric.value='-12';numeric.dispatch('change');
  assert.equal(Number(firstLine(notes()[0]).attrs.x1)-numeral(notes()[0]),base-12);
  assert.equal(state.format.dashNoteGap,-12);
  assert.equal(els.source.value,source);
});



test('all 36 keyboard mappings activate only while a score note has focus',()=>{
  const {state,document,window,els}=boot({source:'.Title\nKeyAndMeters = {1=C,3/4}\n.Voice\n1'});
  const piano=document.getElementById('piano-keys');
  const keys=['q2w3er5t6y7u','zsxdcvgbhnjm',',l.;/i9o0p-['].join('');
  const codeFor=ch=>/^[a-z]$/.test(ch)?'Key'+ch.toUpperCase():
    /^[0-9]$/.test(ch)?'Digit'+ch:
    ({',':'Comma','.':'Period',';':'Semicolon','/':'Slash','-':'Minus','[':'BracketLeft'}[ch]);
  const send=(type,code,stamp,more={})=>{
    const ev={code,timeStamp:stamp,preventDefault(){ev.prevented=true},...more};
    document.dispatch(type,ev);return ev;
  };
  const pianoKey=i=>piano.children.find(key=>key.dataset.midi===String(48+i));
  assert.equal(piano.children.length,36);
  assert.equal(document.getElementById('piano-keyboard-mode'),null);
  assert.equal(els.source.disabled,undefined);
  assert.equal(send('keydown','KeyQ',100).prevented,undefined,'not active before note click');
  const first=els.score.querySelectorAll('.note-click')[0];
  first.dispatch('click');
  assert.equal(document.activeElement,first,'note click focuses score, not source');
  for(let i=0;i<keys.length;i++){
    const code=codeFor(keys[i]),ev=send('keydown',code,250+i*1200);
    assert.equal(ev.prevented,true,keys[i]+' must be handled');
    assert.equal(pianoKey(i).classList.contains('is-pressed'),true);
    send('keyup',code,280+i*1200);
    assert.equal(pianoKey(i).classList.contains('is-pressed'),false);
  }
  send('keydown','KeyQ',50000,{repeat:true});
  assert.equal(pianoKey(0).classList.contains('is-pressed'),false);
  send('keydown','KeyQ',50050);
  window.dispatch('blur');
  assert.equal(pianoKey(0).classList.contains('is-pressed'),false);
  els.source.focus();
  assert.equal(send('keydown','KeyQ',50200).prevented,undefined);
  assert.equal(state.backspacePrevious,true);
});

test('SVG renders the mapped pitches in real staggered QWERTY physical keyboard positions',()=>{
  const source='.Title\nKeyAndMeters = {1=G,3/4}\n.Voice\n1';
  const {document,els,state,refresh}=boot({source,keyboardMode:true});
  const figure=()=>document.getElementById('piano-keyboard-diagram').children[0];
  const mapped=()=>figure().children.filter(group=>group.className?.startsWith('keyboard-map-cell'));
  const unused=()=>figure().children.filter(group=>group.className==='keyboard-map-unused');
  const named=letter=>mapped().find(group=>group.attrs['data-key']===letter);
  const unbound=letter=>unused().find(group=>group.attrs['data-key']===letter);
  const x=group=>Number(group.children[0].attrs.x);
  const y=group=>Number(group.children[0].attrs.y);
  assert.equal(figure().tag,'svg');
  assert.equal(figure().attrs.viewBox,'0 0 1199 472');
  assert.equal(mapped().length,36,'all 36 keys remain represented');
  assert.ok(unused().length>=8,'unbound keyboard keys remain visibly in place');
  // The keyboard must be physically ordered, not sorted by rising MIDI pitch.
  assert.equal(mapped().slice(0,7).map(group=>group.attrs['data-key']).join(''),'2356790');
  assert.equal(mapped().map(g=>g.attrs['data-midi']).length,36);
  assert.deepEqual(mapped().map(g=>Number(g.attrs['data-midi'])).sort((a,b)=>a-b),
    Array.from({length:36},(_,i)=>48+i));
  assert.equal(named('q').attrs['data-midi'],'48');
  assert.equal(named('z').attrs['data-midi'],'60');
  assert.equal(named(',').attrs['data-midi'],'72');
  assert.equal(named('[').attrs['data-midi'],'83');
  assert.equal(named('9').attrs['data-midi'],'78');
  assert.ok(unbound('1'),'digit row shows unused 1 key');
  assert.ok(unbound('a'),'ASDF row shows unused A key');
  assert.ok(unbound('=')&&unbound(']'),'unused punctuation keycaps remain visible');
  assert.ok(unbound('Tab')&&unbound('Shift'));
  assert.ok(figure().children.some(g=>g.className==='keyboard-map-command'&&g.attrs['data-key']==='Backspace'));
  assert.ok(figure().children.some(g=>g.className==='keyboard-map-command'&&g.attrs['data-key']==='Space'));
  assert.equal(y(named('2')),50);
  assert.equal(y(named('q')),130);
  assert.equal(y(named('s')),210);
  assert.equal(y(named('z')),290);
  // Standard keyboard row stagger: number < QWERTY < ASDF < ZXCV.
  assert.ok(x(unbound('1'))<x(named('q')));
  assert.ok(x(named('q'))<x(unbound('a')));
  assert.ok(x(unbound('a'))<x(named('z')));
  // Physical neighbors stay neighbors, even if note values are far apart.
  assert.equal(x(named('3'))-x(named('2')),77);
  assert.equal(x(named('w'))-x(named('q')),77);
  assert.equal(x(named('x'))-x(named('z')),77);
  assert.ok(x(named('9'))>x(named('i')),'digit 9 is farther right than I');
  assert.equal(named('q').children[1].textContent,'Q');
  assert.equal(named('q').children[2].textContent,'C3 → G3');
  assert.equal(named('q').children[3].textContent,'简谱 1,');
  const transpose=document.getElementById('piano-transpose');
  transpose.checked=false;transpose.dispatch('change');
  assert.equal(named('q').children[2].textContent,'C3');
  assert.notEqual(named('q').children[3].textContent,'简谱 1,');
  transpose.checked=true;transpose.dispatch('change');
  els.source.value=source.replace('1=G','1=D');refresh();
  assert.equal(state.song.key,'D');
  assert.equal(named('q').children[2].textContent,'C3 → D3');
  assert.equal(named('q').children[3].textContent,'简谱 1,');
  assert.match(read('index.html'),/真实电脑键盘/);
  assert.match(read('styles.css'),/\.keyboard-map-unused/);
});

test('SVG piano keycap highlight follows keyboard down/up and mouse piano key presses',()=>{
  const {document,els}=boot({keyboardMode:true});
  const getSvgKey=code=>document.getElementById('piano-keyboard-diagram').children[0].children
    .find(item=>item.className?.startsWith('keyboard-map-cell')&&item.attrs['data-key']===code);
  const key=getSvgKey('q');
  const physical=els.pianoKeys.children.find(k=>k.dataset.midi==='48');
  assert.equal(key.classList.contains('is-pressed'),false);
  document.dispatch('keydown',{code:'KeyQ',timeStamp:100,preventDefault(){}});
  assert.equal(physical.classList.contains('is-pressed'),true);
  assert.equal(key.classList.contains('is-pressed'),true);
  document.dispatch('keyup',{code:'KeyQ',timeStamp:230,preventDefault(){}});
  assert.equal(physical.classList.contains('is-pressed'),false);
  assert.equal(key.classList.contains('is-pressed'),false);
  physical.dispatch('pointerdown',{type:'pointerdown',button:0,timeStamp:400});
  assert.equal(key.classList.contains('is-pressed'),true);
  physical.dispatch('pointerup',{type:'pointerup',timeStamp:550});
  assert.equal(key.classList.contains('is-pressed'),false);
});
test('computer piano keys record notes while text fields and shortcuts do not trigger sound',()=>{
  const source='.Title\nKeyAndMeters = {1=C,3/4}\n.Voice\n1';
  const {document,els,state}=boot({source,keyboardMode:true,pianoAudition:false,
    pianoContinuous:false,pianoTranspose:false,tempo:120});
  const c3=document.getElementById('piano-keys').children.find(x=>x.dataset.midi==='48');
  const input=els.source;input.tag='textarea';
  document.dispatch('keydown',{code:'KeyQ',key:'q',timeStamp:100,target:input});
  assert.equal(c3.classList.contains('is-pressed'),false);
  document.dispatch('keydown',{code:'KeyQ',key:'q',timeStamp:200,ctrlKey:true});
  assert.equal(c3.classList.contains('is-pressed'),false);
  document.dispatch('keydown',{code:'KeyQ',key:'q',timeStamp:500,preventDefault(){}});
  assert.equal(c3.classList.contains('is-pressed'),true);
  document.dispatch('keyup',{code:'KeyQ',key:'q',timeStamp:1000,target:input,preventDefault(){}});
  assert.equal(c3.classList.contains('is-pressed'),false);
  assert.equal(state.song.notes.length,2);
  assert.notEqual(els.source.value,source);
  assert.equal(state.song.notes[1].beats,1);
  assert.equal(input.disabled,undefined);
});

test('playback loop input persists 0, positive integer and -1 without affecting MP3 export',()=>{
  const {state,els,document,localStorage}=boot({loopCount:0});
  const input=document.getElementById('loop-count');
  assert.equal(input.value,'0');
  assert.equal(state.loopCount,0);
  input.value='3';input.dispatch('change');
  assert.equal(state.loopCount,3);
  assert.equal(JSON.parse(localStorage.data['sanpu.editor.v1']).loopCount,3);
  input.value='-1';input.dispatch('change');
  assert.equal(state.loopCount,-1);
  input.value='-2';input.dispatch('change');
  assert.equal(input.value,'-1');
  assert.equal(state.loopCount,-1);
  input.value='2.5';input.dispatch('change');
  assert.equal(input.value,'-1');
  input.value='';input.dispatch('change');
  assert.equal(input.value,'-1');
  input.value='0';input.dispatch('change');
  assert.equal(state.loopCount,0);
  assert.equal(boot({loopCount:2}).state.loopCount,2);
  assert.equal(boot({loopCount:-1}).state.loopCount,-1);
  assert.equal(boot({loopCount:-42}).state.loopCount,0);
  assert.match(read('index.html'),/id="loop-count".*value="0"/);
  assert.ok(els.score.children.length>0);
});

test('finite and infinite loop playback restart on the audio timeline, pause retains count and stop cancels',async()=>{
  const src='.Title\nKeyAndMeters = {1=C,3/4}\n.Voice\n1 2';
  const app=boot({source:src,tempo:60,loopCount:2});
  const {state,els,document,fireFrame}=app;
  const starts=[];
  const audio={
    currentTime:0,destination:{},resume:async()=>{},
    createPeriodicWave(){return {};},
    createOscillator(){
      return {frequency:{setValueAtTime(){}},setPeriodicWave(){},connect(){},
        start(t){starts.push(t)},stop(){},disconnect(){}};
    },
    createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(){},
      exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};}
  };
  state.audio=audio;
  els.play.dispatch('click');await Promise.resolve();
  assert.equal(state.playing,true);
  assert.equal(state.total,2);
  assert.deepEqual(starts,[0,1]);
  audio.currentTime=2.01;fireFrame();
  assert.equal(state.loopsDone,1);
  assert.equal(state.playing,true);
  assert.deepEqual(starts.slice(-2),[2.01,3]);
  audio.currentTime=2.25;
  els.play.dispatch('click');
  assert.equal(state.playing,false);
  assert.equal(state.loopsDone,1);
  els.play.dispatch('click');await Promise.resolve();
  assert.equal(state.playing,true);
  assert.equal(state.loopsDone,1);
  audio.currentTime=4.25;fireFrame();
  assert.equal(state.loopsDone,2);
  assert.equal(state.playing,true);
  audio.currentTime=6.26;fireFrame();
  assert.equal(state.playing,false);
  assert.equal(state.loopsDone,0);
  assert.equal(els.play.textContent,'▶ 播放');
  const forever=boot({source:src,tempo:60,loopCount:-1});
  const f=forever;
  f.state.audio={...audio,currentTime:0};
  f.els.play.dispatch('click');await Promise.resolve();
  f.state.audio.currentTime=40;f.fireFrame();
  assert.equal(f.state.playing,true);
  assert.equal(f.state.loopsDone,20);
  f.els.stop.dispatch('click');
  assert.equal(f.state.playing,false);
  assert.equal(f.state.loopsDone,0);
});

test('batch edit applies signed semitone shift only after explicit confirmation',()=>{
  const source='.Title\nTitle = A\nKeyAndMeters = {1=C,3/4}\n.Voice\n(1_ 2_ 3) y25 | 0 7,\n.Words\nW1@1,1:\n唱/歌曲';
  const abandoned=boot({source},false);
  const b=abandoned.document.getElementById('batch-shift'),apply=abandoned.document.getElementById('batch-apply');
  assert.equal(b.value,'');
  assert.match(read('index.html'),/id="batch-shift"[^>]*value="0"/);
  b.value='2';apply.dispatch('click');
  assert.equal(abandoned.els.source.value,source);
  assert.match(abandoned.document.getElementById('batch-status').textContent,/已取消/);
  const accepted=boot({source},true);
  const input=accepted.document.getElementById('batch-shift'),btn=accepted.document.getElementById('batch-apply');
  input.value='-1';btn.dispatch('click');
  assert.notEqual(accepted.els.source.value,source);
  assert.equal(accepted.state.song.notes.length,5);
  assert.equal(accepted.state.song.notes[3].raw,'0');
  assert.equal(accepted.state.song.slurs.length,1);
  assert.equal(accepted.els.source.value.split('.Words')[1],source.split('.Words')[1]);
  assert.equal(JSON.parse(accepted.localStorage.data['sanpu.editor.v1']).source,accepted.els.source.value);
  assert.equal(accepted.confirmations.length,1);
  const saved=accepted.els.source.value;
  input.value='0';btn.dispatch('click');
  assert.equal(accepted.els.source.value,saved);
  input.value='1.5';btn.dispatch('click');
  assert.equal(accepted.els.source.value,saved);
  assert.match(accepted.document.getElementById('batch-status').textContent,/整数/);
  input.value='100';btn.dispatch('click');
  assert.equal(accepted.els.source.value,saved);
  assert.equal(accepted.confirmations.length,1,'out-of-range changes must not be confirmed or applied');
  assert.match(read('index.html'),/class="batch-editor"[\s\S]*?class="syntax-help"/);
});

test('batch edit keeps source editable even after score keyboard input was enabled',()=>{
  const source='.Title\nKeyAndMeters = {1=C,3/4}\n.Voice\n1 2';
  const user=boot({source,keyboardMode:true},true);
  assert.equal(user.els.source.disabled,undefined);
  user.document.getElementById('batch-shift').value='1';
  user.document.getElementById('batch-apply').dispatch('click');
  assert.equal(user.els.source.disabled,undefined);
  assert.deepEqual(user.state.song.notes.map(n=>n.raw),['#1','b3']);
});

test('Space and Enter in keyboard mode divide a measure and add a new system',()=>{
  const source='.Title\nKeyAndMeters = {1=C,3/4}\n.Voice\n1\n.Words\nW1@1,1:\n你';
  const {document,els,state}=boot({source,keyboardMode:true,pianoAudition:false,
    pianoContinuous:false,pianoTranspose:false,tempo:120});
  const press=(code,time,span=60)=>{
    const keydown={code,timeStamp:time,preventDefault(){keydown.prevented=true}};
    document.dispatch('keydown',keydown);
    const keyup={code,timeStamp:time+span,preventDefault(){keyup.prevented=true}};
    document.dispatch('keyup',keyup);
    return {keydown,keyup};
  };
  const space=press('Space',100);
  assert.equal(space.keydown.prevented,true);
  assert.equal(space.keyup.prevented,true);
  assert.equal(state.song.elements.filter(x=>x.kind==='bar').length,1);
  const enter=press('Enter',200);
  assert.equal(enter.keydown.prevented,true);
  assert.equal(enter.keyup.prevented,true);
  assert.equal(state.song.elements.filter(x=>x.kind==='break').length,1);
  press('KeyQ',300,500);
  assert.deepEqual(state.song.notes.map(n=>n.raw),['1','1,']);
  assert.equal(state.song.notes[1].measure,2);
  assert.equal(state.song.notes[1].row,1);
  assert.match(els.source.value,/1\s+\|\s+\$\(true\)\s+1,/);
  assert.equal(els.source.value.split('.Words')[1],source.split('.Words')[1]);
  assert.equal(state.song.warnings.length,0);
  assert.equal(els.source.disabled,undefined);
});

test('Backquote and logical middle dot insert a silent timed rest',()=>{
  const source='.Title\nKeyAndMeters = {1=C,3/4}\n.Voice\n1';
  const {document,state,els}=boot({source,keyboardMode:true,pianoAudition:true,
    pianoContinuous:false,tempo:120});
  const getRestKey=()=>document.getElementById('piano-keyboard-diagram').children[0].children
    .find(el=>el.attrs['data-key']===String.fromCharCode(96));
  const firstDown={code:'Backquote',key:'·',timeStamp:100,preventDefault(){firstDown.prevented=true}};
  document.dispatch('keydown',firstDown);
  assert.equal(firstDown.prevented,true);
  assert.equal(getRestKey().classList.contains('is-pressed'),true);
  assert.equal(state.song.notes.length,1,'ordinary rest is inserted on key release');
  const firstUp={code:'Backquote',key:'·',timeStamp:1100,preventDefault(){firstUp.prevented=true}};
  document.dispatch('keyup',firstUp);
  assert.equal(firstUp.prevented,true);
  assert.deepEqual(state.song.notes.map(n=>n.raw),['1','0-']);
  assert.equal(state.song.notes[1].beats,2);
  assert.equal(getRestKey().classList.contains('is-pressed'),false);
  // Keyboards and IMEs that report a centered dot as the logical key work too.
  document.dispatch('keydown',{key:'·',timeStamp:1200,preventDefault(){}});
  document.dispatch('keyup',{key:'·',timeStamp:1450,preventDefault(){}});
  assert.deepEqual(state.song.notes.map(n=>n.raw),['1','0-','0_']);
  assert.match(els.source.value,/0-\s+0_/);
});

test('rest and pitched notes share continuous onset-interval rhythm and final held-duration logic',()=>{
  const source='.Title\nKeyAndMeters = {1=C,3/4}\n.Voice\n1';
  const {document,els,state,timers,fireTimer}=boot({source,keyboardMode:true,
    pianoAudition:false,pianoContinuous:true,pianoTranspose:false,tempo:120});
  const down=(code,time)=>document.dispatch('keydown',{code,timeStamp:time,preventDefault(){}});
  const up=(code,time)=>document.dispatch('keyup',{code,timeStamp:time,preventDefault(){}});
  down('Backquote',100);
  assert.deepEqual(state.song.notes.map(n=>n.raw),['1','0-']);
  const restSVG=()=>document.getElementById('piano-keyboard-diagram').children[0].children
    .find(el=>el.attrs['data-key']===String.fromCharCode(96));
  assert.equal(restSVG().classList.contains('is-pressed'),true);
  up('Backquote',190);
  assert.equal(restSVG().classList.contains('is-pressed'),false);
  down('KeyQ',600);
  assert.equal(state.song.notes[1].raw,'0');
  assert.equal(state.song.notes[1].beats,1);
  assert.equal(state.song.notes[2].raw,'1,-');
  up('KeyQ',720);
  const pending=[...timers.keys()].at(-1);
  assert.ok(pending!==undefined);
  fireTimer(pending);
  assert.equal(state.song.notes[2].raw,'1,__');
});

test('keyboard shortcut modifiers, repeat, edit targets and disabled keyboard mode do not insert markers',()=>{
  const source='.Title\nKeyAndMeters = {1=C,3/4}\n.Voice\n1';
  const {document,els,state,window}=boot({source,keyboardMode:true,pianoContinuous:false});
  const src=els.source;src.tag='textarea';
  const send=(code,more={})=>document.dispatch('keydown',{code,timeStamp:100,preventDefault(){},...more});
  send('Space',{target:src});
  send('Enter',{target:src});
  send('Backquote',{target:src});
  send('Space',{ctrlKey:true});
  send('Enter',{altKey:true});
  send('Backquote',{metaKey:true});
  send('Space',{repeat:true});
  send('Backquote',{isComposing:true});
  assert.equal(els.source.value,source);
  window.dispatch('blur');
  els.source.focus(); // leaving the score disables keyboard shortcuts
  send('Space');send('Enter');send('Backquote');
  assert.equal(els.source.value,source);
  assert.equal(state.song.notes.length,1);
});

test('score type selector persists and staff / guitar views draw from the same source',()=>{
  const source='.Title\nTitle = Variants\nKeyAndMeters = {1=D,3/4}\n.Voice\n1 2_ | 3 0 5- $(true)\n6 7\n.Words\nW1@1,1:\n你好吗朋友啊';
  const app=boot({source,scoreType:'jianpu'}),{document,els,state,localStorage}=app;
  const type=document.getElementById('score-type');
  assert.equal(type.value,'jianpu');
  assert.equal(state.scoreType,'jianpu');
  const original=els.source.value;
  const notes=state.song.notes.map(n=>n.raw);
  const lines=()=>els.score.children.filter(node=>node.tag==='svg');
  type.value='staff';type.dispatch('change');
  assert.equal(state.scoreType,'staff');
  assert.equal(lines().length,2);
  assert.equal(lines()[0].className,'score-line score-staff');
  assert.equal(lines()[0].children.filter(node=>node.className==='alt-staff-line').length,11);
  assert.ok(lines()[0].children.some(node=>node.className==='alt-clef'&&node.textContent==='𝄞'));
  assert.ok(lines()[0].children.some(node=>node.className==='alt-clef alt-bass-clef'));
  assert.ok(lines()[0].children.some(node=>node.className==='bar-click'));
  assert.ok(lines()[0].children.some(node=>node.className==='note-click'));
  assert.equal(els.source.value,original);
  assert.equal(JSON.parse(localStorage.data['sanpu.editor.v1']).scoreType,'staff');
  type.value='guitar';type.dispatch('change');
  assert.equal(lines()[0].className,'score-line score-guitar');
  assert.equal(lines()[0].children.filter(node=>node.className==='alt-staff-line alt-tab-line').length,6);
  assert.ok(lines()[0].children.some(node=>node.className==='alt-tab-label'));
  assert.ok(lines()[0].children.some(node=>node.className==='note-click'
    &&node.children.some(c=>c.className==='alt-fret')));
  assert.equal(els.source.value,original);
  assert.deepEqual(state.song.notes.map(n=>n.raw),notes);
  assert.equal(JSON.parse(localStorage.data['sanpu.editor.v1']).scoreType,'guitar');
  type.value='jianpu';type.dispatch('change');
  assert.equal(lines()[0].className,'score-line');
  assert.equal(boot({scoreType:'guitar'}).state.scoreType,'guitar');
  assert.equal(boot({scoreType:'unrecognized'}).state.scoreType,'jianpu');
  assert.match(read('index.html'),/value="staff">五线谱/);
  assert.match(read('index.html'),/value="guitar">吉他指弹谱/);
});

test('barline can be selected on screen and removed with Backspace, without touching lyrics',()=>{
  const source='.Title\nKeyAndMeters = {1=C,3/4}\n.Voice\n1 | 2\n.Words\nW1@1,1:\n你好';
  const {els,document,state}=boot({source,keyboardMode:true,pianoAudition:false,backspacePrevious:false});
  const bar=els.score.querySelectorAll('.bar-click')[0];
  assert.ok(bar,'SVG must expose interactive barlines');
  bar.dispatch('click');
  assert.deepEqual(state.selectedItem,{kind:'bar',index:0});
  assert.equal(bar.classList.contains('active'),true);
  const before=els.source.value;
  const press={code:'Backspace',timeStamp:100,preventDefault(){press.prevented=true}};
  document.dispatch('keydown',press);
  assert.equal(press.prevented,true);
  assert.equal(state.song.elements.filter(e=>e.kind==='bar').length,0);
  assert.deepEqual(state.song.notes.map(n=>n.raw),['1','2']);
  assert.equal(els.source.value.split('.Words')[1],before.split('.Words')[1]);
  document.dispatch('keyup',{code:'Backspace',timeStamp:120,preventDefault(){}});
});

test('Backspace after keyboard-entered barline or system break deletes that exact marker',()=>{
  const source='.Title\nKeyAndMeters = {1=C,3/4}\n.Voice\n1';
  const {els,state,document}=boot({source,keyboardMode:true,pianoAudition:false,pianoContinuous:false,backspacePrevious:false});
  const send=(type,code,t)=>document.dispatch(type,{code,timeStamp:t,preventDefault(){}});
  send('keydown','Space',100);send('keyup','Space',200);
  assert.equal(state.song.elements.filter(e=>e.kind==='bar').length,1);
  assert.equal(state.selectedItem.kind,'bar');
  send('keydown','Backspace',300);send('keyup','Backspace',340);
  assert.equal(state.song.elements.filter(e=>e.kind==='bar').length,0);
  send('keydown','Enter',400);send('keyup','Enter',440);
  assert.equal(state.song.elements.filter(e=>e.kind==='break').length,1);
  assert.equal(state.selectedItem.kind,'break');
  send('keydown','Backspace',470);send('keyup','Backspace',490);
  assert.equal(state.song.elements.filter(e=>e.kind==='break').length,0);
  assert.deepEqual(state.song.notes.map(n=>n.raw),['1']);
  assert.equal(els.source.disabled,undefined);
});

test('five-line and guitar score variants both allow selecting a note or bar',()=>{
  const source='.Title\nKeyAndMeters = {1=C,3/4}\n.Voice\n1 | 2';
  for(const type of ['staff','guitar']){
    const {els,document,state}=boot({source,scoreType:type,pianoAudition:false,keyboardMode:true,backspacePrevious:false});
    const bar=els.score.querySelectorAll('.bar-click')[0];
    assert.ok(bar);
    bar.dispatch('click');
    assert.equal(state.selectedItem.kind,'bar');
    const note=els.score.querySelectorAll('.note-click')[0];
    note.dispatch('click');
    assert.deepEqual(state.selectedItem,{kind:'note',index:0});
    document.dispatch('keydown',{code:'Backspace',timeStamp:200,preventDefault(){}});
    assert.deepEqual(state.song.notes.map(n=>n.raw),['2']);
    assert.equal(state.song.elements.filter(e=>e.kind==='bar').length,1);
  }
});

test('six-string fingerstyle TAB has correct standard-tuning string/fret choices and flags unplayable notes',()=>{
  const source=".Title\nKeyAndMeters = {1=C,3/4}\n.Voice\n1, 1 1' 1'''";
  const {state,els}=boot({source,scoreType:'guitar'});
  assert.equal(state.scoreType,'guitar');
  const line=els.score.children.find(e=>e.className==='score-line score-guitar');
  const notes=line.children.filter(g=>g.className==='note-click');
  assert.equal(notes.length,4);
  const digit=i=>notes[i].children.find(c=>c.className==='alt-fret');
  assert.equal(digit(0).textContent,'3','C3 is A string fret 3');
  assert.equal(digit(0).attrs.y,'178');
  assert.equal(digit(1).textContent,'1','C4 is B string fret 1');
  assert.equal(digit(1).attrs.y,'109');
  assert.equal(digit(2).textContent,'8','C5 is high E string fret 8');
  assert.equal(digit(2).attrs.y,'86');
  assert.ok(notes[3].children.some(c=>c.className==='alt-unplayable'&&c.textContent==='×'),
    'C7 exceeds the standard-guitar 20-fret limit');
  assert.deepEqual(state.song.notes.map(n=>n.raw),['1,','1',"1'","1'''"]);
});

test('grand staff draws major-key accidentals, a 32nd-note flag, and silence separately',()=>{
  const source='.Title\nKeyAndMeters = {1=D,3/4}\n.Voice\n3  b3  1___ 0';
  const {state,els}=boot({source,scoreType:'staff'});
  const line=els.score.children.find(e=>e.className==='score-line score-staff');
  const notes=line.children.filter(e=>e.className==='note-click');
  assert.equal(notes.length,4);
  const symbols=i=>notes[i].children.filter(e=>e.className==='alt-accidental').map(e=>e.textContent);
  assert.deepEqual(symbols(0),[],'F sharp is in the D-major key signature');
  assert.deepEqual(symbols(1),['♮'],'flat-third of D is F natural, so a natural sign is required');
  assert.equal(notes[2].children.filter(e=>e.className==='alt-flag').length,3,
    'one eighth of a beat is a 32nd note requiring three flags');
  assert.ok(notes[3].children.some(e=>e.className==='alt-rest'),'rest does not receive a pitched notehead');
  assert.deepEqual(state.song.notes.map(n=>n.raw),['3','b3','1___','0']);
});

test('HTML contains one unambiguous score-type dropdown and no duplicated picker',()=>{
  const html=read('index.html');
  assert.equal((html.match(/id="score-type"/g)||[]).length,1);
  assert.equal((html.match(/class="score-type-picker"/g)||[]).length,1);
  assert.ok(html.includes('value="jianpu" selected>简谱'));
});

test('changing score type disables keyboard shortcuts until another score click',()=>{
  const source='.Title\nKeyAndMeters = {1=C,3/4}\n.Voice\n1';
  const {document,els,state}=boot({source,keyboardMode:true,pianoAudition:false,pianoContinuous:false});
  const picker=document.getElementById('score-type');
  picker.focus();
  picker.value='staff';picker.dispatch('change');
  assert.equal(state.scoreType,'staff');
  const press=(code,ts)=>document.dispatch('keydown',{code,timeStamp:ts,preventDefault(){}});
  press('Space',100);
  assert.equal(state.song.elements.filter(x=>x.kind==='bar').length,0);
  els.score.querySelectorAll('.note-click')[0].dispatch('click');
  press('Space',200);
  assert.equal(state.song.elements.filter(x=>x.kind==='bar').length,1);
});

test('custom lyrics sizing stays under the original appearance configuration on alternate scores',()=>{
  const styles=read('styles.css');
  assert.doesNotMatch(styles,/score-staff \.lyrics-text,.score-page \.score-guitar \.lyrics-text\{font-size:30px/);
  const source='.Title\nKeyAndMeters = {1=C,3/4}\n.Voice\n1';
  const {document,els,state}=boot({source,scoreType:'staff'});
  assert.equal(state.scoreType,'staff');
  assert.ok(els.score.style.props['--lyric-size'],'font size variable still exists');
  const original=els.score.style.props['--lyric-size'];
  assert.equal(original,state.format.lyricSize+'px');
  const sel=document.getElementById('score-type');
  sel.value='guitar';sel.dispatch('change');
  assert.equal(els.score.style.props['--lyric-size'],original);
  sel.value='jianpu';sel.dispatch('change');
  assert.equal(els.score.style.props['--lyric-size'],original);
});

test('numbered notation retains original direct SVG barlines; hitboxes are a separate invisible layer',()=>{
  const source='.Title\nKeyAndMeters = {1=C,3/4}\n.Voice\n1 | 2 $(true)\n3 | 4';
  const {els}=boot({source,scoreType:'jianpu'});
  const systems=els.score.children.filter(n=>n.className==='score-line');
  assert.equal(systems.length,2);
  for(const line of systems){
    const bars=line.children.filter(n=>n.className==='bar');
    const overlay=line.children.filter(n=>n.className==='bar-click');
    assert.equal(bars.length,1);
    assert.equal(overlay.length,1);
    assert.equal(bars[0].tag,'line');
    assert.equal(overlay[0].tag,'g');
    assert.ok(overlay[0].children.every(n=>n.className==='bar-hit'),
      'hitboxes contain no visible replica of the original barline');
    assert.equal(overlay[0].children[0].tag,'rect');
    assert.ok(line.children.indexOf(bars[0])<line.children.indexOf(overlay[0]));
  }
  const css=read('styles.css');
  assert.match(css,/\.score-page \.score-line \.note-num/);
  assert.match(css,/\.score-page \.score-line \.lyrics-text/);
  assert.match(css,/\.score-page \.score-line \.bar\{stroke-width:var\(--bar-stroke/);
  assert.match(read('src/app.mjs'),/if\(state\.scoreType==='jianpu'\)addJianpuBarSelectionTargets/);
});

test('custom numbered-notation typography remains identical through score-type switching',()=>{
  const source='.Title\nTitle = Test\nKeyAndMeters = {1=D,3/4}\n.Voice\n1 | 2';
  const format={titleSize:38,titleWeight:'800',noteSize:50,noteWeight:'700',
    noteFont:'sans',lyricSize:51,lyricWeight:'400',lyricFont:'kai',
    lyricLetterSpacing:-4,barSpacing:24,barStroke:2.9,minLineWidth:980};
  const {els,state,document}=boot({source,format,scoreType:'jianpu'});
  const getVariables=()=>JSON.stringify(els.score.style.props);
  const initial=getVariables();
  assert.equal(state.format.lyricSize,51);
  assert.equal(state.format.noteSize,50);
  assert.equal(els.score.style.props['--lyric-size'],'51px');
  assert.equal(els.score.style.props['--note-size'],'50px');
  const svgBefore=els.score.children.find(x=>x.className==='score-line');
  const baselineNote=svgBefore.children.find(x=>x.className==='note-click').children
    .find(x=>x.className==='note-num');
  const baselinePosition=JSON.stringify(baselineNote.attrs);
  const baselineBar=svgBefore.children.find(x=>x.className==='bar');
  const baselineBarPosition=JSON.stringify(baselineBar.attrs);
  const type=document.getElementById('score-type');
  for(const value of ['staff','guitar','jianpu']){
    type.value=value;type.dispatch('change');
    assert.equal(getVariables(),initial,'custom appearance variables remain unchanged');
    assert.equal(state.format.lyricSize,51);
  }
  const after=els.score.children.find(x=>x.className==='score-line');
  const laterNote=after.children.find(x=>x.className==='note-click').children
    .find(x=>x.className==='note-num');
  const laterBar=after.children.find(x=>x.className==='bar');
  assert.equal(JSON.stringify(laterNote.attrs),baselinePosition);
  assert.equal(JSON.stringify(laterBar.attrs),baselineBarPosition);
  assert.equal(els.source.value,source);
});

test('immutable pre-multi-score numbered rendering and CSS baseline',()=>{
  // Snapshot source: main commit 2c87a0f77b66e593afcac48cccea2753c8bdef14,
  // before staff/TAB and barline-selection edits. Any change to these checksums
  // needs intentional user approval: numbered notation appearance is frozen.
  const fnv32=text=>{
    let h=0x811c9dc5;
    for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),0x01000193)>>>0;
    return h.toString(16).padStart(8,'0');
  };
  const app=read('src/app.mjs');
  const first=app.indexOf('function drawSystem(elements,song,width){');
  const last=app.indexOf('// Do not modify drawSystem',first);
  assert.ok(first>=0&&last>first);
  const renderer=app.slice(first,last);
  assert.equal(renderer.length,5623,'original numbered-notation SVG renderer length');
  assert.equal(fnv32(renderer),'90f551aa','original numbered-notation SVG renderer must stay byte-identical');
  const sheet=read('styles.css');
  const baseline=sheet.slice(0,30806);
  assert.equal(baseline.length,30806);
  assert.equal(fnv32(baseline),'351f9ede','original numbered-notation CSS must stay byte-identical');
  assert.equal(sheet.slice(0,30806),baseline);
});

test('jianpu bar hitboxes remain paint-invisible and within bar cells at extreme sizes',()=>{
  const source=['.Title','KeyAndMeters = {1=C,3/4}', '.Voice',
    "1 | 7' $(true)",'3, | 4'].join(String.fromCharCode(10));
  for(const format of [
    {noteSize:50,lyricSize:51,barSpacing:24,lyricOffset:3},
    {noteSize:24,lyricSize:14,barSpacing:16,lyricOffset:-70,systemGap:-100},
    {noteSize:80,lyricSize:65,barSpacing:90,lyricOffset:110,systemGap:120,
      highOctaveDotOffset:80,lowOctaveDotOffset:80}
  ]){
    const {state,els,document}=boot({source,format,scoreType:'jianpu',
      keyboardMode:true,pianoAudition:false,backspacePrevious:false});
    const systems=els.score.children.filter(node=>node.className==='score-line');
    assert.equal(systems.length,2);
    for(const system of systems){
      const line=system.children.find(node=>node.className==='bar');
      const group=system.children.find(node=>node.className==='bar-click');
      assert.ok(line && group,'each original SVG bar has a separate hitbox');
      const rect=group.children[0];
      assert.equal(rect.tag,'rect');
      assert.equal(rect.attrs.fill,'transparent',
        'SVG fallback alone must render nothing without loading CSS');
      assert.equal(rect.attrs.stroke,'none');
      assert.equal(rect.attrs.x,String(Number(line.attrs.x1)-8));
      assert.equal(rect.attrs.width,String(state.format.barSpacing-2));
      const cellLeft=Number(line.attrs.x1)-9;
      const cellRight=cellLeft+state.format.barSpacing;
      const targetLeft=Number(rect.attrs.x),targetRight=targetLeft+Number(rect.attrs.width);
      assert.ok(targetLeft>cellLeft && targetRight<cellRight,
        'hitbox must not obscure preceding or following note targets');
      assert.equal(rect.attrs.y,String(Math.min(Number(line.attrs.y1),Number(line.attrs.y2))-9));
      assert.equal(rect.attrs.height,String(Math.abs(Number(line.attrs.y2)-Number(line.attrs.y1))+18));
      assert.ok(Number(rect.attrs.y)>=0);
      assert.equal(group.children.length,1,'no duplicated visible barlines');
    }
    systems[0].children.find(node=>node.className==='bar-click').dispatch('click');
    assert.deepEqual(state.selectedItem,{kind:'bar',index:0});
    document.dispatch('keydown',{code:'Backspace',timeStamp:100,
      preventDefault(){}});
    assert.deepEqual(state.song.notes.map(n=>n.raw),['1',"7'",'3,','4']);
    assert.equal(state.song.elements.filter(e=>e.kind==='bar').length,1);
  }
  const css=read('styles.css');
  assert.match(css,/\.score-page \.score-line \.bar-click \.bar-hit\s*\{[^}]*fill:transparent!important;[^}]*stroke:none!important/s);
});

test('mouse drag selects a contiguous note range across bar and line break; batch controls follow selection',()=>{
  const source='.Title\nKeyAndMeters = {1=C,3/4}\n.Voice\n1- 2- |$(true)\n3- 4-\n.Words\nW1@1,1:\n甲乙丙丁';
  const {state,els,document,localStorage}=boot({source},true);
  const notes=els.score.querySelectorAll('.note-click');
  const group=notes[0];
  assert.equal(els.batchSlur.disabled,true);
  els.score.dispatch('pointerdown',{button:0,pointerId:7,pointerType:'mouse',
    clientX:10,clientY:10,target:group});
  document.dispatch('pointermove',{pointerId:7,clientX:190,clientY:80,target:notes[3],
    preventDefault(){}});
  document.dispatch('pointerup',{pointerId:7,clientX:190,clientY:80,target:notes[3]});
  assert.deepEqual([...state.selectedNoteIds],[0,1,2,3]);
  assert.equal(state.selectedItem.index,3);
  assert.equal(els.batchSlur.disabled,false);
  assert.equal(document.getElementById('batch-target-label').textContent,'选中音符偏移');
  assert.equal(document.getElementById('batch-rhythm-target').textContent,'选中音符节奏偏移');
  assert.equal(document.getElementById('batch-selection-count').textContent,'已选中 4 个音符');
  assert.equal(els.score.querySelectorAll('.note-click').filter(x=>x.classList.contains('is-selected')).length,4);
  document.getElementById('score-type').value='staff';document.getElementById('score-type').dispatch('change');
  assert.deepEqual([...state.selectedNoteIds],[0,1,2,3],'changing score view must preserve selection');
  const font=field(els,'lyricSize');font.value='52';font.dispatch('input');
  assert.deepEqual([...state.selectedNoteIds],[0,1,2,3],'changing appearance must preserve selection');
  els.batchShift.value='2';els.batchApply.dispatch('click');
  assert.deepEqual(state.song.notes.map(n=>n.raw),['2-','3-','#4-','5-']);
  assert.deepEqual([...state.selectedNoteIds],[0,1,2,3],'batch pitch edit must preserve note selection');
  document.getElementById('batch-rhythm').value='1';
  document.getElementById('batch-rhythm-apply').dispatch('click');
  assert.deepEqual(state.song.notes.map(n=>n.raw),['2.','3.','#4.','5.']);
  assert.equal(els.source.value.split('.Words')[1],source.split('.Words')[1]);
  assert.deepEqual([...state.selectedNoteIds],[0,1,2,3]);
  els.batchSlur.dispatch('click');
  assert.deepEqual(state.song.slurs,[{startId:0,endId:3}]);
  assert.deepEqual([...state.selectedNoteIds],[0,1,2,3]);
  assert.ok(JSON.parse(localStorage.data['sanpu.editor.v1']).source.includes('(2.'));
  document.getElementById('batch-clear').dispatch('click');
  assert.equal(state.selectedNoteIds.size,0);
  assert.equal(state.selectedItem,null);
  assert.equal(els.batchSlur.disabled,true);
  assert.equal(document.getElementById('batch-target-label').textContent,'全谱音程偏移');
});

test('touch long press and drag selects range; a score blank click clears, other controls do not',()=>{
  const source='.Title\nKeyAndMeters = {1=C,3/4}\n.Voice\n1 2 3 4';
  const {els,state,document,timers,fireTimer}=boot({source});
  const notes=els.score.querySelectorAll('.note-click');
  els.score.dispatch('pointerdown',{button:0,pointerId:19,pointerType:'touch',
    clientX:10,clientY:10,target:notes[0]});
  assert.equal(state.selectedNoteIds.size,0,'short touch does not select until long press');
  const timer=[...timers.entries()].find(([,t])=>t.delay===400)?.[0];
  assert.ok(timer,'long press timeout exists');
  fireTimer(timer);
  document.dispatch('pointermove',{pointerId:19,clientX:110,clientY:20,target:notes[2],preventDefault(){}});
  document.dispatch('pointerup',{pointerId:19,clientX:110,clientY:20,target:notes[2]});
  assert.deepEqual([...state.selectedNoteIds],[0,1,2]);
  els.tempo.dispatch('input',{target:{value:'95'}});
  assert.deepEqual([...state.selectedNoteIds],[0,1,2]);
  els.score.dispatch('click',{target:els.score,preventDefault(){},stopPropagation(){}});
  assert.deepEqual([...state.selectedNoteIds],[0,1,2],'synthetic gesture click must be suppressed');
  const reset=[...timers.entries()].find(([,t])=>t.delay===0)?.[0];
  if(reset!==undefined)fireTimer(reset);
  els.score.dispatch('click',{target:els.score});
  assert.equal(state.selectedNoteIds.size,0,'blank canvas click clears explicit selection');
});

test('relative Delete and Backspace process note, bar and system break in source order',()=>{
  const source='.Title\nKeyAndMeters = {1=C,3/4}\n.Voice\n1 |$(true)\n2 3\n.Words\nW1@1,1:\n甲乙丙';
  const {els,state,document,localStorage}=boot({source,pianoAudition:false});
  const send=code=>{
    const ev={code,timeStamp:100,preventDefault(){ev.prevented=true},stopPropagation(){}};
    document.dispatch('keydown',ev);return ev;
  };
  let notes=els.score.querySelectorAll('.note-click');
  notes[1].dispatch('click');
  assert.equal(send('Backspace').prevented,true);
  assert.equal(state.song.elements.filter(x=>x.kind==='break').length,0,
    'Backspace deletes the previous system break before selected note 2');
  assert.deepEqual(state.song.notes.map(n=>n.raw),['1','2','3']);
  assert.equal(send('Delete').prevented,true);
  assert.deepEqual(state.song.notes.map(n=>n.raw),['1','2'],
    'Delete removes the item after the selected note');
  const option=document.getElementById('backspace-previous');
  option.checked=false;option.dispatch('change');
  assert.equal(state.backspacePrevious,false);
  assert.equal(JSON.parse(localStorage.data['sanpu.editor.v1']).backspacePrevious,false);
  assert.equal(send('Backspace').prevented,true);
  assert.deepEqual(state.song.notes.map(n=>n.raw),['1'],
    'with option off, Backspace deletes selected note');
  const bar=els.score.querySelectorAll('.bar-click')[0];
  bar.dispatch('click');
  assert.equal(send('Delete').prevented,true);
  assert.deepEqual(state.song.notes.map(n=>n.raw),['1'],
    'Delete on bar when nothing follows must not delete the previous note');
});

test('signed rhythm batch edit lengthens whole score or selection, keeps state, and handles zero and unrepresentable cases',()=>{
  const source='.Title\nKeyAndMeters = {1=C,3/4}\n.Voice\n1 2_ 0 |$(true)\n3.\n.Words\nW1@1,1:\n甲乙丙丁';
  const {els,state,document,confirmations}=boot({source},true);
  const rhythm=document.getElementById('batch-rhythm'),apply=document.getElementById('batch-rhythm-apply');
  const label=document.getElementById('batch-rhythm-target');
  const html=read('index.html');
  assert.match(html,/id="batch-rhythm"[^>]*step="1"[^>]*value="0"/);
  assert.doesNotMatch(html,/id="batch-rhythm"[^>]*min="1"/);
  assert.equal(label.textContent,'全谱节奏偏移');
  rhythm.value='-1';apply.dispatch('click');
  assert.deepEqual(state.song.notes.map(n=>n.raw),['1.','2','0.','3-']);
  assert.match(confirmations[0],/延长 1 个半拍/);
  assert.match(els.batchStatus.textContent,/延长 1 个半拍/);
  assert.equal(els.source.value.split('.Words')[1],source.split('.Words')[1]);
  const notes=els.score.querySelectorAll('.note-click');
  notes[0].dispatch('click');
  assert.equal(label.textContent,'选中音符节奏偏移');
  rhythm.value='-1';apply.dispatch('click');
  assert.deepEqual(state.song.notes.map(n=>n.raw),['1-','2','0.','3-']);
  assert.deepEqual([...state.selectedNoteIds],[0]);
  assert.match(confirmations[1],/选中的 1 个音符/);
  const count=confirmations.length,unchanged=els.source.value;
  rhythm.value='0';apply.dispatch('click');
  assert.equal(els.source.value,unchanged);
  assert.equal(confirmations.length,count);
  assert.match(els.batchStatus.textContent,/偏移为 0/);
  rhythm.value='-1';apply.dispatch('click');
  assert.equal(els.source.value,unchanged,'cannot represent a 2.5-beat note: reject atomically');
  assert.equal(confirmations.length,count);
  assert.match(els.batchStatus.textContent,/无法精确表示/);
  rhythm.value='1';apply.dispatch('click');
  assert.equal(state.song.notes[0].raw,'1.');
  assert.match(confirmations[2],/缩短 1 个半拍/);
  rhythm.value='1.5';apply.dispatch('click');
  assert.match(els.batchStatus.textContent,/整数半拍/);
});

test('arrow keys navigate through notes, barline, explicit line break and next note',()=>{
  const source='.Title\nKeyAndMeters = {1=C,3/4}\n.Voice\n1 |$(true)\n2 3';
  const {els,state,document}=boot({source,pianoAudition:false});
  const notes=els.score.querySelectorAll('.note-click');
  notes[0].dispatch('click');
  const press=code=>{
    const ev={code,key:code,preventDefault(){ev.prevented=true},stopPropagation(){}};
    document.dispatch('keydown',ev);return ev;
  };
  let sounds=state.playing;
  assert.equal(press('ArrowRight').prevented,true);
  assert.deepEqual(state.selectedItem,{kind:'bar',index:0});
  assert.equal(state.selectedNoteIds.size,0);
  assert.equal(press('ArrowRight').prevented,true);
  assert.deepEqual(state.selectedItem,{kind:'break',index:0});
  assert.equal(els.score.querySelectorAll('.break-click')[0].classList.contains('is-selected'),true);
  assert.match(els.score.querySelectorAll('.break-click')[0].children[1].textContent,/当前选中换行符/);
  assert.equal(document.getElementById('batch-selection-count').textContent,'已选中换行符');
  assert.equal(document.activeElement,els.score.querySelectorAll('.break-click')[0]);
  assert.equal(press('ArrowRight').prevented,true);
  assert.deepEqual(state.selectedItem,{kind:'note',index:1});
  assert.deepEqual([...state.selectedNoteIds],[1]);
  assert.equal(els.score.querySelectorAll('.break-click')[0].classList.contains('is-selected'),false);
  assert.equal(press('ArrowLeft').prevented,true);
  assert.deepEqual(state.selectedItem,{kind:'break',index:0});
  assert.equal(press('ArrowLeft').prevented,true);
  assert.deepEqual(state.selectedItem,{kind:'bar',index:0});
  assert.equal(press('ArrowLeft').prevented,true);
  assert.deepEqual(state.selectedItem,{kind:'note',index:0});
  assert.equal(els.source.value,source,'moving caret must not change source or issue playback');
  assert.equal(state.playing,sounds,'arrow navigation does not start/stop playback');
  els.source.focus();
  assert.equal(press('ArrowRight').prevented,undefined,'when source is focused native caret movement resumes');
});

test('selecting a terminal bar and Enter shows a transient break hint, then reselection cancels it',()=>{
  const source='.Title\nKeyAndMeters = {1=C,3/4}\n.Voice\n1 |\n.Words\nW1@1,1:\n甲';
  const {els,state,document}=boot({source,pianoAudition:false});
  els.score.querySelectorAll('.bar-click')[0].dispatch('click');
  const press=code=>{const ev={code,timeStamp:100,preventDefault(){ev.prevented=true},stopPropagation(){}};document.dispatch('keydown',ev);return ev};
  assert.equal(press('Enter').prevented,true);
  assert.equal(state.selectedItem.kind,'break');
  assert.equal(state.song.elements.filter(e=>e.kind==='break').length,1);
  const hit=els.score.querySelectorAll('.break-click')[0];
  assert.ok(hit,'terminal break has separate focusable SVG overlay');
  assert.equal(hit.classList.contains('is-selected'),true);
  assert.equal(document.activeElement,hit,'keyboard focus remains in score on new break');
  assert.match(hit.children[1].textContent,/准备另起一行/);
  assert.ok(state.pendingTerminalBreak);
  assert.equal(press('ArrowLeft').prevented,true);
  assert.deepEqual(state.selectedItem,{kind:'bar',index:0});
  assert.equal(state.pendingTerminalBreak,null);
  assert.equal(state.song.elements.filter(e=>e.kind==='break').length,0);
  assert.equal(els.source.value,source,'canceling pending newline restores source byte-for-byte');
  const overlay=els.score.querySelectorAll('.break-click');
  assert.equal(overlay.length,0,'no old pending hint remains after canceling');
  assert.equal(document.activeElement,els.score.querySelectorAll('.bar-click')[0]);
});

test('a terminal break survives the next keyboard note and becomes a real new system',()=>{
  const source='.Title\nKeyAndMeters = {1=C,3/4}\n.Voice\n1 |\n.Words\nW1@1,1:\n甲';
  const {els,state,document}=boot({source,pianoAudition:false,pianoContinuous:false});
  const send=(type,code,timeStamp)=>document.dispatch(type,{code,timeStamp,preventDefault(){},stopPropagation(){}});
  els.score.querySelectorAll('.bar-click')[0].dispatch('click');
  send('keydown','Enter',100);send('keyup','Enter',140);
  assert.ok(state.pendingTerminalBreak);
  send('keydown','KeyQ',180);send('keyup','KeyQ',300);
  assert.equal(state.pendingTerminalBreak,null);
  assert.equal(state.song.elements.filter(e=>e.kind==='break').length,1);
  assert.deepEqual(state.song.notes.map(n=>n.row),[0,1]);
  assert.equal(state.song.notes[0].raw,'1');
  assert.match(state.song.notes[1].raw,/^1,/,'recorded note uses held-key duration');
  assert.equal(els.score.querySelectorAll('.break-click').length,1);
  assert.equal(els.score.querySelectorAll('.break-click')[0].classList.contains('is-selected'),false);
  assert.equal(els.score.querySelectorAll('.break-click')[0].children[1].textContent,'↵ 当前选中换行符');
});

test('changing selected note or deleting provisional newline cancels pending hint without changing original jianpu paint',()=>{
  const source='.Title\nKeyAndMeters = {1=C,3/4}\n.Voice\n1 |';
  for(const scoreType of ['jianpu','staff','guitar']){
    const {state,els,document}=boot({source,pianoAudition:false,scoreType,backspacePrevious:true});
    const send=code=>document.dispatch('keydown',{code,preventDefault(){},stopPropagation(){}});
    els.score.querySelectorAll('.bar-click')[0].dispatch('click');
    send('Enter');
    assert.ok(state.pendingTerminalBreak);
    send('Backspace');
    assert.equal(state.pendingTerminalBreak,null);
    assert.equal(state.song.elements.filter(e=>e.kind==='break').length,0);
    assert.equal(els.source.value,source);
    els.score.querySelectorAll('.bar-click')[0].dispatch('click');
    send('Enter');
    els.score.querySelectorAll('.note-click')[0].dispatch('click');
    assert.equal(state.pendingTerminalBreak,null);
    assert.equal(state.song.elements.filter(e=>e.kind==='break').length,0);
    assert.equal(els.source.value,source);
    assert.equal(els.score.querySelectorAll('.break-click').length,0);
  }
  const css=read('styles.css');
  assert.match(css,/\.break-click\.is-selected \.break-hint\{display:block\}/);
  assert.match(css,/@media print\{\s*\.score-page \.score-line \.break-click\{display:none!important\}/);
});

test('down arrow edits lyric beneath the selected note, up arrow commits and fills gaps',()=>{
  const source='.Title\nKeyAndMeters = {1=C,3/4}\n.Voice\n1 2 3 4';
  const {els,state,document,localStorage}=boot({source});
  els.score.querySelectorAll('.note-click')[2].dispatch('click');
  const press=(code,target)=>{const ev={code,key:code,target,preventDefault(){ev.prevented=true},stopPropagation(){}};document.dispatch('keydown',ev);return ev};
  assert.equal(press('ArrowDown').prevented,true);
  assert.equal(state.lyricDraft.noteId,2);
  const input=state.lyricDraft.input;
  assert.ok(input&&input.className==='lyric-inline-input');
  assert.equal(document.activeElement,input);
  input.value='花';input.dispatch('input');
  assert.equal(els.source.value,source,'IME draft must not modify original source');
  assert.equal(JSON.parse(localStorage.data['sanpu.editor.v1']).source,source);
  assert.equal(press('ArrowUp',input).prevented,true);
  assert.equal(state.lyricDraft,null);
  assert.deepEqual([0,1,2,3].map(i=>state.song.lyrics.get(i)?.text??''),['','','花','']);
  assert.equal(state.song.lyrics.get(0)?.skip,true);
  assert.equal(state.song.lyrics.get(3)?.skip,true);
  assert.match(els.source.value,/\/ \/ \{花\} \//);
  assert.equal(document.activeElement,els.score.querySelectorAll('.note-click')[2]);
  assert.deepEqual([...state.selectedNoteIds],[2]);
  assert.equal(press('ArrowDown').prevented,true);
  const replace=state.lyricDraft.input;
  assert.equal(replace.value,'花');
  replace.value='草';replace.dispatch('input');
  press('ArrowUp',replace);
  assert.equal(state.song.lyrics.get(2).text,'草');
  assert.equal(state.song.lyrics.get(3).skip,true);
  assert.equal(press('ArrowRight').prevented,true);
  assert.deepEqual(state.selectedItem,{kind:'note',index:3});
});

test('IME composition never rewrites Words mid-composition; blur commits after composition finishes',()=>{
  const source='.Title\nKeyAndMeters = {1=C,3/4}\n.Voice\n1 2\n.Words\nW1@1,1:\n秋冬';
  const {els,state,document,localStorage}=boot({source});
  els.score.querySelectorAll('.note-click')[0].dispatch('click');
  document.dispatch('keydown',{code:'ArrowDown',preventDefault(){},stopPropagation(){}});
  const editor=state.lyricDraft.input;
  assert.equal(editor.value,'秋');
  editor.dispatch('compositionstart');
  editor.value='p';editor.dispatch('input');
  editor.value='pi';editor.dispatch('input');
  assert.equal(state.lyricDraft.composing,true);
  assert.equal(els.source.value,source);
  document.dispatch('keydown',{code:'ArrowUp',isComposing:true,target:editor,preventDefault(){throw Error('IME should handle arrow')}});
  editor.value='苹';editor.dispatch('input');
  assert.equal(els.source.value,source);
  editor.dispatch('blur');
  assert.equal(els.source.value,source,'blur during composition waits for compositionend');
  editor.dispatch('compositionend');
  assert.equal(state.lyricDraft,null);
  assert.equal(state.song.lyrics.get(0).text,'苹');
  assert.equal(state.song.lyrics.get(1).text,'冬');
  assert.equal(JSON.parse(localStorage.data['sanpu.editor.v1']).source,els.source.value);
});

test('30s lyric inactivity commits once and leaving score mode commits immediately',()=>{
  const source='.Title\nKeyAndMeters = {1=C,3/4}\n.Voice\n1 | 2 3';
  const {els,state,document,timers,fireTimer}=boot({source});
  els.score.querySelectorAll('.note-click')[1].dispatch('click');
  document.dispatch('keydown',{code:'ArrowDown',preventDefault(){}});
  const editor=state.lyricDraft.input;
  editor.value='春';editor.dispatch('input');
  assert.equal(els.source.value,source);
  const timeouts=[...timers.entries()].filter(([,t])=>t.delay===30000);
  assert.equal(timeouts.length,1);
  editor.value='春天';editor.dispatch('input');
  assert.equal(timers.has(timeouts[0][0]),false,'new edit resets the 30-second timer');
  const pending=[...timers.entries()].find(([,t])=>t.delay===30000);
  fireTimer(pending[0]);
  assert.equal(state.song.lyrics.get(1).text,'春天');
  assert.equal(state.lyricDraft,null);
  els.score.querySelectorAll('.note-click')[2].dispatch('click');
  document.dispatch('keydown',{code:'ArrowDown',preventDefault(){}});
  const next=state.lyricDraft.input;
  next.value='好';next.dispatch('input');
  next.dispatch('blur');
  assert.equal(state.lyricDraft,null);
  assert.equal(state.song.lyrics.get(2).text,'好');
  assert.equal(state.song.lyrics.get(1).text,'春天');
  assert.equal(els.source.value.includes('W1@1,1:'),true);
});
