const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');const {JSDOM}=require('jsdom');
const dir=path.join(__dirname,'../extension');const source=name=>fs.readFileSync(path.join(dir,name),'utf8');const pause=ms=>new Promise(r=>setTimeout(r,ms));
require(path.join(dir,'core.js'));require(path.join(dir,'shared.js'));
function storage(initial={}){let data=structuredClone(initial);return {async get(keys){return Object.fromEntries(keys.map(k=>[k,structuredClone(data[k])]));},async set(value){await pause(2);Object.assign(data,structuredClone(value));}};}
function textWindow(html){const dom=new JSDOM(html,{runScripts:'outside-only',pretendToBeVisual:true,url:'https://example.com/article'});const w=dom.window;w.eval(source('core.js'));w.eval(source('web-text.js'));w.Range.prototype.getClientRects=()=>[{left:10,right:130,top:10,bottom:40}];w.Range.prototype.getBoundingClientRect=()=>({left:10,right:130,top:10,bottom:40,width:120,height:30});return dom;}
test('web lookup joins inline text fragments without rewriting the original page',()=>{
  const dom=textWindow('<p>He felt ex<strong>hau</strong>sted.</p>');const w=dom.window;const html=w.document.body.innerHTML;
  const result=w.LeafWebText.atOffset(w.document.querySelector('strong').firstChild,1,40,20);
  assert.equal(result.word,'exhausted');assert.equal(result.range.toString(),'exhausted');assert.equal(result.sentence,'He felt exhausted.');assert.equal(w.document.body.innerHTML,html);dom.window.close();
});
test('whitespace, editable content and buttons do not produce lookup candidates',()=>{
  const dom=textWindow('<p>A quiet journey.</p><button>quiet</button><div contenteditable="true">quiet</div>');const w=dom.window;const p=w.document.querySelector('p').firstChild;
  assert.equal(w.LeafWebText.atOffset(p,4,200,20),null);assert.equal(w.LeafWebText.atOffset(w.document.querySelector('button').firstChild,2,40,20),null);assert.equal(w.LeafWebText.atOffset(w.document.querySelector('[contenteditable]').firstChild,2,40,20),null);dom.window.close();
});
test('shared settings accept missing storage and preserve valid bounds',()=>{
  const S=global.LeafShared;assert.equal(S.normalizeSettings(null).webEnabled,true);assert.equal(S.normalizeSettings({delay:9}).delay,3);assert.equal(S.normalizeSettings({delay:NaN}).delay,1);assert.deepEqual(S.normalizeSettings({disabledHosts:['example.com','example.com','https://bad']}).disabledHosts,['example.com']);
});
test('concurrent saves retain both records and identical word/context is deduplicated',async()=>{
  const S=global.LeafShared;const service=S.createService(storage(),()=>{throw new Error('no network');});
  const a={word:'quiet',translation:'安静的',sentence:'A quiet morning.',book:'Article',bookId:'web:a'};const b={...a,word:'journey',sentence:'A long journey.'};
  await Promise.all([service.save(a),service.save(b),service.save(a)]);const list=await service.vocabulary();assert.equal(list.length,2);assert.deepEqual(new Set(list.map(x=>x.word)),new Set(['quiet','journey']));
});
test('legacy reader migration runs once and does not recreate removed vocabulary',async()=>{
  const service=global.LeafShared.createService(storage(),()=>{});const legacy={vocab:[{id:'old-id',word:'quiet',translation:'安静的',sentence:'quiet',bookId:'book-1'}],settings:{delay:2,alt:true}};
  const first=await service.migrate(legacy);assert.equal(first.vocab[0].id,'old-id');assert.equal(first.settings.delay,2);await service.remove('old-id');await service.migrate(legacy);assert.equal((await service.vocabulary()).length,0);
});
test('remote dictionary request sends only the word to a fixed endpoint, and caches the result',async()=>{
  const requests=[];const service=global.LeafShared.createService(storage(),async(url)=>{requests.push(url);return {ok:true,json:async()=>({ec:{word:[{usphone:'test',trs:[{tr:[{l:{i:['n. 偶然发现美好事物的机缘']}}]}]}]}})};});
  const result=await service.lookup('serendipity');assert.match(result.text,/机缘/);assert.equal(requests.length,1);assert.equal(new URL(requests[0]).hostname,'dict.youdao.com');assert.equal(new URL(requests[0]).searchParams.get('q'),'serendipity');await service.lookup('serendipity');assert.equal(requests.length,1);await assert.rejects(service.lookup('a'.repeat(121)));
});
test('background ignores external senders and never fetches a message-supplied URL',async()=>{
  let listener;const context={console,crypto:global.crypto,AbortSignal,URL,DOMException,fetch:()=>{throw new Error('unexpected network');},chrome:{runtime:{id:'our-id',getURL:p=>'chrome-extension://our-id/'+p,onMessage:{addListener:fn=>listener=fn}},storage:{local:storage()}}};context.importScripts=(...names)=>names.forEach(name=>vm.runInContext(source(name),context));vm.createContext(context);vm.runInContext(source('background.js'),context);
  assert.equal(listener({type:'leaf:lookup',text:'quiet'},{id:'other-id'},()=>assert.fail('external response')),undefined);
  const response=await new Promise(resolve=>listener({type:'leaf:lookup',text:'quiet',url:'https://evil.test/'},{id:'our-id',url:'https://example.com'},resolve));assert.equal(response.ok,true);assert.match(response.data.text,/安静/);
});
test('a legitimate word matching an object prototype key still uses the dictionary service',async()=>{
  let queried=false;const service=global.LeafShared.createService(storage(),async()=>{queried=true;return {ok:true,json:async()=>({ec:{word:[{trs:[{tr:[{l:{i:['n. 构造器']}}]}]}]}})};});const result=await service.lookup('constructor');assert.equal(queried,true);assert.match(result.text,/构造器/);
});
async function contentWindow(handler){
  const dom=textWindow('<p>After a difficult week, she felt exhausted.</p>');const w=dom.window;const changes=[];const requests=[];
  w.eval(source('shared.js'));w.chrome={runtime:{id:'our-id',onMessage:{addListener:()=>{}},async sendMessage(message){requests.push(message);if(message.type==='leaf:config')return {ok:true,data:{settings:w.LeafShared.normalizeSettings({delay:.4}),siteHost:'example.com',pageUrl:'https://example.com/article',pageTitle:'Example'}};if(message.type==='leaf:vocab')return {ok:true,data:[]};if(handler)return handler(message);return {ok:true,data:{text:'筋疲力尽的',source:'test',pronunciation:''}};}},storage:{onChanged:{addListener:fn=>changes.push(fn)}}};
  w.requestAnimationFrame=fn=>w.setTimeout(fn,0);const matches=w.Element.prototype.matches;w.Element.prototype.matches=function(selector){return selector===':popover-open'?false:matches.call(this,selector);};
  w.document.caretPositionFromPoint=()=>({offsetNode:w.document.querySelector('p').firstChild,offset:35});
  w.eval(source('web-content.js'));await pause(10);return {dom,w,changes,requests};
}
test('real event dispatch survives animation-frame processing and setting changes stop lookup',async()=>{
  const {dom,w,changes,requests}=await contentWindow();const p=w.document.querySelector('p');const before=p.innerHTML;
  p.dispatchEvent(new w.MouseEvent('pointermove',{bubbles:true,clientX:40,clientY:20}));await pause(460);
  const root=w.document.getElementById('leafread-web-tooltip')?.shadowRoot;assert.ok(root,'hover card must be created');assert.equal(root.querySelector('strong').textContent,'exhausted');assert.equal(root.querySelector('.result').textContent,'筋疲力尽的');assert.equal(p.innerHTML,before);assert.equal(requests.find(x=>x.type==='leaf:lookup').text,'exhausted');
  changes[0]({leafSettings:{newValue:{webEnabled:false}}},'local');assert.equal(w.document.getElementById('leafread-web-tooltip').style.display,'none');const count=requests.length;p.dispatchEvent(new w.MouseEvent('pointermove',{bubbles:true,clientX:40,clientY:20}));await pause(440);assert.equal(requests.length,count);dom.window.close();
});
test('a late web lookup response stays dismissed after scrolling',async()=>{
  let resolve;const {dom,w}=await contentWindow(message=>message.type==='leaf:lookup'?new Promise(r=>resolve=r):{ok:true,data:[]});
  w.document.querySelector('p').dispatchEvent(new w.MouseEvent('pointermove',{bubbles:true,clientX:40,clientY:20}));await pause(440);
  assert.ok(resolve);w.document.dispatchEvent(new w.Event('scroll'));resolve({ok:true,data:{text:'OLD RESULT',source:'test'}});await pause(20);const host=w.document.getElementById('leafread-web-tooltip');assert.equal(host.style.display,'none');assert.doesNotMatch(host.shadowRoot.querySelector('.result').textContent,/OLD RESULT/);dom.window.close();
});

