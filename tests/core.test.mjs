import test from 'node:test';
import assert from 'node:assert/strict';
import {EXAMPLE,EXAMPLES,parseSong,durationFromSuffix,noteFrequency,beatReport,splitLyricPunctuation,DEFAULT_SPACER_WIDTH,MAX_SPACER_WIDTH,pianoToNotation,pianoDurationSuffix,insertPianoNote,pianoKeyMidi,revisePianoNoteDuration,noteSourceCaret,updateTranscriber,songSchedule,groupPlaybackEvents,transposeSongSemitones,adjustSongRhythmHalfBeats,speedUpSongHalfBeats,insertPianoMarker,voiceEditItems,deleteVoiceItem} from '../src/core.mjs';
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
  assert.equal(song.key,'D');
  assert.equal(song.meter,'3/4');
  assert.equal(song.transcriber,'shandianchengzi');
  assert.equal(song.composer,'唐书琛（词）／卢冠廷（曲）');
  assert.equal(song.singer,'周深（原唱：卢冠廷、莫文蔚）');
  assert.equal(song.notes.length,92);
  assert.equal(song.elements.filter(e=>e.kind==='bar').length,21);
  assert.equal(song.elements.filter(e=>e.kind==='break').length,5);
  assert.deepEqual(song.notes.slice(0,4).map(n=>n.raw),['6,_','6,','7,_','7,']);
  assert.deepEqual(song.notes.slice(0,3).map(n=>n.beats),[.5,1,.5]);
  assert.equal(song.lyrics.get(0).text,'从');
  assert.equal(song.lyrics.get(1).text,'前，');
  assert.equal(song.lyrics.get(37).text,'苦');
  assert.equal(song.lyrics.get(39).skip,true);
  assert.equal(song.lyrics.get(70).text,'份。');
  assert.equal(song.lyrics.size,91);
  assert.equal(song.warnings.length,0);
  const spacerMarks=song.elements.filter(e=>e.kind==='spacer').map(e=>e.raw);
  assert.deepEqual(spacerMarks,['y15','y15','y','y','y15','y','y','y15','y','y','y','y','y','y','y30','y','y','y','y35','y25','y15','y','y','y','y35','y','y10','y15']);
  assert.ok(EXAMPLE.includes('从前，现在,过去了再不来，红红落叶，长埋尘土里。'));
  assert.ok(EXAMPLE.includes('开始终结总是没变改，天边的你飘泊白云外。'));
  assert.ok(EXAMPLE.includes('{1.[苦]}海/ 翻起爱恨， 在世间 难逃避命/运。'));
  assert.ok(EXAMPLE.includes('相/亲 竟不可/接近,或我应该相信是缘份。'));
  assert.ok(EXAMPLE.includes("1' 6_ 5  3-    y y y y y y y30|"));
  assert.ok(EXAMPLE.includes('7,-- y  y| 6, 5,_ 6,-'));
  assert.equal(song.notes[9].raw,'6,--');
  assert.ok(EXAMPLE.includes('2. (2_ 4.)  | (3__ 4__ 3__ 2__) 3_ 1_ 1__ 2__ 3-'));
  assert.ok(EXAMPLE.includes("(4__. #4__ b6-) | (1' 7-) | (1'__. 7_) 6--  |$(true)"));
  assert.deepEqual(song.slurs.map(({startId,endId})=>[startId,endId]),[[6,7],[38,39],[50,51],[53,54],[72,73],[74,77],[83,85],[86,87],[88,89]]);
  assert.equal(song.notes[90].raw,'6--');
  assert.equal(song.notes[91].raw,'1');
  assert.equal(song.notes[91].row,5);
  assert.ok(EXAMPLE.includes('6--  |$(true)\n1\n.Words'));
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

test('JPW-ABC title metadata provides independent song attribution defaults',()=>{
  const src='.Title\nTitle = Test\nKeyAndMeters = {1=G,3/4}\nWordsByAndMusicBy = 李甲\nTranscriber = 王乙\nSinger = 张丙\n.Voice\n1';
  const song=parseSong(src);
  assert.equal(song.transcriber,'王乙');
  assert.equal(song.composer,'李甲');
  assert.equal(song.singer,'张丙');
  assert.equal(song.raw,src);
  assert.deepEqual(song.warnings,[]);
  const legacy=parseSong('.Title\nTitle = Old\n.Voice\n1');
  assert.equal(legacy.transcriber,'shandianchengzi');
  assert.equal(legacy.composer,'');
  assert.equal(legacy.singer,'');
  assert.equal(parseSong('.Title\nTranscriber = \n.Voice\n1').transcriber,'');
});

