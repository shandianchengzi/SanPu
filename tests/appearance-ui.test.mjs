import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
function stripped(code){
  return code.replace(/^import .*;\s*/gm,'').replaceAll('export const ','const ').replaceAll('export function ','function ');
}
class FakeElement {
  constructor(tag){
    this.tag=tag;this.children=[];this.attrs={};this.listeners={};this.dataset={};
    this.style={props:{},setProperty:(key,value)=>{this.style.props[key]=String(value)}};
    this.classList={toggle:()=>{}};this.value='';this.textContent='';
  }
  setAttribute(key,value){this.attrs[key]=String(value);if(key==='class')this.className=String(value)}
  focus(){this.focused=true}
  setRangeText(text,start,end){
    this.value=this.value.slice(0,start)+text+this.value.slice(end);
    this.selectionStart=this.selectionEnd=start+text.length;
  }
  click(){this.clicked=true;return this.dispatch('click')}
  remove(){this.removed=true}
  append(...children){this.children.push(...children)}
  replaceChildren(...children){this.children=[...children]}
  addEventListener(type,listener){(this.listeners[type]??=[]).push(listener)}
  dispatch(type,event={}){let result;for(const listener of this.listeners[type]??[])result=listener(event);return result}
  querySelectorAll(selector){
    const found=[];
    const walk=node=>{for(const child of node.children){
      if(selector==='[data-format-key]' && child.dataset?.formatKey)found.push(child);
      if(selector==='.note-click' && child.className==='note-click')found.push(child);
      walk(child);
    }};
    walk(this);return found;
  }
}
function boot(saved){
  const ids={};
  for(const id of ['source','score','warnings','note-count','tempo','tempo-value',
    'play-btn','stop-btn','saved','format-controls','format-preset','format-reset',
    'import-btn','file-input','save-btn','example-select','example-btn','pdf-btn','preview-zoom','preview-zoom-value','zoom-fit','format-tabs','timbre',
    'style-export-btn','style-import-btn','style-file-input','style-transfer-status','insert-spacer-btn']){
    ids[id]=new FakeElement('div');ids[id].id=id;
  }
  const head=new FakeElement('head');
  const document={
    head,body:new FakeElement('body'),createElement:tag=>new FakeElement(tag),createElementNS:(ns,tag)=>new FakeElement(tag),
    getElementById:id=>id==='print-page-rules'?head.children.find(el=>el.id===id)??null:ids[id]??null
  };
  const localStorage={
    data:saved?{'sanpu.editor.v1':JSON.stringify(saved)}:{},
    getItem(key){return this.data[key]??null},
    setItem(key,value){this.data[key]=value}
  };
  const window={addEventListener(){},print(){window.printed=true}};
  const code=[stripped(read('src/core.mjs')),stripped(read('src/format.mjs')),
    stripped(read('src/timbres.mjs')),stripped(read('src/app.mjs')),
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
  const api=new Function('document','window','localStorage',
    'cancelAnimationFrame','requestAnimationFrame','URL','Blob','setTimeout','TextDecoder',code)(
    document,window,localStorage,()=>{},()=>0,fakeURL,FakeBlob,()=>0,FakeDecoder
  );
  return {...api,document,window,localStorage,head,downloads};
}
const field=(els,key,suffix='')=>els.formatControls.querySelectorAll('[data-format-key]')
  .find(el=>el.id==='format-'+key+suffix);
const scoreLine=els=>els.score.children.find(el=>el.className==='score-line');

test('full appearance editor renders and updates score and persisted settings',()=>{
  const {state,els,localStorage,head,window}=boot();
  assert.equal(els.formatControls.children.length,3);
  assert.equal(els.formatControls.querySelectorAll('[data-format-key]').length,63);
  assert.equal(els.formatTabs.children.length,3);
  assert.ok(scoreLine(els));
  assert.equal(els.score.children.find(el=>el.className==='score-meta').children[1].textContent,'♩ = 72');
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
  assert.equal(els.score.children.find(el=>el.className==='score-meta').children[1].textContent,'♩ = 112');
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
  assert.equal(state.format.noteSize,43);
  assert.equal(state.format.systemGap,17);
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
  assert.equal(meta.children[0].textContent,'1 = C');
  assert.equal(meta.children[1].textContent,'♩ = 80');
  const tonic=field(els,'metaSize');
  tonic.value='48';tonic.dispatch('input');
  assert.equal(state.format.metaSize,48);
  assert.equal(els.score.style.props['--meta-size'],'48px');
  assert.equal(els.score.style.props['--tempo-size'],'26px');
  const tempo=field(els,'tempoSize','-value');
  tempo.value='37';tempo.dispatch('change');
  assert.equal(state.format.tempoSize,37);
  assert.equal(els.score.style.props['--meta-size'],'48px');
  assert.equal(els.score.style.props['--tempo-size'],'37px');
  const weight=field(els,'tempoWeight');
  weight.value='700';weight.dispatch('change');
  assert.equal(els.score.style.props['--tempo-weight'],'700');
  const css=read('styles.css');
  assert.match(css,/\.score-page \.score-tonic\{font-size:var\(--meta-size,33px\)/);
  assert.match(css,/\.score-page \.score-tempo\{font-size:var\(--tempo-size,26px\)/);
  assert.match(css,/@media print\{[\s\S]*?\.score-page \.score-tempo\{font-size:var\(--tempo-size,26px\)!important/);
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
  assert.match(css,/margin-bottom:calc\(var\(--system-gap,17px\) \+ var\(--lyric-line-gap,0px\)\)/);
  assert.match(css,/margin-bottom:calc\(var\(--system-gap,17px\) \+ var\(--lyric-line-gap,0px\)\)!important/);
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
  assert.match(css,/\.score-page \.score-tempo\{[^}]*margin-left:var\(--meta-gap,11px\)/);
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
  assert.equal(state.timbre,'sine');
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
  assert.equal(restored.state.timbre,'sine','unsupported preset falls back to original sine');
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
        frequency:{setValueAtTime(){}},setPeriodicWave(w){osc.wave=w},
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
  const initialHigh=distanceAbove(),initialLow=distanceBelow();
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
  assert.ok(Math.abs(distanceBelow()-(initialLow+30))<.001);
  assert.ok(Math.abs(distanceAbove()-(initialHigh+45))<.001);
  highNumber.value='-20';highNumber.dispatch('change');
  lowSlider.value='-15';lowSlider.dispatch('input');
  assert.ok(Math.abs(distanceAbove()-(initialHigh-20))<.001);
  assert.ok(Math.abs(distanceBelow()-(initialLow-15))<.001);
  assert.equal(els.source.value,source);
  assert.equal(JSON.parse(localStorage.data['sanpu.editor.v1']).format.highOctaveDotOffset,-20);
  assert.equal(JSON.parse(localStorage.data['sanpu.editor.v1']).format.lowOctaveDotOffset,-15);
  document.getElementById('format-reset').dispatch('click');
  assert.equal(state.format.highOctaveDotOffset,0);
  assert.equal(state.format.lowOctaveDotOffset,0);
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
  const baseBodyX=Number(main(0).attrs.x),baseMarkX=Number(mark(0).attrs.x);
  const gapInput=field(els,'punctuationGap','-value');
  const slider=field(els,'punctuationGap');
  assert.equal(gapInput.min,'-30');
  assert.equal(slider.min,'-30');
  gapInput.value='-13';gapInput.dispatch('change');
  assert.equal(state.format.punctuationGap,-13);
  assert.equal(Number(main(0).attrs.x),baseBodyX);
  assert.equal(Number(mark(0).attrs.x),baseMarkX-13);
  assert.equal(slider.value,'-13');
  slider.value='37';slider.dispatch('input');
  assert.equal(state.format.punctuationGap,37);
  assert.equal(Number(main(0).attrs.x),baseBodyX);
  assert.equal(Number(mark(0).attrs.x),baseMarkX+37);
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
  const spaced=plain.replace('1 | 3 4','1 y65 | 3 4');
  const noGap=boot({source:plain});
  const withGap=boot({source:spaced});
  const lines=app=>app.els.score.children.filter(el=>el.className==='score-line');
  const firstBar=el=>Number(el.children.find(x=>x.className==='bar').attrs.x1);
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
  assert.equal(initial.els['example-select'].children.length,1);
  assert.equal(initial.els['example-select'].value,'yi-sheng-suo-ai');
  assert.match(initial.els.source.value,/KeyAndMeters = \{1=D,3\/4\}/);
  assert.ok(initial.els.source.value.includes('y y y y y y30|'));
  const draft=boot({source:'.Voice\n1 2',format:{titleSize:62}});
  assert.equal(draft.els.source.value,'.Voice\n1 2');
  assert.equal(draft.state.format.titleSize,62);
});
