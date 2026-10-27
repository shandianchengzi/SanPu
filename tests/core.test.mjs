import test from 'node:test';
import assert from 'node:assert/strict';
import {EXAMPLE,EXAMPLES,parseSong,durationFromSuffix,noteFrequency,beatReport,splitLyricPunctuation,DEFAULT_SPACER_WIDTH,MAX_SPACER_WIDTH,pianoToNotation,pianoDurationSuffix,insertPianoNote,pianoKeyMidi,revisePianoNoteDuration,noteSourceCaret} from '../src/core.mjs';
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
  assert.equal(song.key,'G');
  assert.equal(song.meter,'3/4');
  assert.equal(song.notes.length,71);
  assert.equal(song.elements.filter(e=>e.kind==='bar').length,16);
  assert.equal(song.elements.filter(e=>e.kind==='break').length,4);
  assert.deepEqual(song.notes.slice(0,4).map(n=>n.raw),['3,_','3,','#4,_','#4,']);
  assert.deepEqual(song.notes.slice(0,3).map(n=>n.beats),[.5,1,.5]);
  assert.equal(song.lyrics.get(0).text,'从');
  assert.equal(song.lyrics.get(1).text,'前，');
  assert.equal(song.lyrics.get(37).text,'苦');
  assert.equal(song.lyrics.get(39).skip,true);
  assert.equal(song.lyrics.get(70).text,'份。');
  assert.equal(song.lyrics.size,71);
  assert.equal(song.warnings.length,0);
  assert.deepEqual(song.elements.filter(e=>e.kind==='spacer').map(e=>e.raw),
    ['y','y10','y','y','y','y15','y','y','y','y','y','y','y','y','y','y','y40','y','y','y','y35','y30','y','y','y','y35']);
  assert.ok(EXAMPLE.includes('从前，现在,过去了再不来，红红落叶，长埋尘土里。'));
  assert.ok(EXAMPLE.includes('开始终结总是没变改，天边的你飘泊白云外。'));
  assert.ok(EXAMPLE.includes('{1.[苦]}海/ 翻起爱恨， 在世间 难逃避命/运。'));
  assert.ok(EXAMPLE.includes('相亲/ 竟不可/接近,或我应该相信是缘份。'));
  assert.ok(EXAMPLE.includes('5 3_ 2  7,-    y y y y y y y40|'));
  assert.ok(EXAMPLE.includes('#4,... y y y y | 3, 2,_ 3,-'));
  assert.equal(song.notes[9].raw,'3,--');
  assert.equal(EXAMPLES[0].source,EXAMPLE);
  assert.equal(EXAMPLES[0].title,song.title);
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

test('ABC-style y spacer only changes score layout, not note timing or lyric alignment',()=>{
  const source='.Title\nTitle = 对齐\nKeyAndMeters = {1=C,3/4}\n.Voice\n1 2 | 3 4 $(true)\n1 y65 | 3 4\n.Words\nW1@1,1:\n天地玄黄宇宙洪';
  const song=parseSong(source);
  assert.equal(song.raw,source);
  assert.equal(song.notes.length,7);
  assert.deepEqual(song.notes.map(n=>n.beats),Array(7).fill(1));
  assert.deepEqual(song.elements.filter(e=>e.kind==='spacer').map(e=>e.width),[65]);
  assert.deepEqual(song.elements.filter(e=>e.kind==='bar').map(e=>e.measure),[1,2]);
  assert.equal(song.elements.filter(e=>e.kind==='spacer')[0].measure,2);
  assert.deepEqual(song.notes.filter(n=>n.row===1).map(n=>n.noteIndex),[3,1,2]);
  assert.deepEqual(song.notes.map(n=>song.lyrics.get(n.id)?.text),Array.from('天地玄黄宇宙洪'));
  assert.equal([...song.measures.values()].reduce((sum,n)=>sum+n,0),7);
  assert.equal(song.warnings.length,0);
});
test('default, repeated, zero-width, and bounded explicit spacing never creates notes',()=>{
  const src='.Voice\n1 y 2 yy 3 y0 | y40 y5000 4';
  const song=parseSong(src);
  assert.equal(DEFAULT_SPACER_WIDTH,20);
  assert.equal(MAX_SPACER_WIDTH,2000);
  assert.deepEqual(song.elements.filter(e=>e.kind==='spacer').map(e=>e.width),
    [20,20,20,0,40,2000]);
  assert.deepEqual(song.notes.map(n=>n.degree),[1,2,3,4]);
  assert.equal(song.notes.length,4);
  assert.equal(song.notes[3].measure,2);
  assert.deepEqual([...song.measures.values()],[3,1]);
  assert.equal(song.warnings.length,1);
  assert.match(song.warnings[0],/限制为 2000/);
});
test('ordinary whitespace remains source formatting and does not insert visible score space',()=>{
  const first=parseSong('.Voice\n1 2 | 3');
  const second=parseSong('.Voice\n1       2      |    3');
  assert.deepEqual(first.notes.map(n=>n.raw),second.notes.map(n=>n.raw));
  assert.equal(first.elements.length,second.elements.length);
  assert.equal(first.elements.filter(e=>e.kind==='spacer').length,0);
  assert.equal(second.elements.filter(e=>e.kind==='spacer').length,0);
});

