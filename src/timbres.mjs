// Offline, sample-free Web Audio instrument approximations for SanPu.
// Names deliberately say "合成" where timbres approximate acoustic instruments.
export const TIMBRES=Object.freeze([
  Object.freeze({id:'sine',label:'纯音（原音色）',type:'sine',attack:.018,release:.045,sustain:1}),
  Object.freeze({id:'piano',label:'钢琴（合成）',harmonics:[1,.30,.13,.07,.03],attack:.006,release:.095,sustain:.11}),
  Object.freeze({id:'guitar',label:'吉他（合成）',harmonics:[1,.46,.21,.10,.04],attack:.004,release:.10,sustain:.055}),
  Object.freeze({id:'flute',label:'长笛（合成）',harmonics:[1,.13,.035],attack:.055,release:.10,sustain:.90}),
  Object.freeze({id:'strings',label:'弦乐（合成）',harmonics:[1,.58,.32,.21,.13,.09],attack:.10,release:.16,sustain:.80}),
  Object.freeze({id:'organ',label:'管风琴（合成）',harmonics:[1,.48,.31,.14,.12],attack:.015,release:.08,sustain:1}),
  Object.freeze({id:'chip',label:'电子方波',type:'square',attack:.007,release:.035,sustain:1})
]);
const byId=new Map(TIMBRES.map(t=>[t.id,t]));
const waves=new WeakMap();
export function normalizeTimbre(value){
  return typeof value==='string' && byId.has(value)?value:'piano';
}
function getWave(audio,timbre){
  let cache=waves.get(audio);
  if(!cache){cache=new Map();waves.set(audio,cache);}
  if(!cache.has(timbre.id)){
    const real=new Float32Array(timbre.harmonics.length+1);
    const imag=new Float32Array(timbre.harmonics.length+1);
    timbre.harmonics.forEach((amplitude,index)=>{imag[index+1]=amplitude;});
    cache.set(timbre.id,audio.createPeriodicWave(real,imag));
  }
  return cache.get(timbre.id);
}
// Creates exactly one oscillator per note. Its gain envelope is strictly bounded
// by [start,end], including very short notes. The caller owns stop/disconnect.
export function createVoice(audio,{frequency,start,end,timbre='sine'}){
  if(!Number.isFinite(frequency)||frequency<=0||!Number.isFinite(start)||
     !Number.isFinite(end)||end<=start)return null;
  const cfg=byId.get(normalizeTimbre(timbre));
  const duration=end-start;
  const oscillator=audio.createOscillator();
  if(cfg.harmonics)oscillator.setPeriodicWave(getWave(audio,cfg));
  else oscillator.type=cfg.type;
  oscillator.frequency.setValueAtTime(frequency,start);
  const gain=audio.createGain();
  const level=.14, floor=.0001;
  const attackEnd=start+Math.min(Math.max(.002,cfg.attack),duration*.30);
  const releaseStart=Math.max(attackEnd,end-Math.min(cfg.release,duration*.32));
  const decayLevel=Math.max(floor*2,level*cfg.sustain);
  gain.gain.setValueAtTime(floor,start);
  gain.gain.linearRampToValueAtTime(level,attackEnd);
  if(releaseStart>attackEnd+.0001)
    gain.gain.exponentialRampToValueAtTime(decayLevel,releaseStart);
  gain.gain.exponentialRampToValueAtTime(floor,end);
  oscillator.connect(gain);
  gain.connect(audio.destination);
  oscillator.start(start);
  oscillator.stop(end+.01);
  return {
    oscillator,gain,
    stop(){
      try{oscillator.stop();}catch{/* already finished */}
      try{oscillator.disconnect();}catch{/* already detached */}
      try{gain.disconnect();}catch{/* already detached */}
    }
  };
}

/** A true legato phrase: one oscillator and one continuous gain envelope.
 * Individual note pitches change at boundaries without a new oscillator attack.
 * Pitch glide is short (<=12 ms) and phase-continuous, not a slow portamento.
 */
export function createLegatoVoice(audio,{events,timbre='piano'}){
  if(!Array.isArray(events)||events.length<2)return null;
  const start=events[0].start,end=events.at(-1).end;
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||
    events.some((event,i)=>!Number.isFinite(event.freq)||event.freq<=0||
      !Number.isFinite(event.start)||!Number.isFinite(event.end)||
      event.end<=event.start||(i>0&&Math.abs(event.start-events[i-1].end)>1e-6)))return null;
  const cfg=byId.get(normalizeTimbre(timbre));
  const oscillator=audio.createOscillator();
  if(cfg.harmonics)oscillator.setPeriodicWave(getWave(audio,cfg));
  else oscillator.type=cfg.type;
  oscillator.frequency.setValueAtTime(events[0].freq,start);
  for(let i=1;i<events.length;i++){
    const boundary=events[i].start;
    // No retrigger: smoothly change the frequency of the same oscillator.
    // The short glide avoids clicks without sounding like a slide.
    const glide=Math.min(.012,(events[i].end-boundary)*.25);
    oscillator.frequency.setValueAtTime(events[i-1].freq,boundary);
    oscillator.frequency.linearRampToValueAtTime(events[i].freq,boundary+glide);
  }
  const gain=audio.createGain();
  const level=.14,floor=.0001;
  const attackEnd=start+Math.min(Math.max(.002,cfg.attack), (end-start)*.25);
  const releaseStart=Math.max(attackEnd,end-Math.min(cfg.release,(end-start)*.25));
  // Piano-like sounds must remain audible between connected notes.
  const heldLevel=Math.max(level*.5,level*cfg.sustain);
  gain.gain.setValueAtTime(floor,start);
  gain.gain.linearRampToValueAtTime(level,attackEnd);
  if(releaseStart>attackEnd+.0001)
    gain.gain.exponentialRampToValueAtTime(heldLevel,releaseStart);
  gain.gain.exponentialRampToValueAtTime(floor,end);
  oscillator.connect(gain);
  gain.connect(audio.destination);
  oscillator.start(start);
  oscillator.stop(end+.01);
  return {oscillator,gain,stop(){
    try{oscillator.stop();}catch{/* already finished */}
    try{oscillator.disconnect();}catch{/* already detached */}
    try{gain.disconnect();}catch{/* already detached */}
  }};
}
