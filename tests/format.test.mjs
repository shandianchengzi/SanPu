import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FORMAT_FIELDS,DEFAULT_FORMAT,FORMAT_PRESETS,FONTS,normalizeFormat,formatPresetId,exportStyle,importStyle,STYLE_FILE_TYPE,STYLE_FILE_VERSION} from '../src/format.mjs';

test('appearance options have unique keys and usable values',()=>{
  const keys=FORMAT_FIELDS.map(f=>f.key);
  assert.equal(new Set(keys).size,keys.length);
  assert.ok(keys.length>=25);
  for(const field of FORMAT_FIELDS){
    assert.ok(field.choices?.some(([value])=>value===field.default) || (
      Number.isFinite(field.default) && field.default>=field.min && field.default<=field.max
    ),field.key);
  }
});

test('saved appearance is normalized without losing unrelated defaults',()=>{
  const formatted=normalizeFormat({titleSize:82,lyricSize:19,noteSpacing:16});
  assert.equal(formatted.titleSize,82);
  assert.equal(formatted.lyricSize,19);
  assert.equal(formatted.noteSpacing,16);
  assert.equal(formatted.metaSize,DEFAULT_FORMAT.metaSize);
  assert.equal(normalizeFormat({titleSize:99999}).titleSize,100);
  assert.equal(normalizeFormat({noteSpacing:-999}).noteSpacing,-35);
  assert.equal(normalizeFormat({lyricSize:'bad'}).lyricSize,DEFAULT_FORMAT.lyricSize);
  assert.equal(normalizeFormat({noteFont:'malicious-value'}).noteFont,DEFAULT_FORMAT.noteFont);
  assert.equal(normalizeFormat(null).noteSize,DEFAULT_FORMAT.noteSize);
});

test('presets are distinct, recognized, and fonts are whitelisted',()=>{
  assert.equal(formatPresetId(DEFAULT_FORMAT),'standard');
  assert.equal(formatPresetId(FORMAT_PRESETS.compact),'compact');
  assert.equal(formatPresetId(FORMAT_PRESETS.spacious),'spacious');
  assert.equal(formatPresetId({...DEFAULT_FORMAT,noteSize:44}),'custom');
  assert.deepEqual(Object.keys(FONTS).sort(),['kai','sans','serif']);
});

test('tonic and tempo sizes are independent and old local settings keep their appearance',()=>{
  assert.equal(DEFAULT_FORMAT.metaSize,21);
  assert.equal(DEFAULT_FORMAT.tempoSize,21);
  const newLayout=normalizeFormat({metaSize:52,tempoSize:24,tempoWeight:'700'});
  assert.equal(newLayout.metaSize,52);
  assert.equal(newLayout.tempoSize,24);
  assert.equal(newLayout.tempoWeight,'700');
  const oldLayout=normalizeFormat({metaSize:52});
  assert.equal(oldLayout.metaSize,52);
  assert.equal(oldLayout.tempoSize,41.6);
  assert.equal(normalizeFormat({tempoSize:-100}).tempoSize,14);
  assert.equal(normalizeFormat({tempoSize:10000}).tempoSize,64);
  assert.equal(FORMAT_PRESETS.compact.tempoSize,18);
  assert.equal(FORMAT_PRESETS.spacious.tempoSize,25);
});

test('signed spacing options accept and persist negative values',()=>{
  const signed=['titleLetterSpacing','titleBottomGap','metaGap','metaBottomGap',
    'lyricLetterSpacing','lyricOffset','noteSpacing','systemGap','lyricLineGap'];
  const fields=Object.fromEntries(FORMAT_FIELDS.map(field=>[field.key,field]));
  for(const key of signed){
    assert.ok(fields[key].min<0,`${key} should allow negative slider and number input`);
    const value=fields[key].min+1;
    assert.equal(normalizeFormat({[key]:String(value)})[key],value,key);
    assert.equal(normalizeFormat({[key]:-99999})[key],fields[key].min,key);
  }
  const configured=normalizeFormat({systemGap:-22,lyricLineGap:-80,lyricOffset:-30,
    metaGap:-20,titleBottomGap:-18,lyricLetterSpacing:-2});
  assert.equal(configured.systemGap,-22);
  assert.equal(configured.lyricLineGap,-80);
  assert.equal(configured.lyricOffset,-30);
  assert.equal(configured.metaGap,-20);
  assert.equal(configured.titleBottomGap,-18);
  assert.equal(configured.lyricLetterSpacing,-2);
  assert.equal(DEFAULT_FORMAT.lyricLineGap,0);
  assert.equal(normalizeFormat(null).lyricLineGap,0);
  assert.ok(FORMAT_PRESETS.compact.lyricLineGap===0);
  // Structural dimensions cannot be negative.
  for(const key of ['noteSize','lyricSize','dashSpacing','barSpacing','printMarginX','printMarginY']){
    assert.ok(fields[key].min>=0,key);
  }
});