test('invalidated web context shows a refresh hint and retires lookup listeners',async()=>{
  const {dom,w,requests,changes}=await contentWindow(()=>Promise.reject(new Error('Extension context invalidated.')));
  const p=w.document.querySelector('p');p.dispatchEvent(new w.MouseEvent('pointermove',{bubbles:true,clientX:40,clientY:20}));await pause(460);
  const host=w.document.getElementById('leafread-web-tooltip'),root=host.shadowRoot;
  assert.match(root.querySelector('.result').textContent,/扩展已更新.*刷新/);assert.doesNotMatch(root.textContent,/Extension context invalidated/);
  assert.equal(root.querySelector('.save').disabled,true);assert.equal(root.querySelector('[aria-label="朗读单词"]').disabled,true);
  const count=requests.length;changes[0]({leafSettings:{newValue:{webEnabled:true,delay:.4}}},'local');
  p.dispatchEvent(new w.MouseEvent('pointermove',{bubbles:true,clientX:45,clientY:20}));p.dispatchEvent(new w.MouseEvent('pointerdown',{bubbles:true}));p.dispatchEvent(new w.MouseEvent('pointerup',{bubbles:true}));await pause(460);
  assert.equal(requests.length,count);w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape'}));assert.equal(host.style.display,'none');dom.window.close();
});