test('piano uses score key, semitones and octave notation',()=>{
  assert.equal(pianoToNotation(62,'D'),'1');
  assert.equal(pianoToNotation(61,'D'),'7,');
  assert.equal(pianoToNotation(65,'D'),'b3');
  assert.equal(pianoToNotation(66,'D'),'3');
  assert.equal(pianoToNotation(60,'C'),'1');
  assert.equal(pianoToNotation(61,'C'),'#1');
  assert.equal(pianoToNotation(72,'C'),"1'");
  assert.equal(pianoToNotation(48,'C'),'1,');
  assert.equal(pianoToNotation(200,'C'),null);
  for(const key of ['C','D','F','#F','bE'])
    for(let midi=48;midi<=83;midi++){
      const token=pianoToNotation(midi,key);
      const song=parseSong('.Title\nKeyAndMeters = {1='+key+',3/4}\n.Voice\n'+token);
      const actual=noteFrequency(song.notes[0],key);
      const expected=440*Math.pow(2,(midi-69)/12);
      assert.ok(Math.abs(actual-expected)<1e-6,`${key} ${midi} => ${token}`);
    }
});
test('held piano duration quantizes to current BPM',()=>{
  assert.equal(pianoDurationSuffix(60,80),'___');
  assert.equal(pianoDurationSuffix(190,80),'__');
  assert.equal(pianoDurationSuffix(375,80),'_');
  assert.equal(pianoDurationSuffix(750,80),'');
  assert.equal(pianoDurationSuffix(1125,80),'.');
  assert.equal(pianoDurationSuffix(1500,80),'-');
  assert.equal(pianoDurationSuffix(2250,80),'--');
  assert.equal(pianoDurationSuffix(6000,80),'-------');
  assert.equal(pianoDurationSuffix(375,160),'');
});
test('piano insertion uses exact note span, preserving source and lyrics',()=>{
  const src='.Title\nKeyAndMeters = {1=D,3/4}\n.Voice\n1 1_ | y30 2 $(true)\n.Words\nW1@1,1:\n天地玄';
  const a=insertPianoNote(src,"#4__",0);
  assert.equal(a.noteId,1);
  assert.ok(a.source.includes('1 #4__  1_ | y30 2'));
  assert.ok(a.source.endsWith('.Words\nW1@1,1:\n天地玄'));
  const b=insertPianoNote(a.source,'7,',a.noteId);
  assert.equal(b.noteId,2);
  assert.deepEqual(parseSong(b.source).notes.map(x=>x.raw),['1','#4__','7,','1_','2']);
  const caretSrc='.Voice\n1 2 | 3\n.Words\nW1@1,1:\n甲乙丙';
  assert.ok(insertPianoNote(caretSrc,'6',-1,caretSrc.indexOf(' |')).source.includes('1 2 6  |'));
  assert.equal(insertPianoNote(caretSrc,'6').noteId,3);
  assert.equal(insertPianoNote('.Title\nTitle = test','1'),null);
  const empty=insertPianoNote('.Voice\n.Words\nW1@1,1:\n','2');
  assert.equal(parseSong(empty.source).notes[0].raw,'2');
  assert.ok(empty.source.includes('.Voice\n2\n.Words'));
  assert.equal(parseSong(empty.source).warnings.length,0);
  const crlf=insertPianoNote('.Voice\r\n1 2\r\n.Words\r\nW1@1,1:','3',0);
  assert.ok(crlf.source.includes('1 3  2\r\n.Words'));
});

