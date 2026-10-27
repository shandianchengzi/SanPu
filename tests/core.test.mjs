import test from 'node:test';
import assert from 'node:assert/strict';
import {EXAMPLE,parseSong,durationFromSuffix,noteFrequency,beatReport,splitLyricPunctuation} from '../src/core.mjs';
test('duration keeps individual recorded note lengths',()=>{
  assert.equal(durationFromSuffix('_'),.5);
  assert.equal(durationFromSuffix('__'),.25);
  assert.equal(durationFromSuffix('-'),2);
  assert.equal(durationFromSuffix('--'),3);
  assert.equal(durationFromSuffix('.'),1.5);
  assert.equal(durationFromSuffix('_.'),.75);
});
test('user supplied score parses without changing source',()=>{
  const song=parseSong(EXAMPLE);
  assert.equal(song.raw,EXAMPLE);
  assert.equal(song.title,'一生所爱');
  assert.equal(song.key,'C');
  assert.equal(song.meter,'3/4');
  assert.equal(song.notes.length,34);
  assert.equal(song.elements.filter(e=>e.kind==='bar').length,8);
  assert.deepEqual(song.notes.slice(0,3).map(n=>n.beats),[.5,.5,2]);
  assert.equal(song.notes[0].lyric,undefined);
  assert.equal(song.lyrics.get(0).text,'苦');
  assert.equal(song.lyrics.get(1).text,'海');
  assert.equal(song.lyrics.get(2).skip,true);
  assert.equal(song.lyrics.get(3).text,'翻');
  assert.equal(song.warnings.length,0);
});
test('slash consumes one note; punctuation and spaces do not',()=>{
  const s=parseSong('.Title\nTitle = test\n.Voice\n1 2 3 4 5 |$(true)\n.Words\nW1@1,1:\n好/ 天， 气美');
  assert.deepEqual([0,1,2,3,4].map(i=>s.lyrics.get(i)?.text),['好','','天，','气','美']);
  assert.equal(s.lyrics.get(1).skip,true);
});
test('lyric anchored at measure/note offset',()=>{
  const s=parseSong('.Voice\n1 2 | 3 4 |$(true)\n.Words\nW1@2,2:\n你');
  assert.equal(s.lyrics.get(3).text,'你');
  assert.equal(s.lyrics.get(0),undefined);
});
test('line breaks do not create measures',()=>{
  const s=parseSong('.Voice\n1 2 $(true)\n3 4 | 5\n.Words\nW1@1,1:\n天地玄黄宇');
  assert.deepEqual(s.notes.map(x=>x.measure),[1,1,1,1,2]);
});
test('time signature is advisory, no notes are quantized',()=>{
  const s=parseSong('.Title\nKeyAndMeters = {1=C,3/4}\n.Voice\n3_ 2_ 3- | 5 3_ 2- 7,- |');
  const report=beatReport(s);
  assert.equal(report[0].beats,3);
  assert.equal(report[1].beats,5.5);
  assert.equal(report[1].unequal,true);
  assert.equal(noteFrequency(s.notes[0],'C'),noteFrequency(s.notes[0],'C'));
});

test('lyric punctuation can be detached without modifying raw text or note alignment',()=>{
  assert.deepEqual(splitLyricPunctuation('天，'),{main:'天',prefix:'',suffix:'，'});
  assert.deepEqual(splitLyricPunctuation('海？！'),{main:'海',prefix:'',suffix:'？！'});
  assert.deepEqual(splitLyricPunctuation('你好。'),{main:'你好',prefix:'',suffix:'。'});
  assert.deepEqual(splitLyricPunctuation('“爱”'),{main:'爱',prefix:'“',suffix:'”'});
  assert.deepEqual(splitLyricPunctuation('Hello!'),{main:'Hello',prefix:'',suffix:'!'});
  assert.deepEqual(splitLyricPunctuation('……'),{main:'……',prefix:'',suffix:''});
  assert.deepEqual(splitLyricPunctuation(''),{main:'',prefix:'',suffix:''});
  const source='.Voice\n1 2 3 4\n.Words\nW1@1,1:\n天，海。你好！';
  const song=parseSong(source);
  assert.equal(song.raw,source);
  assert.deepEqual(song.notes.map(n=>song.lyrics.get(n.id)?.text),['天，','海。','你','好！']);
  assert.equal(song.notes.length,4);
  assert.equal(song.warnings.length,0);
});