test('a missing runtime id is detected before querying, and a refreshed context can look up normally',async()=>{
  const old=await contentWindow();delete old.w.chrome.runtime.id;
  old.w.document.querySelector('p').dispatchEvent(new old.w.MouseEvent('pointermove',{bubbles:true,clientX:40,clientY:20}));await pause(460);
  assert.match(old.w.document.getElementById('leafread-web-tooltip').shadowRoot.querySelector('.result').textContent,/Ctrl\+R/);assert.equal(old.requests.filter(m=>m.type==='leaf:lookup').length,0);old.dom.window.close();
  const fresh=await contentWindow();fresh.w.document.querySelector('p').dispatchEvent(new fresh.w.MouseEvent('pointermove',{bubbles:true,clientX:40,clientY:20}));await pause(460);
  assert.match(fresh.w.document.getElementById('leafread-web-tooltip').shadowRoot.querySelector('.result').textContent,/筋疲力尽/);fresh.dom.window.close();
});

test('shared messaging translates synchronous invalidation while preserving real dictionary failures',async()=>{
  const dom=textWindow('<p>quiet</p>'),w=dom.window;w.eval(source('shared.js'));
  w.chrome={runtime:{id:'our-id',sendMessage(){throw new Error('Extension context invalidated.');}}};
  await assert.rejects(w.LeafShared.sendExtension({type:'leaf:lookup'}),error=>error.code==='LEAF_CONTEXT_INVALIDATED'&&/刷新/.test(error.message));
  await assert.rejects(w.LeafShared.sendExtension({type:'leaf:lookup'},'popup'),/关闭这个面板/);
  w.chrome.runtime.sendMessage=async()=>({ok:false,error:'在线词典暂时不可用'});await assert.rejects(w.LeafShared.sendExtension({type:'leaf:lookup'}),/在线词典暂时不可用/);dom.window.close();
});

test('dictionary rejection falls back to a clearly labeled translation without forwarding context',async()=>{
  const requests=[];const service=global.LeafShared.createService(storage(),async(url,options)=>{
    requests.push({url,options});return new URL(url).hostname==='dict.youdao.com'?{ok:false,status:403}:{ok:true,status:200,json:async()=>({responseStatus:200,quotaFinished:'false',responseData:{translatedText:'偶然发现'}})};
  });
  const result=await service.lookup('serendipity');assert.match(result.source,/参考翻译.*主词典/);assert.equal(result.pronunciation,'');assert.equal(requests.length,2);
  assert.equal(new URL(requests[1].url).searchParams.get('q'),'serendipity');assert.equal(requests[1].options.credentials,'omit');assert.equal(requests[1].options.referrerPolicy,'no-referrer');
});

test('sentence translation normalizes selection whitespace and preserves case in cached queries',async()=>{
  const requests=[];const service=global.LeafShared.createService(storage(),async(url)=>{requests.push(new URL(url).searchParams.get('q'));return {ok:true,json:async()=>({responseStatus:200,quotaFinished:false,responseData:{translatedText:'完整的句子译文'}})};});
  const sentence='After a difficult week, she decided to take a short break and read a book before returning to the station to begin another long journey.';
  assert.ok(sentence.length>120);await service.lookup(sentence.replace('a short','a\n  short'));assert.deepEqual(requests,[sentence]);await service.lookup(sentence);assert.equal(requests.length,1);
  await service.lookup(sentence.toUpperCase());assert.equal(requests.length,2);
});

