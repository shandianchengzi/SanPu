import {cp, mkdir, rm, writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import packageInfo from '../package.json' with {type:'json'};

const root=fileURLToPath(new URL('..',import.meta.url));
const dist=path.join(root,'dist');
const assets=['index.html','styles.css','favicon.svg','LICENSE','THIRD_PARTY_LICENSES.md','src'];
const encoderDir=path.join(root,'node_modules','@breezystack','lamejs');

function gitCommit(){
  if(process.env.SANPU_BUILD_COMMIT)return process.env.SANPU_BUILD_COMMIT.trim();
  try{return execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();}
  catch{return 'development';}
}

const commit=gitCommit();
const buildInfo={
  schemaVersion:1,
  repository:'shandianchengzi/SanPu',
  version:packageInfo.version,
  commit,
  shortCommit:commit==='development'?'development':commit.slice(0,7),
  builtAt:process.env.SANPU_BUILD_TIME||new Date().toISOString(),
  liveUrl:'https://shandianchengzi.github.io/SanPu/'
};

await rm(dist,{recursive:true,force:true});
await mkdir(dist,{recursive:true});
for(const asset of assets)await cp(path.join(root,asset),path.join(dist,asset),{recursive:true});
// Keep the LGPL encoder separate and replaceable; it is loaded only for MP3 export.
await mkdir(path.join(dist,'vendor'),{recursive:true});
await cp(path.join(encoderDir,'dist','lamejs.js'),path.join(dist,'vendor','lamejs.js'));
await cp(path.join(encoderDir,'LICENSE'),path.join(dist,'vendor','lamejs-LICENSE.txt'));
await writeFile(path.join(dist,'build-info.json'),JSON.stringify(buildInfo,null,2)+'\n');
console.log(`Prepared SanPu ${buildInfo.version} (${buildInfo.shortCommit}) in ${dist}`);
