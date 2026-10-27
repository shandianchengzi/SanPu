// SanPu score-appearance configuration. Pure module, shared by the editor and tests.
export const FORMAT_GROUPS = [
  {
    title:'标题与调号', hint:'曲名、调号、速度、记谱人和作者署名可独立调整；记谱人位于左侧，词曲作者及演唱者右对齐。',
    fields:[
      {key:'titleSize',label:'曲名字号',min:28,max:100,step:1,unit:'px',default:38},
      {key:'titleWeight',label:'曲名字重',choices:[['400','常规'],['500','中等'],['600','半粗'],['700','加粗'],['800','特粗'],['900','极粗']],default:'800'},
      {key:'titleFont',label:'曲名字体',choices:[['sans','黑体'],['serif','宋体'],['kai','楷体']],default:'sans'},
      {key:'titleLetterSpacing',label:'曲名字符间距',min:-8,max:16,step:1,unit:'px',default:6},
      {key:'titleBottomGap',label:'曲名下方间距',min:-60,max:110,step:1,unit:'px',default:19},
      {key:'metaSize',label:'调号 1 = C 字号',min:16,max:64,step:1,unit:'px',default:21},
      {key:'metaWeight',label:'调号字重',choices:[['400','常规'],['500','中等'],['600','半粗'],['700','加粗'],['800','特粗']],default:'400'},
      {key:'tempoSize',label:'速度 ♩ = 80 字号',min:14,max:64,step:1,unit:'px',default:21},
      {key:'tempoWeight',label:'速度标记字重',choices:[['400','常规'],['500','中等'],['600','半粗'],['700','加粗'],['800','特粗']],default:'500'},
      {key:'transcriberSize',label:'记谱人字号',min:12,max:52,step:1,unit:'px',default:18},
      {key:'transcriberFont',label:'记谱人字体',choices:[['sans','黑体'],['serif','宋体'],['kai','楷体']],default:'sans'},
      {key:'creditSize',label:'词曲作者与演唱者字号',min:12,max:52,step:1,unit:'px',default:18},
      {key:'creditFont',label:'词曲作者与演唱者字体',choices:[['sans','黑体'],['serif','宋体'],['kai','楷体']],default:'sans'},
      {key:'metaFont',label:'调号与速度字体',choices:[['sans','黑体'],['serif','宋体'],['kai','楷体']],default:'serif'},
      {key:'metaGap',label:'调号与速度间距',min:-50,max:80,step:1,unit:'px',default:9},
      {key:'metaBottomGap',label:'调号下方间距',min:-70,max:100,step:1,unit:'px',default:-1}
    ]
  },
  {
    title:'音符与歌词',hint:'升降号、延时点（附点）和高低音点的位置可独立调节；正数远离音符，负数靠近；默认 0 保留原位置。',
    fields:[
      {key:'noteSize',label:'音符字号',min:24,max:80,step:1,unit:'px',default:50},
      {key:'noteWeight',label:'音符字重',choices:[['400','常规'],['500','中等'],['600','半粗'],['700','加粗'],['800','特粗']],default:'700'},
      {key:'noteFont',label:'音符字体',choices:[['sans','黑体'],['serif','宋体'],['kai','楷体']],default:'sans'},
      {key:'accidentalSize',label:'升降号字号',min:14,max:48,step:1,unit:'px',default:23},
      {key:'accidentalGap',label:'升降号与音符间距微调',min:-25,max:70,step:1,unit:'px',default:0},
      {key:'durationDotGap',label:'延时点（附点）与音符间距微调',min:-25,max:70,step:1,unit:'px',default:0},
      {key:'lyricSize',label:'歌词字号',min:14,max:65,step:1,unit:'px',default:51},
      {key:'lyricWeight',label:'歌词字重',choices:[['300','细体'],['400','常规'],['500','中等'],['600','半粗'],['700','加粗']],default:'400'},
      {key:'lyricFont',label:'歌词字体',choices:[['sans','黑体'],['serif','宋体'],['kai','楷体']],default:'kai'},
      {key:'lyricLetterSpacing',label:'歌词字符间距',min:-10,max:12,step:1,unit:'px',default:-4},
      {key:'punctuationGap',label:'标点与歌词距离',min:-30,max:80,step:1,unit:'px',default:2},
      {key:'lyricOffset',label:'歌词与音符纵向间距',min:-70,max:110,step:1,unit:'px',default:3},
      {key:'octaveDotSize',label:'高低音点大小',min:2,max:6,step:.1,unit:'px',default:3.9},
      {key:'highOctaveDotOffset',label:'高音点与音符距离微调',min:-50,max:80,step:1,unit:'px',default:0},
      {key:'lowOctaveDotOffset',label:'低音点与音符距离微调',min:-50,max:80,step:1,unit:'px',default:-13},
      {key:'rhythmStroke',label:'减时线/延长线粗细',min:1,max:6,step:.1,unit:'px',default:2.35},
      {key:'barStroke',label:'小节线粗细',min:1,max:6,step:.1,unit:'px',default:2.9}
    ]
  },
  {
    title:'间距与页面',hint:'带负号的间距会压缩行与行、字与字之间的距离；过小可能重叠。',
    fields:[
      {key:'noteSpacing',label:'音符横向疏密',min:-35,max:100,step:1,unit:'px',default:0},
      {key:'dashSpacing',label:'延长线间距',min:22,max:65,step:1,unit:'px',default:29},
      {key:'dashNoteGap',label:'延长线与音符间距微调',min:-25,max:70,step:1,unit:'px',default:0},
      {key:'barSpacing',label:'小节线占用宽度',min:16,max:90,step:1,unit:'px',default:24},
      {key:'systemGap',label:'谱行之间的间距',min:-100,max:120,step:1,unit:'px',default:-5},
      {key:'lyricLineGap',label:'相邻两行歌词间距微调',min:-160,max:160,step:1,unit:'px',default:0},
      {key:'minLineWidth',label:'谱行最小宽度',min:580,max:2200,step:20,unit:'px',default:980},
      {key:'previewPadding',label:'预览四周留白',min:0,max:100,step:1,unit:'px',default:48},
      {key:'printMarginX',label:'PDF 左右页边距',min:4,max:35,step:1,unit:'mm',default:15},
      {key:'printMarginY',label:'PDF 上下页边距',min:4,max:35,step:1,unit:'mm',default:8}
    ]
  }
];
export const FORMAT_FIELDS = FORMAT_GROUPS.flatMap(group=>group.fields);
export const DEFAULT_FORMAT = Object.freeze(Object.fromEntries(FORMAT_FIELDS.map(field=>[field.key,field.default])));
export const FONTS = Object.freeze({
  sans:'Arial,"Microsoft YaHei","PingFang SC","Noto Sans CJK SC",sans-serif',
  serif:'"Songti SC","SimSun","Noto Serif CJK SC",serif',
  kai:'"KaiTi","STKaiti","Kaiti SC",serif'
});
export function normalizeFormat(raw) {
  const source=raw && typeof raw==='object' && !Array.isArray(raw) ? raw : {};
  const result={};
  for(const field of FORMAT_FIELDS){
    if(field.choices){
      const value=String(source[field.key] ?? field.default);
      result[field.key]=field.choices.some(([id])=>id===value)?value:field.default;
    }else{
      const value=Number(source[field.key]);
      const fallback=source[field.key]===undefined || source[field.key]===null || source[field.key]==='' || !Number.isFinite(value) ? field.default : value;
      const bounded=Math.min(field.max,Math.max(field.min,fallback));
      result[field.key]=Number(bounded.toFixed(2));
    }
  }
  // Upgrade previous saved layouts: tempo used to inherit 80% of the tonic
  // font size. Preserve that appearance until the user edits tempoSize itself.
  if(source.tempoSize===undefined && source.metaSize!==undefined){
    result.tempoSize=Math.min(64,Math.max(14,Number((result.metaSize*.8).toFixed(2))));
  }
  return result;
}
// Portable score appearance file. Only known score layout fields are exported;
// the current song, BPM, playback timbre and screen zoom are intentionally excluded.
export const STYLE_FILE_TYPE='sanpu-score-style';
export const STYLE_FILE_VERSION=1;
export function exportStyle(format){
  return JSON.stringify({
    type:STYLE_FILE_TYPE,
    version:STYLE_FILE_VERSION,
    settings:normalizeFormat(format)
  },null,2)+'\n';
}
export function importStyle(text){
  let value;
  try{value=JSON.parse(String(text));}
  catch{throw new Error('文件不是有效的 JSON。');}
  if(!value || typeof value!=='object' || Array.isArray(value) || value.type!==STYLE_FILE_TYPE)
    throw new Error('不是 SanPu 谱面样式文件。');
  if(value.version!==STYLE_FILE_VERSION)
    throw new Error('不支持该样式文件版本（当前支持版本 1）。');
  const settings=value.settings;
  if(!settings || typeof settings!=='object' || Array.isArray(settings))
    throw new Error('样式文件缺少有效的 settings 对象。');
  if(!FORMAT_FIELDS.some(field=>Object.hasOwn(settings,field.key)))
    throw new Error('样式文件没有可识别的排版参数。');
  // Ignore unknown future keys; normalize missing, out-of-range or invalid values.
  return normalizeFormat(settings);
}
export const FORMAT_PRESETS=Object.freeze({
  standard:DEFAULT_FORMAT,
  compact:Object.freeze(normalizeFormat({
    ...DEFAULT_FORMAT,titleSize:34,titleBottomGap:12,metaSize:18,tempoSize:18,
    metaGap:6,metaBottomGap:-8,noteSize:44,lyricSize:45,lyricOffset:0,
    noteSpacing:-8,dashSpacing:25,barSpacing:20,systemGap:-15,
    previewPadding:32,minLineWidth:820
  })),
  spacious:Object.freeze(normalizeFormat({
    ...DEFAULT_FORMAT,titleSize:46,titleBottomGap:29,metaSize:25,tempoSize:25,
    metaGap:15,metaBottomGap:10,noteSize:57,lyricSize:57,lyricOffset:15,
    noteSpacing:16,dashSpacing:38,barSpacing:32,systemGap:22,
    previewPadding:62,minLineWidth:1200
  }))
});
export function formatPresetId(format){
  const value=normalizeFormat(format);
  for(const [id,preset] of Object.entries(FORMAT_PRESETS)){
    if(FORMAT_FIELDS.every(field=>preset[field.key]===value[field.key]))return id;
  }
  return 'custom';
}
