import test from 'node:test';
import assert from 'node:assert/strict';
import {TIMBRES,normalizeTimbre,createVoice,createLegatoVoice} from '../src/timbres.mjs';

function fakeAudio(){
  const oscillators=[],gains=[],waves=[];
  const audio={
    destination:{},
    createPeriodicWave(real,imag){
      const wave={real:Array.from(real),imag:Array.from(imag)};
      waves.push(wave);return wave;
    },
    createOscillator(){
      const osc={
        type:null,wave:null,frequency:{events:[],setValueAtTime(freq,at){osc.pitch={freq,at};this.events.push({type:'set',freq,at});},linearRampToValueAtTime(freq,at){this.events.push({type:'linear',freq,at});}},
        setPeriodicWave(wave){osc.wave=wave;},
        connect(to){osc.output=to;},
        start(at){osc.began=at;},
        stop(at){osc.ended=at;},
        disconnect(){osc.disconnected=true;}
      };
      oscillators.push(osc);return osc;
    },
    createGain(){
      const gain={
        gain:{
          events:[],
          setValueAtTime(value,at){this.events.push({type:'set',value,at});},
          linearRampToValueAtTime(value,at){this.events.push({type:'linear',value,at});},
          exponentialRampToValueAtTime(value,at){this.events.push({type:'exp',value,at});}
        },
        connect(to){gain.output=to;},
        disconnect(){gain.disconnected=true;}
      };
      gains.push(gain);return gain;
    }
  };
  return {audio,oscillators,gains,waves};
}

test('timbres are distinct, offline, and unknown preferences fall back to default piano',()=>{
  assert.equal(new Set(TIMBRES.map(t=>t.id)).size,TIMBRES.length);
  assert.equal(TIMBRES.length,7);
  assert.equal(normalizeTimbre(undefined),'piano');
  assert.equal(normalizeTimbre('sine'),'sine');
  assert.equal(normalizeTimbre('piano'),'piano');
  assert.equal(normalizeTimbre('strings'),'strings');
  assert.equal(normalizeTimbre('__proto__'),'piano');
});

test('different presets create different waveforms with bounded gain envelopes',()=>{
  const {audio,oscillators,gains,waves}=fakeAudio();
  for(const timbre of TIMBRES){
    const voice=createVoice(audio,{frequency:440,start:3,end:4,timbre:timbre.id});
    assert.ok(voice,timbre.id);
    assert.equal(voice.oscillator.pitch.freq,440);
    assert.equal(voice.oscillator.pitch.at,3);
    assert.equal(voice.oscillator.began,3);
    assert.ok(voice.oscillator.ended>=4);
    assert.equal(voice.gain.output,audio.destination);
    const events=voice.gain.gain.events;
    assert.ok(events.length>=3,timbre.id);
    for(let i=1;i<events.length;i++)assert.ok(events[i].at>=events[i-1].at,timbre.id);
    assert.ok(events.every(e=>e.at>=3&&e.at<=4&&e.value>0),timbre.id);
    assert.equal(events[0].value,.0001);
    assert.equal(events.at(-1).value,.0001);
    if(timbre.harmonics)assert.ok(voice.oscillator.wave?.imag.length>1);
    else assert.equal(voice.oscillator.type,timbre.type);
    voice.stop();
    assert.equal(voice.oscillator.disconnected,true);
    assert.equal(voice.gain.disconnected,true);
  }
  assert.equal(oscillators.length,TIMBRES.length);
  assert.equal(gains.length,TIMBRES.length);
  assert.equal(waves.length,TIMBRES.filter(t=>t.harmonics).length);
});

test('oscillator periodic waves are cached per audio context and preset',()=>{
  const first=fakeAudio(),second=fakeAudio();
  const one=createVoice(first.audio,{frequency:220,start:1,end:2,timbre:'piano'});
  const two=createVoice(first.audio,{frequency:330,start:3,end:4,timbre:'piano'});
  assert.equal(one.oscillator.wave,two.oscillator.wave);
  assert.equal(first.waves.length,1);
  const third=createVoice(second.audio,{frequency:440,start:1,end:2,timbre:'piano'});
  assert.equal(second.waves.length,1);
  assert.notEqual(one.oscillator.wave,third.oscillator.wave);
  one.stop();two.stop();third.stop();
});

test('very short notes keep monotonic automation events and silence stays silent',()=>{
  const {audio,oscillators,gains}=fakeAudio();
  assert.equal(createVoice(audio,{frequency:0,start:0,end:1,timbre:'piano'}),null);
  assert.equal(createVoice(audio,{frequency:440,start:2,end:2,timbre:'piano'}),null);
  assert.equal(createVoice(audio,{frequency:NaN,start:0,end:1}),null);
  assert.equal(oscillators.length,0);
  const v=createVoice(audio,{frequency:660,start:2,end:2.01,timbre:'strings'});
  assert.ok(v);
  const events=gains[0].gain.events;
  assert.ok(events.every(e=>e.at>=2&&e.at<=2.01));
  for(let i=1;i<events.length;i++)assert.ok(events[i].at>=events[i-1].at);
  assert.equal(events.at(-1).at,2.01);
  assert.ok(v.oscillator.ended>2.01);
  v.stop();
});

test('slurred phrase produces one oscillator with a continuous envelope and pitch bends',()=>{
  const {audio,oscillators,gains}=fakeAudio();
  const group=[{freq:440,start:0,end:.5},{freq:523.25,start:.5,end:1},
    {freq:659.25,start:1,end:1.5}];
  const voice=createLegatoVoice(audio,{events:group,timbre:'piano'});
  assert.ok(voice);
  assert.equal(oscillators.length,1,'no retrigger within slur');
  assert.equal(gains.length,1,'only one envelope for entire phrase');
  assert.equal(oscillators[0].began,0);
  assert.ok(oscillators[0].ended>=1.5);
  assert.deepEqual(oscillators[0].frequency.events.map(event=>event.type),['set','set','linear','set','linear']);
  const gain=gains[0].gain.events;
  assert.equal(gain.filter(x=>x.type==='set').length,1,'no fresh attack at each note');
  assert.equal(gain.at(-1).at,1.5);
  assert.ok(gain.at(-2).value>.04,'legato piano stays audible');
  voice.stop();
});
