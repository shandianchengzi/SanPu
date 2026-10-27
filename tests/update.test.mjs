import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeEditorState,encodeEditorState,hasNewBuild,liveSyncUrl,normalizeBuild,transferredState} from '../src/update.mjs';

test('build comparison detects a different repository commit',()=>{
  const current=normalizeBuild({version:'1.0.5',commit:'1234567890abcdef'});
  const latest=normalizeBuild({version:'1.0.6',commit:'abcdef1234567890'});
  assert.equal(current.shortCommit,'1234567');
  assert.equal(hasNewBuild(current,current),false);
  assert.equal(hasNewBuild(current,latest),true);
  assert.equal(hasNewBuild(normalizeBuild({version:'dev',commit:'development'}),latest),true);
});

test('editor state transfers to the live app in a server-private URL fragment',()=>{
  const raw=JSON.stringify({source:'.Title\nTitle = 测试曲\n.Voice\n1 2 3',tempo:88,format:{lyricSize:32}});
  const encoded=encodeEditorState(raw);
  assert.ok(encoded&&!encoded.includes('='));
  assert.equal(decodeEditorState(encoded),raw);
  const url=new URL(liveSyncUrl('abcdef1234567890',raw));
  assert.equal(url.origin,'https://shandianchengzi.github.io');
  assert.equal(url.searchParams.get('synced'),'abcdef1');
  assert.equal(url.searchParams.has('sanpu-state'),false,'score data must never enter the request query');
  assert.equal(transferredState(url.hash),raw);
});

test('malformed or oversized transferred data is rejected',()=>{
  assert.equal(encodeEditorState('not-json'),'');
  assert.equal(encodeEditorState(JSON.stringify({tempo:72})),'');
  assert.equal(decodeEditorState('not-base64'),'');
  assert.equal(transferredState('#unrelated=value'),'');
});
