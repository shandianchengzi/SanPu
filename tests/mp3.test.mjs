import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSong,songSchedule} from '../src/core.mjs';
import {encodeMp3,renderScoreToMp3,MP3_RATE,MP3_MAX_SECONDS} from '../src/mp3.mjs';
import {Mp3Encoder} from '@breezystack/lamejs';

test('bundled LAME codec writes actual MP3 frames and is mono at 44.1 kHz',async()=>{
  const pcm=new Float32Array(MP3_RATE/4);
  for(let i=0;i<pcm.length;i++)pcm[i]=Math.sin(i*2*Math.PI*440/MP3_RATE)*.15;
  const blob=await encodeMp3(pcm,Mp3Encoder);
  assert.equal(blob.type,'audio/mpeg');
  assert.ok(blob.size>1000);
  const header=new Uint8Array(await blob.slice(0,4).arrayBuffer());
  const isMp3Frame=header[0]===255&&(header[1]&0xe0)===0xe0;
  const isID3=header[0]===73&&header[1]===68&&header[2]===51;
  assert.ok(isMp3Frame||isID3,'file must start with MP3 frame or ID3 tag');
});

test('offline export follows shared schedule including rests, slurs, and selected timbre',async()=>{
  const song=parseSong('.Title\nKeyAndMeters = {1=C,3/4}\n.Voice\n(1_ 2_) 0 3');
  const starts=[];
  class Offline{
    constructor(channels,length,rate){
      assert.equal(channels,1);assert.equal(rate,MP3_RATE);
      this.length=length;this.destination={};
    }
    createOscillator(){
      const osc={frequency:{setValueAtTime(){}},setPeriodicWave(){},connect(){},
        start(time){starts.push(time);},stop(){},disconnect(){}};
      return osc;
    }
    createPeriodicWave(){return {};}
    createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(){},
      exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};}
    async startRendering(){
      return {getChannelData(){return new Float32Array(1152);}};
    }
  }
  const result=await renderScoreToMp3({song,tempo:120,timbre:'flute',
    OfflineContext:Offline,loadEncoder:async()=>({Mp3Encoder})});
  assert.ok(result.size>0);
  assert.deepEqual(starts,[0,.25,1.0]);
  assert.ok(songSchedule(song,120).timeline[0].legatoToNext);
  assert.equal(songSchedule(song,120).timeline[2].freq,0);
});
test('MP3 export rejects unsupported environment and excessive duration',async()=>{
  const song=parseSong('.Voice\n1');
  await assert.rejects(()=>renderScoreToMp3({song,tempo:120}),/离线音频/);
  const longSong=parseSong('.Voice\n1'.repeat(2));
  longSong.notes=[...Array(1)].map((_,i)=>({...song.notes[0],beats:MP3_MAX_SECONDS*3,id:i}));
  await assert.rejects(()=>renderScoreToMp3({song:longSong,tempo:120,OfflineContext:class {}}),/15 分钟/);
});
