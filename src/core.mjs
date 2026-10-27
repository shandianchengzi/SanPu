// SanPu core engine
/** SanPu: small, lossless JPW-ABC reader for free-rhythm numbered notation. */
export const EXAMPLE = `// ************** JPW-ABC File Ver 1.0 (for JP-Word v5.50m) **************
.Title
Title = 一生所爱
KeyAndMeters = {1=G,3/4}
WordsByAndMusicBy =
.Voice
3,_ 3, |#4,_ #4, |5,_ 5, 5,_ 6, 7,_ 3,-- |3,_ 3, #4,_ #4, 5,_ 5,  6,_ 2 7,- |$(true)
1_ 7,_ 6,_ 5,_ 6, #4,- | 5, 6,_ 7,. y y10| y y y y15 1_ 7,_ 6,_ 5,_ 6, #4,... y y y y | 3, 2,_ 3,-         | $(true)
3_ 2_ 3- | 5 3_ 2  7,-    y y y y y y y40| y y y y35 7, 2_ 3- |5,_ 5, 6,_ 7,_ 2_ 7,- y30|$(true)
3_ 2_ 3- |5 6_ 3 2- 2_ 7,-| y y y y35 3, 5,_ 7, 6,- 6,_ 5,-| 3, 2,_ 3,- |$(true)
           
.Words

W1@1,1:
从前，现在,过去了再不来，红红落叶，长埋尘土里。
开始终结总是没变改，天边的你飘泊白云外。
{1.[苦]}海/ 翻起爱恨， 在世间 难逃避命/运。
相亲/ 竟不可/接近,或我应该相信是缘份。
`;
// Entries are separate from the editor state: adding another example only
// requires appending an id/title/source entry here.
export const EXAMPLES = Object.freeze([
  Object.freeze({id:'yi-sheng-suo-ai',title:'一生所爱',description:'1=G · 散板 · 四行完整示例',source:EXAMPLE})
]);
const NOTE = /^([#b]{0,2})([0-7])([,']*)(_+\.*|\.+_+|-+|\.+)?/;
// ABC's y is a layout-only spacer; SanPu extends .Voice with y or y<number>.
// Widths use SVG user units (not musical beats) and are bounded to avoid
// accidental enormous documents. Adjacent y marks may also be repeated.
export const DEFAULT_SPACER_WIDTH = 20;
export const MAX_SPACER_WIDTH = 2000;
const SPACER = /^y(\d+)?(?=$|[\s|$:y])/;
const BARS = ['|:', ':|:', ':|', '||', '|]', '[|]', '|'];
export function durationFromSuffix(s='') {
  if (!s) return 1;
  if (s.startsWith('-')) return 1 + s.length;
  if (s.includes('_')) {
    const n = (s.match(/_/g) || []).length;
    const dots = (s.match(/\./g) || []).length;
    return Math.pow(2, -n) * (2 - Math.pow(2, -dots));
  }
  if (s[0] === '.') return 2 - Math.pow(2, -s.length);
  return 1;
}
function readVoice(body, warnings) {
  const notes = [], elements = [], measures = new Map();
  let measure = 1, noteIndex = 0, row = 0, p = 0;
  const addRow = () => {
    if (elements.length && elements.at(-1)?.kind !== 'break') { elements.push({kind:'break', row}); row++; }
  };
  while (p < body.length) {
    const remain = body.slice(p);
    if (remain.startsWith('//')) { const n = remain.indexOf('\n'); p += n < 0 ? remain.length : n; continue; }
    const br = remain.match(/^\$\([^)]*\)|^\$/);
    if (br) { addRow(); p += br[0].length; continue; }
    if (/^\s/.test(remain)) { if (remain[0] === '\n' && elements.at(-1)?.kind !== 'break' && !remain.slice(0,remain.indexOf('\n')).trim()) { /* Explicit JP-Word $ controls row breaks. */ } p++; continue; }
    const bar = BARS.find(b => remain.startsWith(b));
    if (bar) {
      const item = {kind:'bar', raw:bar, measure, row};
      elements.push(item); measure++; noteIndex=0; p+=bar.length; continue;
    }
    const spacer = SPACER.exec(remain);
    if (spacer) {
      const amount=spacer[1]===undefined?DEFAULT_SPACER_WIDTH:Number(spacer[1]);
      const width=Math.min(MAX_SPACER_WIDTH,amount);
      if(amount>MAX_SPACER_WIDTH)
        warnings.push(`排版空位「${spacer[0]}」过宽，已限制为 ${MAX_SPACER_WIDTH}。`);
      elements.push({kind:'spacer',raw:spacer[0],width,measure,row});
      p+=spacer[0].length;
      continue;
    }
    const m = NOTE.exec(remain);
    if (m && m[0]) {
      const raw = m[0], suffix = m[4] || '';
      const octave = [...m[3]].reduce((n,c)=>n+(c === "'" ? 1 : -1),0);
      const note = {kind:'note', raw, degree:Number(m[2]), accidental:m[1], octave, suffix, beats:durationFromSuffix(suffix), measure, noteIndex:++noteIndex, row, id:notes.length, sourceStart:p, sourceEnd:p+raw.length};
      notes.push(note); elements.push(note);
      measures.set(measure,(measures.get(measure)||0)+note.beats);
      p += raw.length; continue;
    }
    const unknown = remain.match(/^[^\s|$]+/)?.[0] || remain[0];
    warnings.push(`未识别的谱面符号「${unknown.slice(0,20)}」：已跳过预览，原文仍被保留。`);
    p += unknown.length;
  }
  return {notes,elements,measures};
}
// Split display-only punctuation from a lyric without changing its stored text or
// its note-to-lyric correspondence. Opening quotation marks remain to the left;
// ending punctuation is drawn to the right of the centered lyric body.
export function splitLyricPunctuation(text) {
  const glyphs=Array.from(String(text??''));
  const punctuation='，。；！？：、,.!?;:”“‘’…';
  let start=0,end=glyphs.length;
  while(start<end && punctuation.includes(glyphs[start]))start++;
  while(end>start && punctuation.includes(glyphs[end-1]))end--;
  // A punctuation-only lyric has no body to anchor to; keep it centered.
  if(start===end)return {main:glyphs.join(''),prefix:'',suffix:''};
  return {
    main:glyphs.slice(start,end).join(''),
    prefix:glyphs.slice(0,start).join(''),
    suffix:glyphs.slice(end).join('')
  };
}
function lyricItems(raw) {
  const result=[]; let previous=null, prePunct='';
  const push = text => { const item={text:prePunct+text, skip:false}; prePunct='';result.push(item); previous=item; };
  const punctuation = '，。；！？：、,.!?;:”“‘’…';
  for (let i=0; i<raw.length;) {
    const ch=raw[i];
    if (ch==='{' && raw.indexOf('}',i+1)!==-1) {
      const end=raw.indexOf('}',i+1);
      const inner=raw.slice(i+1,end);
      const match=/^\d+\.\[(.*?)\]$/.exec(inner);
      push(match ? match[1] : inner);i=end+1;continue;
    }
    if (ch==='/') {result.push({text:'',skip:true});i++;continue;}
    if (/\s/.test(ch) || ch==='-' || ch==='(' || ch===')') {i++;continue;}
    if (punctuation.includes(ch)) {
      if (previous) previous.text+=ch;
      else prePunct+=ch;
      i++;continue;
    }
    if (/[A-Za-z]/.test(ch)) {
      let j=i+1;while(j<raw.length && /[A-Za-z]/.test(raw[j])) j++;
      push(raw.slice(i,j));i=j;continue;
    }
    const cp=raw.codePointAt(i);const glyph=String.fromCodePoint(cp);
    push(glyph);i+=glyph.length;
  }
  return result;
}
function readWords(body, notes, warnings) {
  const segments=[];
  for (const line of body.split(/\r?\n/)) {
    const m=/^\s*W(\d+)(?:-\d+)?(?:\([^)]*\))?(?:@(\d+),(\d+))?(?:\([^)]*\))?:\s*(.*)$/.exec(line);
    if (m) segments.push({verse:Number(m[1]),measure:Number(m[2]||1),index:Number(m[3]||1),raw:m[4]});
    else if (segments.length) segments.at(-1).raw += '\n'+line;
  }
  const lyrics=new Map();
  for (const s of segments) {
    if (s.verse!==1) continue;
    const begin=notes.findIndex(n=>n.measure===s.measure && n.noteIndex===s.index);
    if (begin<0) {warnings.push(`歌词起点 W${s.verse}@${s.measure},${s.index} 不对应任何音符。`); continue;}
    const items=lyricItems(s.raw);
    for (let i=0;i<items.length;i++) {
      if (notes[begin+i]) lyrics.set(notes[begin+i].id,items[i]);
      else {warnings.push('歌词比音符更多，末尾的歌词没有对应音符。');break;}
    }
  }
  return {segments,lyrics};
}
export function parseSong(source) {
  const raw=String(source ?? '');
  const sections=new Map();let section='';
  for (const line of raw.replace(/\r\n/g,'\n').split('\n')) {
    const m=/^\s*\.(Title|Voice|Words|Layout|Repeat)\s*$/.exec(line);
    if (m) {section=m[1]; if(!sections.has(section))sections.set(section,[]);continue;}
    if (section) sections.get(section).push(line);
  }
  const warnings=[];
  const titleBlock=(sections.get('Title')||[]).join('\n');
  const title=/^Title\s*=\s*(.*)$/m.exec(titleBlock)?.[1]?.trim() || '未命名旋律';
  const km=/^KeyAndMeters\s*=\s*\{\s*1\s*=\s*([^,}]+)(?:,\s*([^}]+))?\}/m.exec(titleBlock);
  const key=km?.[1]?.trim() || 'C',meter=km?.[2]?.trim() || '';
  const voice=readVoice((sections.get('Voice')||[]).join('\n'),warnings);
  const words=readWords((sections.get('Words')||[]).join('\n'),voice.notes,warnings);
  if (!sections.has('Voice')) warnings.push('缺少 .Voice 音符段。');
  if (!voice.notes.length) warnings.push('未识别到可播放的音符。');
  return {raw,title,key,meter,notes:voice.notes,elements:voice.elements,measures:voice.measures,lyrics:words.lyrics,segments:words.segments,warnings};
}
const MAJOR=[0,2,4,5,7,9,11];
const ROOT={C:0,'#C':1,bD:1,D:2,'#D':3,bE:3,E:4,F:5,'#F':6,bG:6,G:7,'#G':8,bA:8,A:9,'#A':10,bB:10,B:11};
export function noteFrequency(note,key='C') {
  if (note.degree===0) return 0;
  const semitone=(ROOT[key]??0)+MAJOR[note.degree-1]+note.octave*12+(note.accidental.includes('#')?1:0)+(note.accidental.includes('b')?-1:0);
  const midi=60+semitone;
  return 440 * Math.pow(2,(midi-69)/12);
}
export function beatReport(song) {
  const m=/^(\d+)\s*\/\s*(\d+)$/.exec(song.meter);
  if (!m) return [];
  const target=Number(m[1])*4/Number(m[2]);
  return [...song.measures].map(([index,beats])=>({index,beats,target,unequal:Math.abs(beats-target)>1e-6}));
}