test('long translations respect each UTF-8 segment limit and never cache a partial failure',async()=>{
  const text=('A gentle breeze moved through the trees — and everyone felt calm. ').repeat(13).trim();
  const chunks=global.LeafShared.translationChunks(text);assert.ok(chunks.length>1);assert.equal(chunks.join(' '),text);chunks.forEach(chunk=>assert.ok(Buffer.byteLength(chunk,'utf8')<=500));
  const backing=storage();let calls=0;const service=global.LeafShared.createService(backing,async(url)=>{calls++;assert.ok(Buffer.byteLength(new URL(url).searchParams.get('q'),'utf8')<=500);return calls===2?{ok:false,status:429}:{ok:true,json:async()=>({responseStatus:200,responseData:{translatedText:'微风吹过树林。'}})};});
  await assert.rejects(service.lookup(text),/请求过多|额度/);assert.equal((await backing.get(['leafCache'])).leafCache,undefined);
  const result=await service.lookup(text);assert.match(result.source,/分段/);assert.equal(result.text.split('微风吹过树林。').length-1,chunks.length);
  const completedCalls=calls;await service.lookup(text);assert.equal(calls,completedCalls);
});

test('quota, malformed responses and connection failures are explained and can recover on retry',async()=>{
  const sentence='This is a sentence to translate.';
  for(const data of [{responseStatus:429,responseDetails:'quota'},{responseStatus:200,quotaFinished:true,responseData:{translatedText:'DAILY LIMIT'}},{responseStatus:500,responseData:{translatedText:'bad'}}]){
    await assert.rejects(global.LeafShared.query(sentence,async()=>({ok:true,json:async()=>data})),/额度|有效译文/);
  }
  let fail=true;const service=global.LeafShared.createService(storage(),async()=>{if(fail)throw new TypeError('Failed to fetch');return {ok:true,json:async()=>({responseStatus:200,responseData:{translatedText:'这是一个句子。'}})};});
  await assert.rejects(service.lookup(sentence),/检查网络或代理/);fail=false;assert.equal((await service.lookup(sentence)).text,'这是一个句子。');
  assert.throws(()=>global.LeafShared.validateText(('a ').repeat(800)),/1500/);
});

test('hover offers sentence translation and retry keeps the same source text',async()=>{
  let failSentence=true;const {dom,w,requests}=await contentWindow(message=>({ok:message.text==='exhausted'||!failSentence,data:{text:'她感到筋疲力尽。',source:'test'},error:'免费额度已用完'}));
  w.document.querySelector('p').dispatchEvent(new w.MouseEvent('pointermove',{bubbles:true,clientX:40,clientY:20}));await pause(460);
  const root=w.document.getElementById('leafread-web-tooltip').shadowRoot;const sentenceButton=[...root.querySelectorAll('button')].find(x=>x.textContent==='翻译整句');assert.equal(sentenceButton.hidden,false);sentenceButton.click();await pause(20);
  assert.equal(root.querySelector('strong').textContent,'整句翻译');assert.equal(root.querySelector('.original').textContent,'After a difficult week, she felt exhausted.');assert.match(root.querySelector('.result').textContent,/额度/);
  const retry=[...root.querySelectorAll('button')].find(x=>x.textContent==='重试');assert.equal(retry.hidden,false);failSentence=false;retry.click();await pause(20);
  assert.equal(root.querySelector('.result').textContent,'她感到筋疲力尽。');assert.equal(retry.hidden,true);assert.equal(requests.filter(m=>m.type==='leaf:lookup').at(-1).text,'After a difficult week, she felt exhausted.');dom.window.close();
});

test('mouse and keyboard selections translate more than 120 characters and oversized selections show a hint',async()=>{
  for(const keyboard of [false,true]){
    const {dom,w,requests}=await contentWindow();const p=w.document.querySelector('p');p.textContent='This English sentence is deliberately longer than the old selection limit, so readers can translate the complete sentence without cutting it into smaller pieces.';
    if(!keyboard)p.dispatchEvent(new w.MouseEvent('pointerdown',{bubbles:true,button:0}));
    const range=w.document.createRange();range.selectNodeContents(p);const selection=w.getSelection();selection.removeAllRanges();selection.addRange(range);
    if(keyboard)w.document.dispatchEvent(new w.KeyboardEvent('keyup',{key:'Shift'}));else p.dispatchEvent(new w.MouseEvent('pointerup',{bubbles:true,button:0}));await pause(130);
    assert.equal(requests.find(m=>m.type==='leaf:lookup').text,p.textContent);assert.equal(w.document.getElementById('leafread-web-tooltip').shadowRoot.querySelector('strong').textContent,'整句翻译');dom.window.close();
  }
  const {dom,w}=await contentWindow(message=>{try{w.LeafShared.validateText(message.text);return {ok:true,data:{text:'test'}};}catch(error){return {ok:false,error:error.message};}});
  const p=w.document.querySelector('p');p.textContent=('English text ').repeat(130);const range=w.document.createRange();range.selectNodeContents(p);w.getSelection().addRange(range);w.document.dispatchEvent(new w.KeyboardEvent('keyup',{key:'Shift'}));await pause(130);
  assert.match(w.document.getElementById('leafread-web-tooltip').shadowRoot.querySelector('.result').textContent,/1500/);dom.window.close();
});
