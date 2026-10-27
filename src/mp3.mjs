import {songSchedule,groupPlaybackEvents} from './core.mjs';
import {createVoice,createLegatoVoice} from './timbres.mjs';

export const MP3_RATE=44100;
export const MP3_MAX_SECONDS=15*60;
const BLOCK=1152;
const encoderPath='../vendor/lamejs.js';

function packBytes(bytes){
  const buf=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  return buf.slice();
}
export async function encodeMp3(pcm,Encoder,onProgress=()=>{}){
  if(!Encoder)throw new Error('MP3 编码器未正确加载');
  const encoder=new Encoder(1,MP3_RATE,128);
  const pieces=[];
  const total=pcm.length;
  for(let offset=0;offset<total;offset+=BLOCK){
    const end=Math.min(total,offset+BLOCK);
    const frame=new Int16Array(end-offset);
    for(let i=offset;i<end;i++){
      const v=Math.max(-1,Math.min(1,pcm[i]||0));
      frame[i-offset]=Math.round(v*(v<0?32768:32767));
    }
    const bytes=encoder.encodeBuffer(frame);
    if(bytes?.length)pieces.push(packBytes(bytes));
    if(offset>0 && (Math.floor(offset/BLOCK)%200===0)){
      onProgress(Math.round(offset/total*100));
      // Prevent long-running encodes from freezing editor interactions.
      await new Promise(resolve=>setTimeout(resolve,0));
    }
  }
  const tail=encoder.flush();
  if(tail?.length)pieces.push(packBytes(tail));
  onProgress(100);
  if(!pieces.length)throw new Error('MP3 编码未产生有效数据');
  return new Blob(pieces,{type:'audio/mpeg'});
}

/** OfflineAudioContext uses the same instruments and event schedule as playback. */
export async function renderScoreToMp3({song,tempo,timbre='sine',OfflineContext,onProgress,
  loadEncoder=()=>import(encoderPath)}){
  if(!OfflineContext)throw new Error('当前浏览器不支持离线音频渲染');
  if(!song?.notes?.length)throw new Error('谱面没有可导出的音符');
  if(!Number.isFinite(tempo)||tempo<=0)throw new Error('无效的 BPM');
  const {timeline,total}=songSchedule(song,tempo);
  if(total>MP3_MAX_SECONDS)throw new Error('当前限制导出 15 分钟以内的谱面');
  const length=Math.ceil((total+.35)*MP3_RATE);
  const ctx=new OfflineContext(1,length,MP3_RATE);
  const voices=[];
  for(const events of groupPlaybackEvents(timeline)){
    const voice=events.length>1?createLegatoVoice(ctx,{events,timbre}):
      createVoice(ctx,{frequency:events[0].freq,start:events[0].start,end:events[0].end,timbre});
    if(voice)voices.push(voice);
  }
  const audio=await ctx.startRendering();
  voices.forEach(voice=>voice.stop());
  const {Mp3Encoder}=await loadEncoder();
  return encodeMp3(audio.getChannelData(0),Mp3Encoder,onProgress);
}
