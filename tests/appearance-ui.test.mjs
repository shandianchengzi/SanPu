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
  append(...children){this.children.push(...children)}
  replaceChildren(...children){this.children=[...children]}
  addEventListener(type,listener){(this.listeners[type]??=[]).push(listener)}
  dispatch(type,event={}){for(const listener of this.listeners[type]??[])listener(event)}
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
    'import-btn','file-input','save-btn','example-btn','pdf-btn','preview-zoom','preview-zoom-value','zoom-fit','format-tabs']){
    ids[id]=new FakeElement('div');ids[id].id=id;
  }
  const head=new FakeElement('head');
  const document={
    head,createElement:tag=>new FakeElement(tag),createElementNS:(ns,tag)=>new FakeElement(tag),
    getElementById:id=>id==='print-page-rules'?head.children.find(el=>el.id===id)??null:ids[id]??null
  };
  const localStorage={
    data:saved?{'sanpu.editor.v1':JSON.stringify(saved)}:{},
    getItem(key){return this.data[key]??null},
    setItem(key,value){this.data[key]=value}
  };
  const window={addEventListener(){},print(){window.printed=true}};
  const code=[stripped(read('src/core.mjs')),stripped(read('src/format.mjs')),
    stripped(read('src/app.mjs')),'return {state,els,refresh,render};'].join('\n');
  const api=new Function('document','window','localStorage',
    'cancelAnimationFrame','requestAnimationFrame',code)(
    document,window,localStorage,()=>{},()=>0
  );
  return {...api,document,window,localStorage,head};
}
const field=(els,key,suffix='')=>els.formatControls.querySelectorAll('[data-format-key]')
  .find(el=>el.id==='format-'+key+suffix);
const scoreLine=els=>els.score.children.find(el=>el.className==='score-line');

test('full appearance editor renders and updates score and persisted settings',()=>{
  const {state,els,localStorage,head,window}=boot();
  assert.equal(els.formatControls.children.length,3);
  assert.equal(els.formatControls.querySelectorAll('[data-format-key]').length,57);
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
  assert.equal(state.format.lyricSize,28);
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