test('parenthesized ABC phrasing forms slurs without changing beats or source offsets',()=>{
  const input='.Title\nTitle = Slurs\n.Voice\n(1_ 2_ 3) | (4 (5 6) 7) $(true)\n(1 2) 3';
  const song=parseSong(input);
  assert.deepEqual(song.notes.map(n=>n.raw),['1_','2_','3','4','5','6','7','1','2','3']);
  assert.deepEqual(song.slurs,[{startId:0,endId:2},{startId:4,endId:5},{startId:3,endId:6},{startId:7,endId:8}]);
  assert.equal(song.notes[0].beats,.5);
  assert.equal(song.notes[1].beats,.5);
  assert.equal(song.notes[2].beats,1);
  assert.deepEqual(song.warnings,[]);
  assert.equal(noteSourceCaret(input,2),input.indexOf('3)')+1);
  assert.equal(song.raw,input);
});
test('invalid slur delimiters warn without dropping recognized notes',()=>{
  const missingEnd=parseSong('.Voice\n(1 2');
  assert.equal(missingEnd.notes.length,2);
  assert.match(missingEnd.warnings.join(''),/闭括号/);
  const single=parseSong('.Voice\n(1) 2');
  assert.equal(single.notes.length,2);
  assert.match(single.warnings.join(''),/至少需要两个/);
  const missingStart=parseSong('.Voice\n1 2)');
  assert.equal(missingStart.notes.length,2);
  assert.match(missingStart.warnings.join(''),/开括号/);
});
test('transcriber update preserves source and permits an explicitly blank credit',()=>{
  const base='.Title\r\nTitle = 宋\r\nKeyAndMeters = {1=C,3/4}\r\n.Voice\r\n1 2';
  const named=updateTranscriber(base,'王小明');
  assert.equal(parseSong(named).transcriber,'王小明');
  assert.ok(named.includes('KeyAndMeters = {1=C,3/4}\r\n'));
  const blank=updateTranscriber(named,'');
  assert.equal(parseSong(blank).transcriber,'');
  assert.equal((blank.match(/Transcriber =/g)||[]).length,1);
  assert.equal(updateTranscriber(blank,'另一位'),named.replace('王小明','另一位'));
  const newTitle=updateTranscriber('.Voice\n1','no-title');
  assert.equal(parseSong(newTitle).transcriber,'no-title');
  assert.ok(newTitle.endsWith('.Voice\n1'));
  assert.equal(parseSong(updateTranscriber('.Voice\n1','')).transcriber,'');
});

test('shared playback schedule preserves notation lengths and marks legato boundaries',()=>{
  const song=parseSong('.Title\nKeyAndMeters = {1=C,3/4}\n.Voice\n(1_ 2_ 3) 0 (4 5) 6');
  const {timeline,total}=songSchedule(song,120);
  assert.deepEqual(timeline.map(x=>x.end-x.start),[.25,.25,.5,.5,.5,.5,.5]);
  assert.deepEqual(timeline.map(x=>x.legatoToNext),[true,true,false,false,true,false,false]);
  assert.equal(total,3);
  assert.equal(timeline[3].freq,0);
});

test('legato scheduler groups continuously sounding notes but never bridges rests',()=>{
  const s=parseSong('.Title\nKeyAndMeters = {1=C,3/4}\n.Voice\n(1 2 3) 4 (5 0 6) 7');
  const {timeline}=songSchedule(s,120);
  const groups=groupPlaybackEvents(timeline);
  assert.deepEqual(groups.map(group=>group.map(ev=>ev.id)),[[0,1,2],[3],[4],[6],[7]]);
  assert.equal(timeline[4].legatoToNext,false);
  assert.equal(timeline[5].freq,0);
  const resumed=groupPlaybackEvents(timeline, .75);
  assert.deepEqual(resumed[0].map(ev=>ev.id),[1,2]);
  assert.equal(resumed[0][0].start,.75);
});