test('octave dot offsets are independent, signed, bounded, and default to legacy geometry',()=>{
  const fields=Object.fromEntries(FORMAT_FIELDS.map(field=>[field.key,field]));
  for(const key of ['highOctaveDotOffset','lowOctaveDotOffset']){
    assert.equal(DEFAULT_FORMAT[key],key==='lowOctaveDotOffset'?-13:0);
    assert.ok(fields[key].min<0);
    assert.ok(fields[key].max>0);
    assert.equal(normalizeFormat({[key]:-22})[key],-22);
    assert.equal(normalizeFormat({[key]:55})[key],55);
    assert.equal(normalizeFormat({[key]:-10000})[key],fields[key].min);
    assert.equal(normalizeFormat({[key]:10000})[key],fields[key].max);
    assert.equal(normalizeFormat({[key]:'not a number'})[key],DEFAULT_FORMAT[key]);
  }
  const settings=normalizeFormat({highOctaveDotOffset:31,lowOctaveDotOffset:-17,octaveDotSize:4.5});
  assert.equal(settings.highOctaveDotOffset,31);
  assert.equal(settings.lowOctaveDotOffset,-17);
  assert.equal(settings.octaveDotSize,4.5);
  assert.equal(normalizeFormat({noteSize:50}).highOctaveDotOffset,0);
  assert.equal(normalizeFormat({noteSize:50}).lowOctaveDotOffset,-13);
});

test('punctuation gap defaults to zero, accepts signed spacing and is independent of character spacing',()=>{
  assert.equal(DEFAULT_FORMAT.punctuationGap,2);
  const field=FORMAT_FIELDS.find(f=>f.key==='punctuationGap');
  assert.ok(field);
  assert.equal(field.min,-30);
  assert.equal(field.max,80);
  assert.equal(normalizeFormat({punctuationGap:-22}).punctuationGap,-22);
  assert.equal(normalizeFormat({punctuationGap:55}).punctuationGap,55);
  assert.equal(normalizeFormat({punctuationGap:-10000}).punctuationGap,-30);
  assert.equal(normalizeFormat({punctuationGap:10000}).punctuationGap,80);
  assert.equal(normalizeFormat({punctuationGap:'bad'}).punctuationGap,2);
  const f=normalizeFormat({lyricLetterSpacing:-3,punctuationGap:23});
  assert.equal(f.lyricLetterSpacing,-3);
  assert.equal(f.punctuationGap,23);
  assert.equal(normalizeFormat({lyricSize:52}).punctuationGap,2);
});

test('portable score-style export roundtrips all appearance fields without song or playback data',()=>{
  const custom=normalizeFormat({
    ...DEFAULT_FORMAT,transcriberSize:31,transcriberFont:'kai',creditSize:28,creditFont:'serif',lyricSize:52,noteSpacing:-32,punctuationGap:-15,
    highOctaveDotOffset:37,lowOctaveDotOffset:-21,printMarginX:25
  });
  const json=exportStyle(custom);
  const data=JSON.parse(json);
  assert.equal(data.type,STYLE_FILE_TYPE);
  assert.equal(data.version,STYLE_FILE_VERSION);
  assert.deepEqual(Object.keys(data).sort(),['settings','type','version']);
  assert.deepEqual(Object.keys(data.settings).sort(),FORMAT_FIELDS.map(f=>f.key).sort());
  assert.deepEqual(importStyle(json),custom);
  assert.equal(data.settings.punctuationGap,-15);
  assert.equal(data.settings.lowOctaveDotOffset,-21);
  assert.ok(!json.includes('"source"'));
  assert.ok(!json.includes('"tempo"'));
  assert.ok(!json.includes('"timbre"'));
  assert.ok(!json.includes('"zoom"'));
  assert.ok(json.endsWith('\n'));
});

