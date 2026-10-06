const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const dir=path.join(__dirname,'../extension');
const source=name=>fs.readFileSync(path.join(dir,name),'utf8');
const tick=()=>new Promise(resolve=>setTimeout(resolve,10));

async function popup({initial={},handler}={}){
  const dom=new JSDOM(source('popup.html'),{runScripts:'outside-only',url:'https://extension.test/popup.html'});
  const w=dom.window,requests=[],spoken=[],changes=[],opened=[];
  w.eval(source('core.js'));w.eval(source('shared.js'));
  let data=structuredClone(initial);
  const storage={async get(keys){return Object.fromEntries(keys.map(key=>[key,structuredClone(data[key])]));},async set(values){const event=Object.fromEntries(Object.keys(values).map(key=>[key,{newValue:structuredClone(values[key])}]));Object.assign(data,structuredClone(values));changes.forEach(fn=>fn(event,'local'));}};
  const service=w.LeafShared.createService(storage,()=>{throw new Error('Unexpected network');});
  w.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};
  w.speechSynthesis={cancel(){},speak(utterance){spoken.push(utterance);}};
  w.chrome={runtime:{id:'test',getURL:p=>'chrome-extension://test/'+p,async sendMessage(message){
    requests.push(message);
    if(handler){const result=handler(message);if(result!==undefined)return result;}
    try{let result;switch(message.type){
      case 'leaf:settings-get':result=await service.settings();break;
      case 'leaf:settings-set':result=await service.updateSettings(message.patch);break;
      case 'leaf:vocab':result=await service.vocabulary();break;
      case 'leaf:lookup':result=await service.lookup(message.text);break;
      case 'leaf:save':result=await service.save(message.entry);break;
      default:throw new Error('Unsupported test message');
    }return {ok:true,data:result};}catch(error){return {ok:false,error:error.message};}
  }},tabs:{async query(){return [{id:1,url:'chrome://newtab/'}];},async create({url}){opened.push(url);},async sendMessage(){throw new Error('No content script');}},storage:{onChanged:{addListener(fn){changes.push(fn);}}}};
  w.eval(source('popup.js'));await tick();
  const el=id=>w.document.getElementById(id);
  function submit(word){el('searchWord').value=word;el('searchForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));}
  return {dom,w,el,requests,spoken,service,submit,opened};
}

test('popup queries a trimmed word even on a restricted page with hover paused, and speaks it',async()=>{
  const p=await popup({initial:{leafSettings:{webEnabled:false}}});
  p.submit('  quiet  ');await tick();
  assert.equal(p.el('resultWord').textContent,'quiet');assert.match(p.el('definition').textContent,/安静/);
  assert.equal(p.el('searchResult').hidden,false);assert.match(p.el('pageStatus').textContent,/暂不支持/);
  assert.equal(p.requests.find(m=>m.type==='leaf:lookup').text,'quiet');
  p.el('speakWord').click();assert.equal(p.spoken[0].text,'quiet');assert.equal(p.spoken[0].lang,'en-US');p.dom.window.close();
});

test('blank, multiword and non-English input produces a hint without querying',async()=>{
  const p=await popup();
  for(const word of ['','   ','中文','hello world','<script>','a'.repeat(121)]){p.submit(word);await tick();assert.equal(p.el('searchResult').hidden,true);assert.match(p.el('searchStatus').textContent,/请输入一个英文单词/);}
  assert.equal(p.requests.filter(m=>m.type==='leaf:lookup').length,0);p.dom.window.close();
});

test('a late success or error cannot replace the latest result; definition is rendered as text',async()=>{
  const pending=[];const p=await popup({handler:m=>m.type==='leaf:lookup'?new Promise(resolve=>pending.push(resolve)):undefined});
  p.submit('first');p.submit('second');p.submit('third');
  pending[2]({ok:true,data:{text:'<img src=x onerror=alert(1)> 第三个',source:'test',pronunciation:'/third/'}});await tick();
  pending[0]({ok:true,data:{text:'旧结果',source:'test'}});pending[1]({ok:false,error:'旧错误'});await tick();
  assert.equal(p.el('resultWord').textContent,'third');assert.match(p.el('definition').textContent,/第三个/);
  assert.equal(p.el('definition').querySelector('img'),null);assert.equal(p.el('searchStatus').textContent,'查询完成。');assert.equal(p.el('searchResult').getAttribute('aria-busy'),'false');p.dom.window.close();
});

test('popup follows offline settings, uses cached words, and can retry a failed lookup',async()=>{
  const p=await popup({initial:{leafSettings:{online:false},leafCache:{serendipity:{text:'机缘巧合',source:'缓存词典',pronunciation:'/test/'}}}});
  p.submit('uncachedword');await tick();assert.equal(p.el('searchResult').hidden,true);assert.match(p.el('searchStatus').textContent,/开启在线查词/);
  p.submit('serendipity');await tick();assert.equal(p.el('definition').textContent,'机缘巧合');assert.match(p.el('dictionarySource').textContent,/本地缓存/);
  p.submit('quiet');await tick();assert.match(p.el('definition').textContent,/安静/);p.dom.window.close();
});

test('manual lookup saves to shared vocabulary without a fabricated page context and deduplicates on reopening',async()=>{
  const p=await popup();p.submit('quiet');await tick();p.el('saveWord').click();p.el('saveWord').click();await tick();
  const list=await p.service.vocabulary();assert.equal(list.length,1);assert.equal(list[0].book,'手动查词');assert.equal(list[0].bookId,'manual');assert.equal(list[0].sentence,'');assert.equal(list[0].url,'');assert.equal(p.el('saveWord').disabled,true);
  p.submit('QUIET');await tick();assert.equal(p.el('saveWord').textContent,'✓ 已收藏');
  const reopened=await popup({initial:{leafVocab:list}});reopened.submit('quiet');await tick();assert.equal(reopened.el('saveWord').disabled,true);
  await reopened.service.remove(list[0].id);assert.equal(reopened.el('saveWord').disabled,false);p.dom.window.close();reopened.dom.window.close();
});

test('an invalidated popup provides reopening instructions and a fresh popup works again',async()=>{
  const old=await popup({handler:m=>m.type==='leaf:lookup'?Promise.reject(new Error('Extension context invalidated.')):undefined});
  old.submit('quiet');await tick();assert.equal(old.el('searchResult').hidden,true);assert.match(old.el('searchStatus').textContent,/关闭这个面板.*重新打开/);assert.doesNotMatch(old.el('searchStatus').textContent,/Extension context invalidated/);old.dom.window.close();
  const fresh=await popup();fresh.submit('quiet');await tick();assert.match(fresh.el('definition').textContent,/安静/);fresh.dom.window.close();
});

test('popup opens vocabulary and exposes no reader entry',async()=>{
  const p=await popup();assert.equal(p.el('reader'),null);p.el('vocab').click();
  assert.deepEqual(p.opened,['chrome-extension://test/vocabulary.html']);p.dom.window.close();
});
