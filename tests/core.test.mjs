import test from 'node:test';
import assert from 'node:assert/strict';
import {EXAMPLE,EXAMPLES,parseSong,durationFromSuffix,noteFrequency,beatReport,splitLyricPunctuation,DEFAULT_SPACER_WIDTH,MAX_SPACER_WIDTH,pianoToNotation,pianoDurationSuffix,insertPianoNote,pianoKeyMidi,revisePianoNoteDuration,noteSourceCaret,updateTranscriber,songSchedule,groupPlaybackEvents,transposeSongSemitones,adjustSongRhythmHalfBeats,speedUpSongHalfBeats,beatDurationSuffix,setSongNoteBeats,insertPianoMarker,voiceEditItems,deleteVoiceItem,setLyricForNote,parseLyricRowInput,lyricRowDraft,setLyricRow,parseLibrarySongName,newLibrarySongSource,renameSongSourceTitle,copyVoiceSelection,pasteVoiceSelection} from '../src/core.mjs';
test('duration keeps individual recorded note lengths',()=>{
  assert.equal(durationFromSuffix('_'),.5);
  assert.equal(durationFromSuffix('__'),.25);
  assert.equal(durationFromSuffix('-'),2);
  assert.equal(durationFromSuffix('--'),3);
  assert.equal(durationFromSuffix('.'),1.5);
  assert.equal(durationFromSuffix('_.'),.75);
});
test('the built-in score exactly matches the revised five-line meterless example',()=>{
  const expected=`// ************** JPW-ABC File Ver 1.0 (for JP-Word v5.50m) **************
.Title
Title = 一生所爱
KeyAndMeters = {1=D}
WordsByAndMusicBy = 唐书琛（词）／卢冠廷（曲）
Singer = 周深（原唱：卢冠廷、莫文蔚）
.Voice
6,_   6, |7,_ 7, |1_ 1 (1_ 2) 3_ 6,-- |6,_ 6, 7,_ 7, 1_ 1  2_ 5 3- y15|$(true)
4_ 3_ 2_ 1_ 2 7,- | 1 2_ 3-- y15 | y y  y15 4_ 3_ 2_ 1_ 2 7,-- y  y| 6, 5,_ 6,- y15| $(true)
6_ (5_ 6-) | 1' 6_ 5  3-    y y y y y y y30| y y y y35 3 5_ 6- |1_ 1 2_ (3_ 5_) 3-- y25 y15|$(true)
(6_  5_) 6- |1' 2'_ 6 5- 5_ 3-|  y35 6, 1_ 3 2- 2_ 1. y| y10 6, 5,_ 6,-  0_    y15|$(true)
2. (2_ 4.)  | (3__ 4__ 3__ 2__) 3_ 1_ 1__ 2__ 3- |  (4__. #4__ b6-) | (7__  1'_ 7-) | (1'__. 7_ 6--) | $(true)
`;
  assert.equal(EXAMPLE,expected,'do not normalize any user-provided notation or spacing');
  const song=parseSong(EXAMPLE);
  assert.equal(song.raw,EXAMPLE);
  assert.equal(song.title,'一生所爱');
  assert.equal(song.key,'D');
  assert.equal(song.meter,'','the default score has no time signature');
  assert.equal(song.transcriber,'shandianchengzi');
  assert.equal(song.composer,'唐书琛（词）／卢冠廷（曲）');
  assert.equal(song.singer,'周深（原唱：卢冠廷、莫文蔚）');
  assert.equal(song.notes.length,93);
  assert.equal(song.elements.filter(e=>e.kind==='bar').length,21);
  assert.equal(song.elements.filter(e=>e.kind==='break').length,5);
  assert.deepEqual(song.notes.slice(0,4).map(n=>n.raw),['6,_','6,','7,_','7,']);
  assert.deepEqual(song.notes.slice(0,3).map(n=>n.beats),[.5,1,.5]);
  assert.equal(song.lyrics.size,0,'the new default does not add the previous lyrics');
  assert.ok(!EXAMPLE.includes('.Words'));
  assert.deepEqual(song.slurs.map(({startId,endId})=>[startId,endId]),
    [[6,7],[38,39],[50,51],[53,54],[72,73],[74,77],[84,86],[87,89],[90,92]]);
  assert.equal(song.notes[90].raw,"1'__.");
  assert.equal(song.notes[92].raw,'6--');
  assert.equal(song.notes[92].row,4);
  assert.equal(song.notes.filter(n=>n.raw==='0_').length,1);
  assert.equal(song.warnings.length,0);
  assert.equal(EXAMPLES[0].source,EXAMPLE,'the built-in library entry uses the same revised score');
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

test('single-note lyric editing fills blank slots on both sides and preserves later values',()=>{
  const original='.Title\nTitle = 新曲\n.Voice\n1 2 |$(true)\n3 4 5';
  const result=setLyricForNote(original,2,'春');
  const parsed=parseSong(result.source);
  assert.deepEqual([...Array(5)].map((_,i)=>parsed.lyrics.get(i)?.text??''),
    ['','','春','','']);
  assert.equal(parsed.lyrics.get(0)?.skip,true);
  assert.equal(parsed.lyrics.get(1)?.skip,true);
  assert.equal(parsed.lyrics.get(3)?.skip,true);
  assert.equal(parsed.lyrics.get(4)?.skip,true);
  assert.match(result.source,/\.Words\nW1@1,1:\n\/ \/ \{春\} \/ \//);
  const next=setLyricForNote(result.source,4,'光');
  assert.deepEqual([...Array(5)].map((_,i)=>parseSong(next.source).lyrics.get(i)?.text??''),
    ['','','春','','光']);
  const overwritten=setLyricForNote(next.source,2,'夜');
  assert.equal(parseSong(overwritten.source).lyrics.get(2).text,'夜');
  assert.equal(parseSong(overwritten.source).lyrics.get(4).text,'光');
  assert.deepEqual(parseSong(overwritten.source).notes.map(n=>n.raw),['1','2','3','4','5']);
});

test('lyric replacement preserves punctuation, skip placeholders, other verses and source sections',()=>{
  const original='.Title\nTitle = 例子\n.Voice\n1 2 | 3 4\n.Words\nW1@1,1:\n{风，}/ 雨{天。}\nW2@1,1:\nABCD\n.Layout\nx = y';
  const edited=setLyricForNote(original,1,'你好！');
  const song=parseSong(edited.source);
  assert.deepEqual([0,1,2,3].map(i=>song.lyrics.get(i)?.text??''),['风，','你好！','雨','天。']);
  assert.ok(edited.source.includes('W2@1,1:\nABCD'));
  assert.ok(edited.source.endsWith('.Layout\nx = y'));
  const clear=setLyricForNote(edited.source,1,'');
  assert.equal(parseSong(clear.source).lyrics.get(1).skip,true);
  assert.equal(parseSong(clear.source).lyrics.get(2).text,'雨');
  assert.throws(()=>setLyricForNote(original,10,'未'),/没有对应的音符/);
  assert.throws(()=>setLyricForNote(original,0,'多\n行'),/不可包含换行/);
});

test('absolute beat setting uses short exact _, * and - suffix expressions',()=>{
  assert.equal(beatDurationSuffix(1),'');
  assert.equal(beatDurationSuffix(0.5),'_');
  assert.equal(beatDurationSuffix(0.375),'__.');
  assert.equal(beatDurationSuffix(1.5),'.');
  assert.equal(beatDurationSuffix(2),'-');
  assert.equal(beatDurationSuffix(2.5),'*-');
  assert.equal(beatDurationSuffix(1.25),'*-_');
  const values=[0.015625,0.03125,0.0625,0.125,0.1875,0.25,0.3125,
    0.375,0.5,0.625,0.75,0.875,1,1.125,1.25,1.375,1.5,1.625,
    1.75,2,2.5,2.75,3.125,3.375,3.5,5.5,16.125,127.5,1023.5,1024];
  for(const beats of values){
    const suffix=beatDurationSuffix(beats);
    assert.equal(durationFromSuffix(suffix),beats,'encode and parse '+beats+' exactly with suffix '+suffix);
    const song=parseSong('.Voice\n3'+suffix+' 0'+suffix);
    assert.equal(song.notes.length,2,'two notes encoded '+beats);
    assert.deepEqual(song.notes.map(n=>n.beats),[beats,beats]);
    assert.equal(song.warnings.length,0);
  }
  assert.equal(durationFromSuffix('**_'),1.125);
  assert.equal(durationFromSuffix('..'),1.75,'legacy repeated dots remain unchanged');
  assert.equal(durationFromSuffix('._'),0.75,'legacy dotted-underscore suffix unchanged');
  assert.equal(durationFromSuffix('_.'),0.75);
  for(const invalid of [0,-1,NaN,Infinity,0.1,0.3,2.3,1024.5]){
    assert.throws(()=>beatDurationSuffix(invalid),/拍|精确/,'invalid '+invalid);
  }
});

test('setting absolute fractional beat lengths preserves unselected notes, rests, formatting, and lyrics',()=>{
  const source='.Title\nKeyAndMeters = {1=D,3/4}\n.Voice\n1_ 2- |$(true)\n3 0 4. y40\n.Words\nW1@1,1:\n中文测试';
  const selected=setSongNoteBeats(source,1.25,new Set([1,3]));
  assert.equal(selected.count,2);
  assert.equal(selected.total,2);
  assert.equal(selected.beats,1.25);
  assert.equal(selected.suffix,'*-_');
  assert.deepEqual(parseSong(selected.source).notes.map(n=>n.beats),[0.5,1.25,1,1.25,1.5]);
  assert.deepEqual(parseSong(selected.source).notes.map(n=>n.raw),['1_','2*-_','3','0*-_','4.']);
  assert.equal(selected.source.split('.Words')[1],source.split('.Words')[1]);
  assert.match(selected.source,/\|\$\(true\)\n/);
  const all=setSongNoteBeats(source,2.5);
  assert.equal(all.count,5);
  assert.deepEqual(parseSong(all.source).notes.map(n=>n.beats),Array(5).fill(2.5));
  assert.equal(all.source.split('.Words')[1],source.split('.Words')[1]);
  assert.equal(setSongNoteBeats(all.source,2.5).count,0);
  assert.throws(()=>setSongNoteBeats(source,0.1),/分母为 2/);
  assert.throws(()=>setSongNoteBeats(source,0),/大于 0/);
  assert.throws(()=>setSongNoteBeats(source,1.25,[800]),/先选中|重新选择/);
});

test('fractional set durations retain exact playback timing and support tiny dyadic fractions safely',()=>{
  const song=parseSong('.Title\nKeyAndMeters = {1=C,3/4}\n.Voice\n1*-_ 2*- 0__');
  assert.deepEqual(song.notes.map(note=>note.beats),[1.25,2.5,0.25]);
  const schedule=songSchedule(song,120);
  assert.equal(schedule.timeline.length,3);
  assert.deepEqual(schedule.timeline.map(event=>[event.start,event.end]),
    [[0,0.625],[0.625,1.875],[1.875,2]]);
  assert.equal(schedule.total,2);
  for(const value of [2**-20,1+2**-20,1024-2**-20]){
    const suffix=beatDurationSuffix(value);
    assert.ok(suffix.length<=1100,'bounded suffix for '+value);
    assert.equal(durationFromSuffix(suffix),value);
  }
});

test('row lyric draft positions caret after target, with prefix placeholders and preserved suffix',()=>{
  const src='.Voice\n1 2 3 4 5 |$(true)\n6 7\n.Words\nW1@1,1:\n//花月\nW2@1,1:\n原声';
  const song=parseSong(src);
  const first=lyricRowDraft(song,2);
  assert.equal(first.value,'//花月');
  assert.equal(first.caret,3,'existing lyric remains and caret follows it');
  assert.equal(first.selectionEnd,3);
  const blank=lyricRowDraft(parseSong('.Voice\n1 2 3 4 5'),2);
  assert.equal(blank.value,'//');
  assert.equal(blank.caret,2);
  assert.equal(blank.selectionEnd,2);
  const middle=lyricRowDraft(parseSong('.Voice\n1 2 3 4 5\n.Words\nW1@1,1:\n天地/星'),2);
  assert.equal(middle.value,'天地/星');
  assert.equal(middle.caret,2,'unfilled middle note starts after preceding lyrics');
  assert.equal(middle.selectionEnd,3,'the placeholder is selected for replacement');
  const after=setLyricRow(src,first.ids,'//花天月');
  assert.deepEqual(after.source.includes('W2@1,1:\n原声'),true);
  assert.deepEqual(parseSong(after.source).notes.map((note)=>parseSong(after.source).lyrics.get(note.id)?.text??''),
    ['','','花','天','月','','']);
});

test('whole lyric row distributes multiple characters without touching the next music row',()=>{
  const original='.Title\nTitle = Demo\n.Voice\n1 2 3 4 5 |$(true)\n6 7 1\n.Words\nW1@1,1:\n{明}天/好{朋友}\nW2@1,1:\nABCD';
  const song=parseSong(original);
  const draft=lyricRowDraft(song,2);
  assert.deepEqual(draft.ids,[0,1,2,3,4]);
  const updated=setLyricRow(original,draft.ids,'明天春夏秋');
  const result=parseSong(updated.source);
  assert.deepEqual(result.notes.map(n=>result.lyrics.get(n.id)?.text??''),
    ['明','天','春','夏','秋','','','']);
  assert.equal(updated.source.split('.Voice')[1].split('.Words')[0],
    original.split('.Voice')[1].split('.Words')[0]);
  assert.match(updated.source,/W2@1,1:\nABCD/);
  assert.deepEqual(parseLyricRowInput('中文ABC，/日'),['中','文','A','B','C，','','日'].map(t=>t||'/'));
  assert.deepEqual(parseLyricRowInput('你{朋友}好'),['你','朋友','好']);
  assert.throws(()=>setLyricRow(original,draft.ids,'七个字符超出了长度'),/只有 5 个音符/);
  assert.throws(()=>parseLyricRowInput('{未闭合'),/未闭合/);
  assert.equal(parseSong(original).lyrics.get(2)?.skip,true,'original is unmodified');
});

test('lyrics after selected note are preserved when the untouched row is saved',()=>{
  const original='.Voice\n1 2 3 4 |$(true)\n5 6\n.Words\nW1@1,1:\n天地人和春夏';
  const song=parseSong(original),draft=lyricRowDraft(song,2);
  assert.equal(draft.value,'天地人和');
  assert.equal(draft.caret,3);
  const result=setLyricRow(original,draft.ids,draft.value);
  assert.deepEqual(parseSong(result.source).notes.map(n=>parseSong(result.source).lyrics.get(n.id)?.text),
    Array.from('天地人和春夏'));
});

test('lyric row editor removes trailing generated skips, not structural gaps before later lyrics',()=>{
  const firstRow='1 2 3 4 5 6 7 1 2 3 4 5';
  const prefix='.Voice\n'+firstRow+' |$(true)\n6 7\n.Words\nW1@1,1:\n';
  const skipToEnd='/' .repeat(9);
  const alone=parseSong(prefix+'//春'+skipToEnd);
  const start=lyricRowDraft(alone,2);
  assert.equal(start.value,'//春','no right-side slash placeholders when remaining notes have no words');
  assert.equal(start.caret,3,'cursor stays immediately after the selected lyric');
  assert.deepEqual(start.ids,Array.from({length:12},(_,i)=>i));
  const mid=lyricRowDraft(alone,5);
  assert.equal(mid.value,'//春//','only missing slots before the selected blank note are padded');
  assert.equal(mid.caret,5);
  assert.equal(mid.selectionEnd,5,'the empty selected note has no trailing slash to select');
  const blank=lyricRowDraft(parseSong(prefix+'//'+('/'.repeat(10))),2);
  assert.equal(blank.value,'//','a blank third slot does not force extra right-hand placeholders');
  const later=parseSong(prefix+'//春'+skipToEnd+'月');
  const untilReal=lyricRowDraft(later,2);
  assert.equal(untilReal.value,'//春','next row lyrics do not force trailing placeholders in this row');
  const edited=setLyricRow(prefix+'//春'+skipToEnd+'月',untilReal.ids,'//夏秋');
  const song=parseSong(edited.source);
  assert.equal(song.lyrics.get(2)?.text,'夏');
  assert.equal(song.lyrics.get(3)?.text,'秋');
  assert.equal(song.lyrics.get(12)?.text,'月','words in another row retain original alignment');
  const after=lyricRowDraft(song,2);
  assert.equal(after.value,'//夏秋','reentering the editor does not expose trailing alignment skips');
});


test('new library names recognize explicit key syntax and otherwise inherit current key',()=>{
  assert.deepEqual(parseLibrarySongName('一生所爱 D调','C'),{title:'一生所爱',key:'D',recognized:true});
  assert.deepEqual(parseLibrarySongName('《新歌》 1=#F','C'),{title:'新歌',key:'#F',recognized:true});
  assert.deepEqual(parseLibrarySongName('故乡 （bB调）','D'),{title:'故乡',key:'bB',recognized:true});
  assert.deepEqual(parseLibrarySongName('你好世界','E'),{title:'你好世界',key:'E',recognized:false});
  assert.deepEqual(parseLibrarySongName('唱歌 X调','G'),{title:'唱歌 X调',key:'G',recognized:false});
  assert.throws(()=>parseLibrarySongName('   '),/不能为空/);
  const created=newLibrarySongSource('新歌','#F','3/4');
  assert.equal(parseSong(created).title,'新歌');
  assert.equal(parseSong(created).key,'#F');
  assert.equal(parseSong(created).meter,'3/4');
  const updated=renameSongSourceTitle('.Title\nTitle = 旧名\nKeyAndMeters = {1=D,3/4}\n.Voice\n1','新名');
  assert.match(updated,/^Title = 新名$/m);
  assert.match(updated,/^KeyAndMeters = \{1=D,3\/4\}$/m);
  assert.match(updated,/\.Voice\n1$/);
});

test('copy selected source symbols across rows preserves bars, breaks and spacers',()=>{
  const original='.Title\nTitle = Demo\nKeyAndMeters = {1=D,3/4}\n.Voice\n1_ y40 | 2- $(true)\n3___ 4 |$(true)\n5\n.Words\nW1@1,1:\n你好世界啊';
  const result=copyVoiceSelection(original,new Set([0,1,2,3]));
  assert.equal(result.noteCount,4);
  assert.match(result.text,/1_ y40 \| 2- \$\(true\)\n3___ 4/);
  assert.equal(result.text.includes('W1@'),false,'copy never includes metadata or .Words');
  const pasted=pasteVoiceSelection(original,result.text,{kind:'note',index:4});
  const changed=parseSong(pasted.source);
  assert.equal(changed.notes.length,9);
  assert.deepEqual(changed.notes.slice(5).map(n=>n.raw),['1_','2-','3___','4']);
  assert.equal(changed.elements.filter(e=>e.kind==='break').length,3);
  assert.equal(changed.elements.filter(e=>e.kind==='spacer').length,2);
  assert.equal(pasted.source.slice(0,original.indexOf('.Voice')),original.slice(0,original.indexOf('.Voice')));
  assert.equal(pasted.source.split('.Words')[1],original.split('.Words')[1]);
  assert.match(pasted.source,/5 1_ y40 \| 2- \$\(true\)\n3___ 4 /);
});

test('non-contiguous selections copy only selected note symbols; selected bars copy raw tokens',()=>{
  const src='.Voice\n1 2 | 3 $(true)\n4 5';
  const clip=copyVoiceSelection(src,new Set([0,2,4]));
  assert.equal(clip.text,'1 3 5');
  const bar=copyVoiceSelection(src,new Set(),{kind:'bar',index:0});
  assert.equal(bar.text,'|');
  const updated=pasteVoiceSelection(src,bar.text,{kind:'note',index:0});
  assert.equal(parseSong(updated.source).elements.filter(e=>e.kind==='bar').length,2);
  const split=copyVoiceSelection(src,new Set(),{kind:'break',index:0});
  assert.equal(split.text,'$(true)');
  assert.equal(parseSong(pasteVoiceSelection(src,split.text,{kind:'note',index:4}).source)
    .elements.filter(e=>e.kind==='break').length,2);
  for(const invalid of ['.Words\nW1@1,1:\n破坏','<script>alert(1)</script>','9','@@@']){
    assert.throws(()=>pasteVoiceSelection(src,invalid,{kind:'note',index:1}),/只允许|非音符/);
  }
});


test('copying complete or partial slur phrases preserves only balanced source notation',()=>{
  const source='.Voice\n(1_ 2_ (3 4)) 5 |$(true)\n6';
  const selected=copyVoiceSelection(source,new Set([0,1,2,3]));
  assert.equal(selected.text,'(1_ 2_ (3 4))');
  const pasted=pasteVoiceSelection(source,selected.text,{kind:'note',index:5});
  const parsed=parseSong(pasted.source);
  assert.equal(parsed.notes.length,10);
  assert.equal(parsed.slurs.length,4,'both original and copied slurs are retained');
  const partial=copyVoiceSelection(source,new Set([1,2,3]));
  assert.equal(partial.text,'2_ (3 4)','an incomplete outer slur is not copied');
  assert.equal(parseSong('.Voice\n'+partial.text).slurs.length,1);
});