/** Transpose the virtual keyboard upward from its C reference to the score tonic.
 * C4 (MIDI 60) becomes D4 (62) for KeyAndMeters = {1=D,...}.
 * When disabled, virtual keys retain their original absolute pitches.
 */
export function pianoKeyMidi(midi,key='C',transpose=false){
  if(!Number.isInteger(midi)||midi<21||midi>108)return null;
  const shifted=midi+(transpose?(ROOT[key]??0):0);
  return shifted>=21&&shifted<=108?shifted:null;
}
/** Chromatic piano pitches are converted relative to the active major-key tonic. */
const CHROMATIC_DEGREES=Object.freeze(['1','#1','2','b3','3','4','#4','5','b6','6','b7','7']);
export function pianoToNotation(midi,key='C'){
  if(!Number.isInteger(midi)||midi<21||midi>108)return null;
  const semitones=midi-(60+(ROOT[key]??0));
  const octave=Math.floor(semitones/12);
  const pitch=((semitones%12)+12)%12;
  return CHROMATIC_DEGREES[pitch]+(octave<0?','.repeat(-octave):"'".repeat(octave));
}
const PIANO_BEATS=Object.freeze([
  [0.125,'___'],[0.25,'__'],[0.375,'__.'],[0.5,'_'],[0.75,'_.'],
  [1,''],[1.5,'.'],[2,'-'],[3,'--'],[4,'---'],
  [5,'----'],[6,'-----'],[7,'------'],[8,'-------']
]);
/** Map how long a key was held onto the nearest notatable beat length. */
export function pianoDurationSuffix(holdMs,tempo=72){
  const ms=Math.max(0,Number(holdMs)||0);
  const bpm=Math.max(35,Math.min(180,Number(tempo)||72));
  const beats=ms*bpm/60000;
  let nearest=PIANO_BEATS[0];
  for(const option of PIANO_BEATS)
    if(Math.abs(option[0]-beats)<Math.abs(nearest[0]-beats))nearest=option;
  return nearest[1];
}
/** Insert by parsed note index, not by matching raw note text, preserving the
 * exact lyrics, bars, empty layout spacers, source line endings and spacing.
 */
