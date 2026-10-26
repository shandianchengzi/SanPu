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
    'import-btn','file-input','save-btn','example-btn','pdf-btn']){
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
  assert.equal(els.formatControls.querySelectorAll('[data-format-key]').length,51);
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
