const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const dir=path.join(__dirname,'../extension'),source=name=>fs.readFileSync(path.join(dir,name),'utf8'),tick=()=>new Promise(r=>setTimeout(r,15));
const manual={id:'manual-1',word:'quiet',translation:'adj. 安静的',sentence:'',book:'手动查词',bookId:'manual',added:1};
const article={id:'article-1',word:'journey',translation:'n. 旅程',sentence:'A long journey.',book:'My article',bookId:'web:https://example.com',url:'https://example.com/article',added:2};
async function page({words=[],extension=false,removeFails=false}={}){
  const dom=new JSDOM(source('vocabulary.html'),{runScripts:'outside-only',url:'http://localhost/vocabulary.html'}),w=dom.window,spoken=[],changes=[];
  w.eval(source('core.js'));w.eval(source('shared.js'));w.localStorage.setItem('leaf:vocab',JSON.stringify(words));
  w.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};w.speechSynthesis={cancel(){},speak(voice){spoken.push(voice);}};
  if(extension){let state={leafVocab:words,leafReaderMigrated:true};const storage={async get(keys){return Object.fromEntries(keys.map(k=>[k,state[k]]));},async set(values){Object.assign(state,values);changes.forEach(fn=>fn(Object.fromEntries(Object.entries(values).map(([k,v])=>[k,{newValue:v}])),'local'));}};const service=w.LeafShared.createService(storage,()=>{throw new Error('unexpected network');});
    w.chrome={runtime:{id:'test',async sendMessage(m){try{if(m.type==='leaf:remove'&&removeFails)throw new Error('保存失败');const data=m.type==='leaf:migrate'?await service.migrate(m):await service.remove(m.id);return {ok:true,data};}catch(error){return {ok:false,error:error.message};}}},storage:{local:{},onChanged:{addListener:fn=>changes.push(fn)}}};
  }
  w.eval(source('vocabulary.js'));await tick();return {dom,w,d:w.document,spoken};
}
test('dedicated vocabulary renders shared records, searches and speaks without rendering an article',async()=>{
  const p=await page({words:[manual,article],extension:true});assert.equal(p.d.body.dataset.ready,'true');assert.equal(p.d.getElementById('wordCount').textContent,'2 个词');assert.equal(p.d.querySelector('article'),null);
  assert.equal(p.d.querySelectorAll('.vocab-card').length,2);assert.equal(p.d.querySelectorAll('blockquote').length,1);assert.equal(p.d.querySelector('.source a').href,article.url);
  p.d.querySelector('[aria-label="朗读 quiet"]').click();assert.equal(p.spoken[0].text,'quiet');
  p.d.getElementById('filterWords').value='journey';p.d.getElementById('filterWords').dispatchEvent(new p.w.Event('input'));assert.equal(p.d.querySelectorAll('.vocab-card').length,1);assert.match(p.d.querySelector('.vocab-card').textContent,/journey/);p.dom.window.close();
});
test('removing a shared word updates the list while a failed removal preserves it',async()=>{
  const p=await page({words:[manual],extension:true});p.d.querySelector('[aria-label="移除 quiet"]').click();await tick();assert.equal(p.d.querySelectorAll('.vocab-card').length,0);assert.match(p.d.querySelector('.empty').textContent,/还没有收藏/);assert.equal(p.d.getElementById('exportWords').disabled,true);p.dom.window.close();
  const failed=await page({words:[manual],extension:true,removeFails:true});failed.d.querySelector('[aria-label="移除 quiet"]').click();await tick();assert.equal(failed.d.querySelectorAll('.vocab-card').length,1);assert.match(failed.d.getElementById('vocabStatus').textContent,/保存失败/);failed.dom.window.close();
});
test('preview vocabulary shares local records and exports safe CSV',async()=>{
  const p=await page({words:[{...manual,translation:'<img src=x> "安静"',book:'=1+1'}]});assert.equal(p.d.querySelector('.translation img'),null);
  const exports=[];p.w.Blob=class{constructor(parts){exports.push(parts.join(''));}};p.w.URL.createObjectURL=()=> 'blob:test';p.w.URL.revokeObjectURL=()=>{};let downloaded;
  p.w.HTMLAnchorElement.prototype.click=function(){downloaded=this.download;};p.d.getElementById('exportWords').click();assert.equal(downloaded,'LeafRead-生词本.csv');assert.match(exports[0],/单词/);assert.match(exports[0],/""安静""/);assert.match(exports[0],/'=1\+1/);
  p.w.localStorage.setItem('leaf:vocab',JSON.stringify([manual,article]));p.w.dispatchEvent(new p.w.StorageEvent('storage',{key:'leaf:vocab',newValue:JSON.stringify([manual,article])}));assert.match(p.d.getElementById('vocabularyList').textContent,/journey/);assert.equal(p.d.getElementById('vocabStatus').textContent,'共 2 条收藏。');p.dom.window.close();
});

test('popup preview migrates old words, shares new saves with vocabulary and opens the correct destination',async()=>{
  const dom=new JSDOM(source('popup.html'),{runScripts:'outside-only',url:'http://localhost/popup-demo.html'}),w=dom.window,opened=[];
  w.localStorage.setItem('leaf-popup-preview:leafVocab',JSON.stringify([manual]));w.localStorage.setItem('leaf:vocab',JSON.stringify([article]));w.open=url=>opened.push(url);
  for(const file of ['core.js','shared.js'])w.eval(source(file));w.eval(fs.readFileSync(path.join(__dirname,'popup-preview.js'),'utf8'));w.eval(source('popup.js'));await tick();
  const field=w.document.getElementById('searchWord');field.value='unfamiliar';w.document.getElementById('searchForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await tick();w.document.getElementById('saveWord').click();await tick();
  const words=JSON.parse(w.localStorage.getItem('leaf:vocab'));assert.deepEqual(new Set(words.map(v=>v.word)),new Set(['quiet','journey','unfamiliar']));
  w.document.getElementById('vocab').click();assert.deepEqual(opened,['vocabulary.html']);
  const list=await page({words});assert.equal(list.d.querySelectorAll('.vocab-card').length,3);assert.match(list.d.getElementById('vocabularyList').textContent,/unfamiliar/);list.dom.window.close();dom.window.close();
});