test('batch semitone transposition preserves rhythm, rests, slurs, source layout and lyrics',()=>{
  const original='.Title\r\nTitle = Test\r\nKeyAndMeters = {1=G,3/4}\r\n.Voice\r\n(3,_ #4,.) 0 y15 | 1 7, 1_ $(true)\r\n(5__ 6.) 7,2\r\n.Words\r\nW1@1,1:\r\n歌词/不变';
  const before=parseSong(original);
  const moved=transposeSongSemitones(original,2);
  const after=parseSong(moved.source);
  assert.equal(moved.count,before.notes.filter(n=>n.degree!==0).length);
  assert.equal(moved.total,before.notes.length);
  assert.equal(after.notes.length,before.notes.length);
  assert.deepEqual(after.notes.map(n=>n.beats),before.notes.map(n=>n.beats));
  assert.deepEqual(after.slurs,before.slurs);
  assert.deepEqual(after.elements.filter(e=>e.kind!=='note').map(e=>e.raw),
    before.elements.filter(e=>e.kind!=='note').map(e=>e.raw));
  const phrase=s=>s.slice(s.indexOf('.Words'));
  assert.equal(phrase(moved.source),phrase(original));
  assert.match(moved.source,/\r\n/,'line ending is preserved');
  for(let i=0;i<before.notes.length;i++){
    const b=before.notes[i],a=after.notes[i];
    if(b.degree===0)assert.equal(a.raw,b.raw);
    else assert.ok(Math.abs(noteFrequency(a,'G')/noteFrequency(b,'G')-Math.pow(2,2/12))<1e-10,i);
    assert.equal(a.suffix,b.suffix,'duration marker must remain unchanged');
  }
  const back=transposeSongSemitones(moved.source,-2);
  const final=parseSong(back.source);
  for(let i=0;i<before.notes.length;i++)
    assert.ok(Math.abs(noteFrequency(final.notes[i],'G')-noteFrequency(before.notes[i],'G'))<1e-9);
  assert.equal(transposeSongSemitones(original,0).source,original);
});

test('batch shift rejects invalid numbers and out-of-range notes atomically',()=>{
  const original='.Title\nKeyAndMeters = {1=C,3/4}\n.Voice\n1 2 3\n.Words\nW1@1,1:\n你好吗';
  for(const invalid of [NaN,1.2,Infinity,'2',null])
    assert.throws(()=>transposeSongSemitones(original,invalid),/整数/);
  assert.throws(()=>transposeSongSemitones(original,90),/超出支持音域/);
  assert.throws(()=>transposeSongSemitones(original,-100),/超出支持音域/);
  assert.throws(()=>transposeSongSemitones('.Title\nTitle = no music',2),/Voice/);
  assert.throws(()=>transposeSongSemitones('.Voice\n y15',2),/没有可移调/);
  assert.equal(original.includes('1 2 3'),true,'input source must remain intact');
  const flat=transposeSongSemitones('.Voice\nb3 #4 7,',-1);
  assert.deepEqual(parseSong(flat.source).notes.map(n=>n.raw),['2','4','b7,']);
});

test('rest zero supports the same piano duration and source edits as pitched notes',()=>{
  const source='.Title\nKeyAndMeters = {1=C,3/4}\n.Voice\n1\n.Words\nW1@1,1:\n你';
  const inserted=insertPianoNote(source,'0-',0);
  assert.ok(inserted);
  assert.deepEqual(parseSong(inserted.source).notes.map(n=>n.raw),['1','0-']);
  assert.equal(noteFrequency(parseSong(inserted.source).notes[1]),0);
  const fixed=revisePianoNoteDuration(inserted.source,1,'0-','_.');
  assert.ok(fixed);
  assert.deepEqual(parseSong(fixed.source).notes.map(n=>n.raw),['1','0_.']);
  assert.equal(parseSong(fixed.source).notes[1].beats,.75);
  assert.equal(revisePianoNoteDuration(fixed.source,1,'0-','_'),null);
  assert.equal(insertPianoNote(source,'#0'),null);
  assert.equal(insertPianoNote(source,'0,'),null);
  assert.equal(fixed.source.split('.Words')[1],source.split('.Words')[1]);
});

test('bar and new-system keyboard markers preserve source and precede the next piano note',()=>{
  const original='.Title\nKeyAndMeters = {1=D,3/4}\n.Voice\n1 2\n.Words\nW1@1,1:\n天地';
  const bar=insertPianoMarker(original,'|',1);
  assert.ok(bar);
  const newline=insertPianoMarker(bar.source,'$(true)',1,bar.caret);
  assert.ok(newline);
  const next=insertPianoNote(newline.source,'0_',1,newline.caret);
  assert.ok(next);
  const song=parseSong(next.source);
  assert.deepEqual(song.notes.map(n=>n.raw),['1','2','0_']);
  assert.equal(song.notes[2].row,1);
  assert.equal(song.notes[2].measure,2);
  assert.match(next.source,/2\s*\|\s*\$\(true\)\s*0_/);
  assert.equal(next.source.split('.Words')[1],original.split('.Words')[1]);
  assert.equal(song.warnings.length,0);
});

