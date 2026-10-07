(function(root){
  'use strict';
  const defaults={font:22,line:1.9,delay:1,alt:false,online:true,theme:'paper',webEnabled:true,disabledHosts:[]};
  function normalizeSettings(raw={}){
    raw=raw&&typeof raw==='object'?raw:{};
    const result={...defaults,disabledHosts:[]};
    for(const [key,min,max] of [['font',17,30],['line',1.5,2.3],['delay',.4,3]])if(typeof raw[key]==='number'&&Number.isFinite(raw[key]))result[key]=Math.max(min,Math.min(max,raw[key]));
    for(const key of ['alt','online','webEnabled'])if(typeof raw[key]==='boolean')result[key]=raw[key];
    if(['paper','night'].includes(raw.theme))result.theme=raw.theme;
    if(Array.isArray(raw.disabledHosts))result.disabledHosts=[...new Set(raw.disabledHosts.filter(h=>typeof h==='string'&&/^[a-z0-9.-]+$/i.test(h)&&h.length<255))].slice(0,300);
    return result;
  }
  const MAX_TEXT=1500;
  function isSingle(value){return /^[A-Za-z]+(?:['’-][A-Za-z]+)*$/.test(value);}
  function validateText(value){
    if(typeof value!=='string'||!/[a-z]/i.test(value))throw new Error('请选择包含英文的单词或句子。');
    const text=value.replace(/\s+/g,' ').trim();
    if(!text||text.length>MAX_TEXT)throw new Error('选中文字过长，请缩小到 1500 个字符以内再翻译。');
    if(isSingle(text)&&text.length>120)throw new Error('单个单词不能超过 120 个字符。');
    return text;
  }
  function translationChunks(text){
    // Keep every request below the provider's segment limit, including Unicode punctuation.
    const chunks=[];let part='',bytes=0;
    for(const char of text){const cp=char.codePointAt(0),size=cp<=127?1:cp<=2047?2:cp<=65535?3:4;
      if(bytes+size>500){
        const boundary=Math.max(part.lastIndexOf('. '),part.lastIndexOf('! '),part.lastIndexOf('? '),part.lastIndexOf('; '));
        const cut=boundary>=part.length/2?boundary+1:part.lastIndexOf(' ');
        const split=cut>0?cut:part.length;chunks.push(part.slice(0,split).trim());part=part.slice(split).trimStart();
        bytes=Array.from(part).reduce((n,c)=>n+(c.codePointAt(0)<=127?1:c.codePointAt(0)<=2047?2:c.codePointAt(0)<=65535?3:4),0);
      }
      part+=char;bytes+=size;
    }
    if(part.trim())chunks.push(part.trim());return chunks;
  }
  function plain(value){return String(value||'').replace(/<[^>]*>/g,'').replace(/&(?:amp|lt|gt|quot|apos|#39|nbsp);/g,x=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&#39;':"'",'&nbsp;':' '})[x]).slice(0,4000);}
  function cleanEntry(raw,preserveId=false){
    if(!raw||typeof raw!=='object')throw new Error('生词记录无效。');
    const word=validateText(raw.word);if(typeof raw.translation!=='string'||!raw.translation.trim())throw new Error('尚未取得释义。');
    let url='';try{const parsed=new URL(raw.url);if(['https:','http:'].includes(parsed.protocol))url=parsed.href.slice(0,3000);}catch{}
    return {id:preserveId&&typeof raw.id==='string'?raw.id:root.crypto.randomUUID(),word,translation:raw.translation.slice(0,4000),sentence:String(raw.sentence||'').slice(0,1200),book:String(raw.book||'网页阅读').slice(0,300),bookId:String(raw.bookId||'web:'+url).slice(0,3000),url,added:preserveId&&Number.isFinite(raw.added)?raw.added:Date.now()};
  }
  function sameEntry(a,b){return a.word.toLowerCase()===b.word.toLowerCase()&&a.sentence===b.sentence&&a.bookId===b.bookId;}
  function isContextInvalidated(error){return error?.code==='LEAF_CONTEXT_INVALIDATED'||/extension context invalidated/i.test(String(error?.message||error||''));}
  async function sendExtension(message,surface='page'){
    try{
      if(!root.chrome?.runtime?.id){const error=new Error('Extension context invalidated.');error.code='LEAF_CONTEXT_INVALIDATED';throw error;}
      const response=await root.chrome.runtime.sendMessage(message);
      if(!response?.ok)throw new Error(response?.error||'扩展服务暂不可用，请重新打开扩展后重试。');
      return response.data;
    }catch(error){
      if(!isContextInvalidated(error))throw error;
      const friendly=new Error(surface==='popup'?'扩展已更新，请关闭这个面板，再点击扩展图标重新打开。':'扩展已更新，请刷新当前网页后继续查词（Ctrl+R）。');
      friendly.code='LEAF_CONTEXT_INVALIDATED';throw friendly;
    }
  }
  function serviceError(code,message){const error=new Error(message);error.code=code;return error;}
  async function requestJSON(endpoint,fetcher,signal){
    let response;
    try{response=await fetcher(endpoint,{signal:signal||AbortSignal.timeout(8000),credentials:'omit',referrerPolicy:'no-referrer'});}
    catch(error){if(signal?.aborted)throw error;throw serviceError('LEAF_NETWORK',error.name==='TimeoutError'||error.name==='AbortError'?'在线查询连接超时，请稍后重试。':'无法连接在线服务，请检查网络或代理后重试。');}
    if(response.status===429)throw serviceError('LEAF_QUOTA','在线服务请求过多或免费额度已用完，请稍后再试。公共代理可能共享额度。');
    if(!response.ok)throw serviceError('LEAF_HTTP','在线服务暂不可用（HTTP '+(response.status||'错误')+'），请稍后重试。');
    try{return await response.json();}catch{throw serviceError('LEAF_RESPONSE','在线服务返回了无法识别的数据，请重试。');}
  }
  async function translate(text,fetcher,signal){
    const chunks=translationChunks(text),translated=[];
    for(const chunk of chunks){
      const data=await requestJSON('https://api.mymemory.translated.net/get?q='+encodeURIComponent(chunk)+'&langpair=en%7Czh-CN',fetcher,signal);
      if(data.quotaFinished===true||data.quotaFinished==='true'||Number(data.responseStatus)===429||/DAILY LIMIT|USED ALL AVAILABLE|QUOTA|TOO MANY REQUESTS/i.test(data.responseDetails||''))throw serviceError('LEAF_QUOTA','翻译服务的免费额度已用完，请稍后再试。公共代理可能共享额度。');
      if(Number(data.responseStatus)!==200||typeof data.responseData?.translatedText!=='string'||!data.responseData.translatedText.trim())throw serviceError('LEAF_TRANSLATION','翻译服务暂未返回有效译文，请稍后重试。');
      translated.push(plain(data.responseData.translatedText));
    }
    return {text:translated.join(' '),source:chunks.length>1?'MyMemory · 整句参考翻译（分段）':'MyMemory · 参考翻译',pronunciation:''};
  }
  async function query(text,fetcher,online=true,signal){
    text=validateText(text);const key=text.toLowerCase().replace(/’/g,"'");
    if(Object.hasOwn(root.LeafCore.dictionary,key))return {text:root.LeafCore.dictionary[key],source:'内置词库 · 常见释义',pronunciation:''};
    if(!online)throw new Error('离线词库暂未收录这个词。可在插件设置中开启在线查词。');
    if(!isSingle(text))return translate(text,fetcher,signal);
    try{
      const data=await requestJSON('https://dict.youdao.com/jsonapi?q='+encodeURIComponent(text),fetcher,signal);
      const word=data.ec?.word?.[0];const definitions=word?.trs?.flatMap(t=>t.tr?.flatMap(x=>Array.isArray(x.l?.i)?x.l.i:[])||[])||[];
      if(!definitions.length)throw serviceError('LEAF_NOT_FOUND','词典暂未找到中文释义。');
      return {text:definitions.slice(0,5).map(plain).join('\n'),source:'有道词典 · 常见释义',pronunciation:word.usphone?'/'+String(word.usphone).slice(0,120)+'/':''};
    }catch(error){
      if(signal?.aborted)throw error;
      try{const result=await translate(text,fetcher,signal);return {...result,source:'MyMemory · 单词参考翻译（主词典暂不可用）'};}
      catch(fallback){throw serviceError(fallback.code||'LEAF_SERVICE','主词典与备用服务均未能完成查询。'+fallback.message);}
    }
  }
  function createService(storage,fetcher){
    let queue=Promise.resolve();const pending=new Map();
    function mutate(task){const promise=queue.then(task);queue=promise.catch(()=>{});return promise;}
    async function settings(){return normalizeSettings((await storage.get(['leafSettings'])).leafSettings);}
    return {
      settings,
      updateSettings(patch){return mutate(async()=>{const next=normalizeSettings({...await settings(),...patch});await storage.set({leafSettings:next});return next;});},
      async lookup(text){
        text=validateText(text);const wordKey=text.toLowerCase().replace(/’/g,"'");const key=isSingle(text)?wordKey:'text:'+text;
        if(Object.hasOwn(root.LeafCore.dictionary,wordKey))return query(text,fetcher,false);
        const data=await storage.get(['leafCache','leafSettings']);const cached=data.leafCache&&Object.hasOwn(data.leafCache,key)?data.leafCache[key]:null;if(cached)return {...cached,source:cached.source+' · 本地缓存'};
        if(!normalizeSettings(data.leafSettings).online)throw new Error('离线词库暂未收录这个词，请开启在线查词。');
        if(pending.has(key))return pending.get(key);
        const promise=(async()=>{const result=await query(text,fetcher);await mutate(async()=>{const cache=Object.assign(Object.create(null),(await storage.get(['leafCache'])).leafCache||{});cache[key]=result;while(Object.keys(cache).length>1000)delete cache[Object.keys(cache)[0]];await storage.set({leafCache:cache});});return result;})();
        pending.set(key,promise);try{return await promise;}finally{pending.delete(key);}
      },
      async vocabulary(){return (await storage.get(['leafVocab'])).leafVocab||[];},
      save(raw){return mutate(async()=>{const entry=cleanEntry(raw);const list=(await storage.get(['leafVocab'])).leafVocab||[];if(!list.some(v=>sameEntry(v,entry)))list.unshift(entry);if(list.length>5000)throw new Error('生词本已满，请先导出并移除部分记录。');await storage.set({leafVocab:list});return list;});},
      remove(id){return mutate(async()=>{const list=((await storage.get(['leafVocab'])).leafVocab||[]).filter(v=>v.id!==id);await storage.set({leafVocab:list});return list;});},
      migrate(raw){return mutate(async()=>{const data=await storage.get(['leafVocab','leafSettings','leafReaderMigrated']);if(!data.leafReaderMigrated){const list=data.leafVocab||[];for(const old of (Array.isArray(raw.vocab)?raw.vocab:[]).slice(0,5000)){try{const entry=cleanEntry(old,true);if(!list.some(v=>sameEntry(v,entry)))list.push(entry);}catch{}}await storage.set({leafVocab:list.slice(0,5000),leafSettings:normalizeSettings({...raw.settings,...data.leafSettings}),leafReaderMigrated:true});}return {vocab:await this.vocabulary(),settings:await settings()};});}
    };
  }
  root.LeafShared={defaults,normalizeSettings,MAX_TEXT,isSingle,validateText,translationChunks,plain,cleanEntry,sameEntry,isContextInvalidated,sendExtension,query,createService};
})(globalThis);