test('optional keyboard transposition uses exact key-signature semitone offsets',()=>{
  assert.equal(pianoKeyMidi(60,'D',false),60);
  assert.equal(pianoKeyMidi(60,'D',true),62);
  assert.equal(pianoKeyMidi(60,'C',true),60);
  assert.equal(pianoKeyMidi(60,'F',true),65);
  assert.equal(pianoKeyMidi(60,'bE',true),63);
  assert.equal(pianoKeyMidi(60,'#F',true),66);
  assert.equal(pianoKeyMidi(60,'B',true),71);
  assert.equal(pianoKeyMidi(400,'D',true),null);
  for(const key of ['C','D','F','#F','bE','B']){
    for(let midi=48;midi<=83;midi++){
      const transposed=pianoKeyMidi(midi,key,true);
      const notation=pianoToNotation(transposed,key);
      const song=parseSong('.Title\nKeyAndMeters = {1='+key+',3/4}\n.Voice\n'+notation);
      const actual=noteFrequency(song.notes[0],key);
      const expected=440*Math.pow(2,(transposed-69)/12);
      assert.ok(Math.abs(actual-expected)<1e-6,`${key} ${midi} → ${notation}`);
    }
  }
});

test('continuous mode backpatches only a generated note suffix',()=>{
  const source='.Voice\n1_ y30 | 2 3 2\n.Words\nW1@1,1:\n天/地玄黄';
  const inserted=insertPianoNote(source,'#4__',1);
  assert.ok(inserted.source.includes('| 2 #4__  3 2'));
  const revised=revisePianoNoteDuration(inserted.source,2,'#4__','.');
  assert.ok(revised);
  assert.equal(revised.raw,'#4.');
  assert.ok(revised.source.includes('| 2 #4.  3 2'));
  assert.ok(revised.source.endsWith('.Words\nW1@1,1:\n天/地玄黄'));
  assert.deepEqual(parseSong(revised.source).notes.map(n=>n.raw),['1_','2','#4.','3','2']);
  assert.equal(revised.delta,-1);
  assert.equal(revisePianoNoteDuration(revised.source,2,'#4__','--'),null);
  assert.equal(revisePianoNoteDuration(revised.source,0,'1_', 'invalid'),null);
  assert.equal(revisePianoNoteDuration(source,42,'1_', '_'),null);
  const same=revisePianoNoteDuration(source,0,'1_','_');
  assert.equal(same.source,source);
  assert.equal(same.delta,0);
});

test('score note caret resolves exact token after repeated notes, CRLF and spacers',()=>{
  const src='.Title\r\nKeyAndMeters = {1=G,3/4}\r\n.Voice\r\n3,_ y40 3,_ | #4,... $(true)\r\n3,_\r\n.Words\r\nW1@1,1:\r\n好/好好';
  const offsets=[src.indexOf('3,_')+3,src.indexOf('3,_',src.indexOf('y40'))+3,
    src.indexOf('#4,...')+6,src.lastIndexOf('3,_')+3];
  assert.deepEqual(offsets.map((_,i)=>noteSourceCaret(src,i)),offsets);
  assert.equal(noteSourceCaret(src,4),null);
  assert.equal(noteSourceCaret(src,-1),null);
  assert.equal(noteSourceCaret(src,1.2),null);
  assert.equal(noteSourceCaret('.Title\nTitle = no voice',0),null);
});
