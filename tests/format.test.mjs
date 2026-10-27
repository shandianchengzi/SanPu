import test from 'node:test';
import assert from 'node:assert/strict';
import {FORMAT_FIELDS,DEFAULT_FORMAT,FORMAT_PRESETS,FONTS,normalizeFormat,formatPresetId} from '../src/format.mjs';

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
  assert.equal(DEFAULT_FORMAT.metaSize,33);
  assert.equal(DEFAULT_FORMAT.tempoSize,26);
  const newLayout=normalizeFormat({metaSize:52,tempoSize:24,tempoWeight:'700'});
  assert.equal(newLayout.metaSize,52);
  assert.equal(newLayout.tempoSize,24);
  assert.equal(newLayout.tempoWeight,'700');
  const oldLayout=normalizeFormat({metaSize:52});
  assert.equal(oldLayout.metaSize,52);
  assert.equal(oldLayout.tempoSize,41.6);
  assert.equal(normalizeFormat({tempoSize:-100}).tempoSize,14);
  assert.equal(normalizeFormat({tempoSize:10000}).tempoSize,64);
  assert.equal(FORMAT_PRESETS.compact.tempoSize,21);
  assert.equal(FORMAT_PRESETS.spacious.tempoSize,32);
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
    assert.equal(DEFAULT_FORMAT[key],0);
    assert.ok(fields[key].min<0);
    assert.ok(fields[key].max>0);
    assert.equal(normalizeFormat({[key]:-22})[key],-22);
    assert.equal(normalizeFormat({[key]:55})[key],55);
    assert.equal(normalizeFormat({[key]:-10000})[key],fields[key].min);
    assert.equal(normalizeFormat({[key]:10000})[key],fields[key].max);
    assert.equal(normalizeFormat({[key]:'not a number'})[key],0);
  }
  const settings=normalizeFormat({highOctaveDotOffset:31,lowOctaveDotOffset:-17,octaveDotSize:4.5});
  assert.equal(settings.highOctaveDotOffset,31);
  assert.equal(settings.lowOctaveDotOffset,-17);
  assert.equal(settings.octaveDotSize,4.5);
  assert.equal(normalizeFormat({noteSize:50}).highOctaveDotOffset,0);
  assert.equal(normalizeFormat({noteSize:50}).lowOctaveDotOffset,0);
});

test('punctuation gap defaults to zero, accepts signed spacing and is independent of character spacing',()=>{
  assert.equal(DEFAULT_FORMAT.punctuationGap,0);
  const field=FORMAT_FIELDS.find(f=>f.key==='punctuationGap');
  assert.ok(field);
  assert.equal(field.min,-30);
  assert.equal(field.max,80);
  assert.equal(normalizeFormat({punctuationGap:-22}).punctuationGap,-22);
  assert.equal(normalizeFormat({punctuationGap:55}).punctuationGap,55);
  assert.equal(normalizeFormat({punctuationGap:-10000}).punctuationGap,-30);
  assert.equal(normalizeFormat({punctuationGap:10000}).punctuationGap,80);
  assert.equal(normalizeFormat({punctuationGap:'bad'}).punctuationGap,0);
  const f=normalizeFormat({lyricLetterSpacing:-3,punctuationGap:23});
  assert.equal(f.lyricLetterSpacing,-3);
  assert.equal(f.punctuationGap,23);
  assert.equal(normalizeFormat({lyricSize:52}).punctuationGap,0);
});