test('style imports validate file format, version, settings, and clamp unknown values',()=>{
  assert.throws(()=>importStyle('not json'),/有效的 JSON/);
  assert.throws(()=>importStyle('[]'),/不是 SanPu/);
  assert.throws(()=>importStyle(JSON.stringify({type:'other',version:1,settings:{noteSize:33}})),/不是 SanPu/);
  assert.throws(()=>importStyle(JSON.stringify({type:STYLE_FILE_TYPE,version:999,settings:{noteSize:33}})),/不支持/);
  assert.throws(()=>importStyle(JSON.stringify({type:STYLE_FILE_TYPE,version:1,settings:[]})),/settings/);
  assert.throws(()=>importStyle(JSON.stringify({type:STYLE_FILE_TYPE,version:1,settings:{foreign:3}})),/可识别/);
  const imported=importStyle(JSON.stringify({
    type:STYLE_FILE_TYPE,version:1,
    settings:{noteSize:10000,lyricLineGap:-999,lyricFont:'invalid',foreign:'ignore'}
  }));
  assert.equal(imported.noteSize,80);
  assert.equal(imported.lyricLineGap,-160);
  assert.equal(imported.lyricFont,DEFAULT_FORMAT.lyricFont);
  assert.equal(Object.keys(imported).length,FORMAT_FIELDS.length);
  assert.equal('foreign' in imported,false);
  assert.equal(imported.punctuationGap,2,'legacy styles receive missing defaults');
});

test('the built-in standard preset matches the supplied SanPu appearance JSON exactly',()=>{
  const saved=JSON.parse(readFileSync(new URL('../examples/standard.sanpu-style.json',import.meta.url),'utf8'));
  assert.deepEqual(DEFAULT_FORMAT,saved.settings);
  assert.deepEqual(importStyle(JSON.stringify(saved)),DEFAULT_FORMAT);
  for(const key of ['titleFont','metaFont','noteFont','lyricFont','lowOctaveDotOffset','punctuationGap']){
    assert.equal(FORMAT_PRESETS.compact[key],DEFAULT_FORMAT[key]);
    assert.equal(FORMAT_PRESETS.spacious[key],DEFAULT_FORMAT[key]);
  }
  assert.ok(FORMAT_PRESETS.compact.noteSize<DEFAULT_FORMAT.noteSize);
  assert.ok(FORMAT_PRESETS.compact.lyricSize<DEFAULT_FORMAT.lyricSize);
  assert.ok(FORMAT_PRESETS.spacious.noteSize>DEFAULT_FORMAT.noteSize);
  assert.ok(FORMAT_PRESETS.spacious.lyricSize>DEFAULT_FORMAT.lyricSize);
});

test('accidental and duration-dot spacing are signed, independent and portable',()=>{
  const fields=Object.fromEntries(FORMAT_FIELDS.map(field=>[field.key,field]));
  for(const key of ['accidentalGap','durationDotGap']){
    assert.equal(DEFAULT_FORMAT[key],0);
    assert.equal(fields[key].min,-25);
    assert.equal(fields[key].max,70);
    assert.equal(normalizeFormat({[key]:-11})[key],-11);
    assert.equal(normalizeFormat({[key]:52})[key],52);
    assert.equal(normalizeFormat({[key]:-999})[key],-25);
    assert.equal(normalizeFormat({[key]:999})[key],70);
    assert.equal(normalizeFormat({[key]:'invalid'})[key],0);
    assert.equal(FORMAT_PRESETS.compact[key],0);
    assert.equal(FORMAT_PRESETS.spacious[key],0);
  }
  const appearance=normalizeFormat({
    accidentalSize:31,accidentalGap:26,durationDotGap:-8,noteSpacing:-15
  });
  assert.equal(appearance.accidentalSize,31);
  assert.equal(appearance.noteSpacing,-15);
  assert.equal(appearance.accidentalGap,26);
  assert.equal(appearance.durationDotGap,-8);
  const restored=importStyle(exportStyle(appearance));
  assert.deepEqual(restored,appearance);
  const legacy=importStyle(JSON.stringify({
    type:STYLE_FILE_TYPE,version:1,settings:{accidentalSize:27}
  }));
  assert.equal(legacy.accidentalGap,0);
  assert.equal(legacy.durationDotGap,0);
});