test('repeated markers before the first note preserve CRLF and stay inside Voice',()=>{
  const original='.Title\r\nTitle = Empty\r\n.Voice\r\n.Words\r\nW1@1,1:\r\n';
  const bar=insertPianoMarker(original,'|');
  assert.ok(bar);
  const br=insertPianoMarker(bar.source,'$(true)',-1,bar.caret);
  assert.ok(br);
  const note=insertPianoNote(br.source,'1',-1,br.caret);
  assert.ok(note);
  const song=parseSong(note.source);
  assert.deepEqual(song.notes.map(n=>n.raw),['1']);
  assert.equal(song.notes[0].row,1);
  assert.equal(song.notes[0].measure,2);
  assert.match(note.source,/\|\s*\$\(true\)\s*1/);
  assert.equal(note.source.split('.Words')[1],original.split('.Words')[1]);
  assert.ok(note.source.includes('\r\n'));
  assert.equal(insertPianoMarker(original,'*'),null);
  assert.equal(insertPianoMarker('.Title\nTitle = A','|'),null);
});

test('voice source locations identify notes, barlines and explicit system breaks',()=>{
  const source='.Title\r\nTitle = A\r\n.Voice\r\n1 | $(true)\r\n2 | 3\r\n.Words\r\nW1@1,1:\r\n甲乙丙';
  const items=voiceEditItems(source);
  assert.deepEqual(items.map(item=>item.kind),['note','bar','break','note','bar','note']);
  assert.deepEqual(items.map(item=>item.raw),['1','|','$(true)','2','|','3']);
  assert.deepEqual(items.filter(i=>i.kind==='bar').map(i=>i.index),[0,1]);
  assert.equal(items[2].index,0);
  assert.ok(items.every(i=>source.slice(i.from,i.to)===i.raw));
  const deleted=deleteVoiceItem(source,'bar',0);
  assert.ok(deleted);
  assert.equal(deleted.removed.raw,'|');
  assert.equal(deleted.source.split('.Words')[1],source.split('.Words')[1]);
  assert.equal(parseSong(deleted.source).notes.length,3);
  assert.equal(parseSong(deleted.source).elements.filter(i=>i.kind==='bar').length,1);
  const br=deleteVoiceItem(source,'break',0);
  assert.equal(br.removed.raw,'$(true)');
  assert.equal(parseSong(br.source).elements.filter(i=>i.kind==='break').length,0);
  const note=deleteVoiceItem(source,'note',1);
  assert.deepEqual(parseSong(note.source).notes.map(n=>n.raw),['1','3']);
  assert.equal(deleteVoiceItem(source,'bar',20),null);
  assert.equal(deleteVoiceItem(source,'header',0),null);
});

test('selected barline caret anchors a new pitch or separator before the next existing note',()=>{
  const src='.Title\nKeyAndMeters = {1=C,3/4}\n.Voice\n| 1 | 2\n.Words\nW1@1,1:\n你好';
  const [first,second]=voiceEditItems(src).filter(i=>i.kind==='bar');
  const inserted=insertPianoNote(src,'3',-1,first.to,true);
  assert.ok(inserted);
  assert.deepEqual(parseSong(inserted.source).notes.map(n=>n.raw),['3','1','2']);
  assert.match(inserted.source,/\.Voice\s+\|\s+3\s+1\s+\|\s+2/);
  assert.equal(inserted.noteId,0);
  const m=insertPianoMarker(src,'$(true)',-1,second.to,true);
  assert.ok(m);
  assert.match(m.source,/\|\s+\$\(true\)\s+2/);
  assert.equal(parseSong(m.source).elements.filter(i=>i.kind==='break').length,1);
  assert.equal(m.source.split('.Words')[1],src.split('.Words')[1]);
});

