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
  assert.equal(normalizeFormat({noteSpacing:-999}).noteSpacing,-15);
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
