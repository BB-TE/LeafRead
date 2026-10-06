'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),JSZip=require('jszip');
const root=path.resolve(__dirname,'..');
const production=[
  'manifest.json','background.js','core.js','shared.js',
  'popup.html','popup.css','popup.js',
  'vocabulary.html','vocabulary.css','vocabulary.js',
  'web-text.js','web-content.js','web-content.css'
];
const docs=['README.md','LICENSE','PRIVACY.md','CHANGELOG.md','docs/images/popup.png','docs/images/vocabulary.png'];
const development=['.gitignore','package.json','package-lock.json','serve.cjs','tools/build.cjs',
  'tests/web.test.cjs','tests/popup.test.cjs','tests/vocabulary.test.cjs','tests/popup-preview.js',
  'extension/web-demo.html','extension/web-demo-frame.html'];
async function add(zip,file,name=file){zip.file(name,await fs.readFile(path.join(root,file)));}
async function verifyAssets(){
  const manifest=JSON.parse(await fs.readFile(path.join(root,'extension/manifest.json'),'utf8'));
  const scripts=[manifest.action.default_popup,manifest.background.service_worker,
    ...manifest.content_scripts.flatMap(x=>[...(x.js||[]),...(x.css||[])])];
  for(const file of scripts)if(!production.includes(file))throw new Error('Missing manifest asset: '+file);
  for(const file of production){
    const text=await fs.readFile(path.join(root,'extension',file),'utf8');
    if(/\.html$/.test(file))for(const match of text.matchAll(/(?:src|href)="([^"]+)"/g)){
      const target=match[1];if(!target.startsWith('https:')&&!production.includes(target))throw new Error('Missing HTML asset: '+file+' -> '+target);
    }
  }
  return manifest.version;
}
async function write(zip,name){
  const bytes=await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'});
  // Reopen the result before handing it out: packaging must not include reader or local files.
  const reopened=await JSZip.loadAsync(bytes);
  const files=Object.keys(reopened.files).filter(x=>!reopened.files[x].dir);
  if(files.some(x=>/reader\.(html|js|css)|sample\.js|\.epub$|node_modules\//.test(x)))throw new Error('Unexpected release asset');
  await fs.writeFile(path.join(root,'dist',name),bytes);
  console.log(name+' · '+files.length+' files · '+bytes.length+' bytes');
}
(async()=>{
  const version=await verifyAssets();await fs.mkdir(path.join(root,'dist'),{recursive:true});
  const install=new JSZip(),source=new JSZip();
  for(const file of production){await add(install,'extension/'+file);await add(source,'extension/'+file);}
  for(const file of docs){await add(install,file);await add(source,file);}
  for(const file of development)await add(source,file);
  await write(install,'LeafRead-v'+version+'.zip');
  await write(source,'LeafRead-v'+version+'-source.zip');
})().catch(error=>{console.error(error);process.exitCode=1;});