test('scoped pitch and exact half-beat edits preserve all unselected voice and lyric bytes',async()=>{
  const {transposeSongSemitones,speedUpSongHalfBeats,parseSong}=await import('../src/core.mjs');
  const source='.Title\nKeyAndMeters = {1=C,3/4}\n.Voice\n1- 2 3_ |$(true)\n4- 0- 5.\n.Words\nW1@1,1:\n测试文本';
  const shorter=speedUpSongHalfBeats(source,1,new Set([0,3]));
  assert.deepEqual(parseSong(shorter.source).notes.map(n=>n.raw),['1.','2','3_','4.','0-','5.']);
  assert.equal(shorter.count,2);
  assert.equal(shorter.source.split('.Words')[1],source.split('.Words')[1]);
  assert.throws(()=>speedUpSongHalfBeats(source,1),/仅 0.5 拍/);
  assert.throws(()=>speedUpSongHalfBeats(source,1,[2]),/仅 0.5 拍/);
  assert.deepEqual(speedUpSongHalfBeats(source,0,[0]),{source,count:0,total:1});
  const transpose=transposeSongSemitones(source,2,[0,2]);
  assert.deepEqual(parseSong(transpose.source).notes.map(n=>n.raw),['2-','2','#4_','4-','0-','5.']);
  assert.equal(transpose.source.split('.Words')[1],source.split('.Words')[1]);
  assert.throws(()=>transposeSongSemitones(source,1,[999]),/先选中|重新选择/);
});

test('selected notes become one parsed JPW phrasing slur without disturbing layout',async()=>{
  const {addSlurToSelectedNotes,parseSong}=await import('../src/core.mjs');
  const source='.Title\nKeyAndMeters = {1=C,3/4}\n.Voice\n1 2 |$(true)\n3 4\n.Words\nW1@1,1:\n你好';
  const result=addSlurToSelectedNotes(source,new Set([0,1,2]));
  assert.equal(result.count,3);
  assert.deepEqual(parseSong(result.source).slurs,[{startId:0,endId:2}]);
  assert.deepEqual(parseSong(result.source).notes.map(n=>n.raw),['1','2','3','4']);
  assert.equal(result.source.split('.Words')[1],source.split('.Words')[1]);
  assert.throws(()=>addSlurToSelectedNotes(source,[1]),/至少选中两个/);
  assert.throws(()=>addSlurToSelectedNotes(result.source,[0,1,2]),/已有连音/);
  assert.throws(()=>addSlurToSelectedNotes(source+'',[]),/先选中/);
});

test('signed rhythm adjustment lengthens selected notes and rests exactly, without changing other bytes',()=>{
  const source='.Title\nTitle = Rhythm\nKeyAndMeters = {1=C,3/4}\n.Voice\n1 2_ 0 |$(true)\n3.\n.Words\nW1@1,1:\n甲乙丙丁';
  const extended=adjustSongRhythmHalfBeats(source,-1,[0,2,3]);
  assert.equal(extended.count,3);
  assert.equal(extended.total,3);
  assert.deepEqual(parseSong(extended.source).notes.map(n=>n.raw),['1.','2_','0.','3-']);
  assert.equal(extended.source.split('.Words')[1],source.split('.Words')[1]);
  assert.ok(extended.source.includes(' |$(true)\n'),'bar and explicit system break stay untouched');
  const all=adjustSongRhythmHalfBeats(source,-1);
  assert.deepEqual(parseSong(all.source).notes.map(n=>n.raw),['1.','2','0.','3-']);
  assert.equal(all.count,4);
  assert.equal(all.source.split('.Words')[1],source.split('.Words')[1]);
  assert.deepEqual(adjustSongRhythmHalfBeats(source,0),{source,count:0,total:4});
  assert.deepEqual(adjustSongRhythmHalfBeats(source,0,new Set([0,2])),{source,count:0,total:2});
});

test('signed rhythm adjustment preserves positive shortening and rejects invalid / nonrepresentable results atomically',()=>{
  const source='.Title\nKeyAndMeters = {1=C,3/4}\n.Voice\n1- 2_ 0-';
  const shortened=adjustSongRhythmHalfBeats(source,1,[0,2]);
  assert.deepEqual(parseSong(shortened.source).notes.map(n=>n.raw),['1.','2_','0.']);
  assert.deepEqual(speedUpSongHalfBeats(source,1,[0,2]),shortened,'legacy API retains compatible positive semantics');
  assert.throws(()=>adjustSongRhythmHalfBeats(source,-1),/无法精确表示/,
    'two beats plus half a beat cannot be encoded by existing note syntax');
  assert.throws(()=>adjustSongRhythmHalfBeats(source,-1,[0]),/无法精确表示/);
  assert.throws(()=>adjustSongRhythmHalfBeats(source,2,[1]),/仅 0.5 拍/);
  assert.throws(()=>adjustSongRhythmHalfBeats(source,1.5,[0]),/整数半拍/);
  assert.throws(()=>adjustSongRhythmHalfBeats(source,NaN,[0]),/整数半拍/);
  assert.throws(()=>adjustSongRhythmHalfBeats(source,-3,[0]),/无法精确表示/);
  assert.equal(parseSong(source).notes[0].raw,'1-','failed operation does not mutate input');
});