test('transcriber and author credit styles are bounded, independent and portable',()=>{
  const fields=Object.fromEntries(FORMAT_FIELDS.map(field=>[field.key,field]));
  assert.equal(DEFAULT_FORMAT.transcriberSize,18);
  assert.equal(DEFAULT_FORMAT.creditSize,18);
  for(const key of ['transcriberSize','creditSize']){
    assert.equal(fields[key].min,12);
    assert.equal(fields[key].max,52);
    assert.equal(normalizeFormat({[key]:-10})[key],12);
    assert.equal(normalizeFormat({[key]:1000})[key],52);
  }
  const cfg=normalizeFormat({transcriberSize:28,creditSize:33,transcriberFont:'serif',creditFont:'kai'});
  assert.equal(cfg.transcriberSize,28);
  assert.equal(cfg.creditSize,33);
  assert.equal(cfg.transcriberFont,'serif');
  assert.equal(cfg.creditFont,'kai');
  assert.deepEqual(importStyle(exportStyle(cfg)),cfg);
  assert.equal(normalizeFormat({transcriberFont:'invalid'}).transcriberFont,'sans');
});

test('extension dash offset is an independent signed and portable style',()=>{
  const field=FORMAT_FIELDS.find(f=>f.key==='dashNoteGap');
  assert.equal(field.min,-25);
  assert.equal(field.max,70);
  assert.equal(DEFAULT_FORMAT.dashNoteGap,0);
  assert.equal(normalizeFormat({dashNoteGap:18,dashSpacing:42}).dashNoteGap,18);
  assert.equal(normalizeFormat({dashNoteGap:-500}).dashNoteGap,-25);
  assert.equal(normalizeFormat({dashNoteGap:1000}).dashNoteGap,70);
  const format=normalizeFormat({dashNoteGap:24,dashSpacing:38});
  assert.deepEqual(importStyle(exportStyle(format)),format);
});

test('user supplied 36-field standard is preserved and its 7 newer fields are inherited',()=>{
  const userStyle={
    titleSize:38,titleWeight:'800',titleFont:'sans',titleLetterSpacing:6,titleBottomGap:19,
    metaSize:21,metaWeight:'400',tempoSize:21,tempoWeight:'500',metaFont:'serif',
    metaGap:9,metaBottomGap:-1,noteSize:50,noteWeight:'700',noteFont:'sans',
    accidentalSize:23,lyricSize:51,lyricWeight:'400',lyricFont:'kai',
    lyricLetterSpacing:-4,punctuationGap:2,lyricOffset:3,octaveDotSize:3.9,
    highOctaveDotOffset:0,lowOctaveDotOffset:-13,rhythmStroke:2.35,barStroke:2.9,
    noteSpacing:0,dashSpacing:29,barSpacing:24,systemGap:-5,lyricLineGap:0,
    minLineWidth:980,previewPadding:48,printMarginX:15,printMarginY:8
  };
  assert.equal(Object.keys(userStyle).length,36);
  for(const [key,value] of Object.entries(userStyle))
    assert.equal(DEFAULT_FORMAT[key],value,'user style '+key);
  assert.equal(Object.keys(DEFAULT_FORMAT).length,43);
  assert.deepEqual(importStyle(JSON.stringify({
    type:STYLE_FILE_TYPE,version:1,settings:userStyle
  })),DEFAULT_FORMAT);
});

test('density presets adapt credit glyph and line sizes without changing typography choices',()=>{
  const standard=FORMAT_PRESETS.standard;
  const compact=FORMAT_PRESETS.compact,spacious=FORMAT_PRESETS.spacious;
  for(const key of ['titleSize','metaSize','tempoSize','transcriberSize','creditSize',
    'noteSize','accidentalSize','lyricSize','octaveDotSize','rhythmStroke','barStroke',
    'dashSpacing','barSpacing','previewPadding','minLineWidth']){
    assert.ok(compact[key]<standard[key],'compact: '+key);
    assert.ok(spacious[key]>standard[key],'spacious: '+key);
  }
  for(const key of ['titleFont','metaFont','noteFont','lyricFont',
    'transcriberFont','creditFont','accidentalGap','durationDotGap','dashNoteGap',
    'lowOctaveDotOffset','highOctaveDotOffset','punctuationGap','printMarginX','printMarginY']){
    assert.equal(compact[key],standard[key],'compact keeps '+key);
    assert.equal(spacious[key],standard[key],'spacious keeps '+key);
  }
  assert.equal(compact.transcriberSize,16);
  assert.equal(spacious.transcriberSize,22);
  assert.equal(compact.creditSize,16);
  assert.equal(spacious.creditSize,22);
  assert.equal(formatPresetId(compact),'compact');
  assert.equal(formatPresetId(spacious),'spacious');
});