export function insertPianoNote(source,token,afterId=-1,caret=-1){
  const text=String(source??'');
  if(!/^(?:#{0,2}|b{0,2})[1-7][,']*(?:_+\.*|\.+_+|-+|\.+)?$/.test(token))return null;
  const headings=[...text.matchAll(/^[ \t]*\.(Title|Voice|Words|Layout|Repeat)[ \t]*\r?$/gm)];
  const voiceIndex=headings.findIndex(h=>h[1]==='Voice');
  if(voiceIndex<0)return null;
  const header=headings[voiceIndex];
  const begin=header.index+header[0].length;
  const end=headings[voiceIndex+1]?.index??text.length;
  const voice=text.slice(begin,end);
  const notes=readVoice(voice,[]).notes;
  let chosen=Number.isInteger(afterId)&&afterId>=0?notes[afterId]:null;
  if(!chosen&&Number.isInteger(caret)&&caret>begin&&caret<=end)
    chosen=notes.filter(n=>n.sourceEnd<=caret-begin).at(-1)??null;
  if(!chosen)chosen=notes.at(-1)??null;
  const at=chosen?begin+chosen.sourceEnd:begin+(voice.match(/^\r?\n/)?.[0].length??0);
  // A newly created .Voice must keep the following .Words/.Title header on its own line.
  const inserted=chosen?' '+token+' ':token+(text.slice(at).startsWith('.')?'\n':' ');
  return {source:text.slice(0,at)+inserted+text.slice(at),
    noteId:chosen?chosen.id+1:0,caret:at+inserted.length};
}

// Rewrite only the duration marker of a piano-inserted note. A guard against
// the original raw token prevents touching a note changed manually meanwhile.
export function revisePianoNoteDuration(source,noteId,expectedRaw,suffix){
  const text=String(source??'');
  const headings=[...text.matchAll(/^[ \t]*\.(Title|Voice|Words|Layout|Repeat)[ \t]*\r?$/gm)];
  const index=headings.findIndex(h=>h[1]==='Voice');
  if(index<0||!Number.isInteger(noteId)||noteId<0)return null;
  const begin=headings[index].index+headings[index][0].length;
  const end=headings[index+1]?.index??text.length;
  const note=readVoice(text.slice(begin,end),[]).notes[noteId];
  if(!note||note.raw!==expectedRaw)return null;
  const pitch=/^([#b]{0,2}[1-7][,']*)/.exec(note.raw)?.[1];
  if(!pitch||!PIANO_BEATS.some(option=>option[1]===suffix))return null;
  const raw=pitch+suffix;
  const from=begin+note.sourceStart,to=begin+note.sourceEnd;
  return {source:text.slice(0,from)+raw+text.slice(to),raw,noteId,
    from,to,delta:raw.length-note.raw.length};
}

// Source-editor caret after the exact indexed note, even with duplicate notes.
export function noteSourceCaret(source,noteId){
  if(!Number.isInteger(noteId)||noteId<0)return null;
  const text=String(source??'');
  const headings=[...text.matchAll(/^[ \t]*\.(Title|Voice|Words|Layout|Repeat)[ \t]*\r?$/gm)];
  const voiceIndex=headings.findIndex(h=>h[1]==='Voice');
  if(voiceIndex<0)return null;
  const begin=headings[voiceIndex].index+headings[voiceIndex][0].length;
  const end=headings[voiceIndex+1]?.index??text.length;
  const note=readVoice(text.slice(begin,end),[]).notes[noteId];
  return note?begin+note.sourceEnd:null;
}
