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
  function validateText(value){if(typeof value!=='string'||!value.trim()||value.length>120||!/[a-z]/i.test(value))throw new Error('请选择 120 个字符以内的英文单词或短语。');return value.trim();}
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
  async function query(text,fetcher,online=true,signal){
    text=validateText(text);const key=text.toLowerCase().replace(/’/g,"'");
    if(Object.hasOwn(root.LeafCore.dictionary,key))return {text:root.LeafCore.dictionary[key],source:'内置词库 · 常见释义',pronunciation:''};
    if(!online)throw new Error('离线词库暂未收录这个词。可在插件设置中开启在线查词。');
    const single=/^[A-Za-z]+(?:['’-][A-Za-z]+)*$/.test(text);
    const endpoint=single?'https://dict.youdao.com/jsonapi?q='+encodeURIComponent(text):'https://api.mymemory.translated.net/get?q='+encodeURIComponent(text)+'&langpair=en%7Czh-CN';
    const response=await fetcher(endpoint,{signal:signal||AbortSignal.timeout(12000),credentials:'omit',referrerPolicy:'no-referrer'});
    if(!response.ok)throw new Error('在线词典暂时不可用，请稍后重试。');const data=await response.json();
    if(single){
      const word=data.ec?.word?.[0];const definitions=word?.trs?.flatMap(t=>t.tr?.flatMap(x=>Array.isArray(x.l?.i)?x.l.i:[])||[])||[];
      if(!definitions.length)throw new Error('词典暂未找到中文释义。可以选中短语再查。');
      return {text:definitions.slice(0,5).map(plain).join('\n'),source:'有道词典 · 常见释义',pronunciation:word.usphone?'/'+String(word.usphone).slice(0,120)+'/':''};
    }
    if(Number(data.responseStatus)!==200||data.quotaFinished||!data.responseData?.translatedText)throw new Error('短语翻译暂不可用或免费额度已用完。');
    return {text:plain(data.responseData.translatedText),source:'MyMemory · 短语参考翻译',pronunciation:''};
  }
  function createService(storage,fetcher){
    let queue=Promise.resolve();const pending=new Map();
    function mutate(task){const promise=queue.then(task);queue=promise.catch(()=>{});return promise;}
    async function settings(){return normalizeSettings((await storage.get(['leafSettings'])).leafSettings);}
    return {
      settings,
      updateSettings(patch){return mutate(async()=>{const next=normalizeSettings({...await settings(),...patch});await storage.set({leafSettings:next});return next;});},
      async lookup(text){
        text=validateText(text);const key=text.toLowerCase().replace(/’/g,"'");
        if(Object.hasOwn(root.LeafCore.dictionary,key))return query(text,fetcher,false);
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
  root.LeafShared={defaults,normalizeSettings,validateText,plain,cleanEntry,sameEntry,isContextInvalidated,sendExtension,query,createService};
})(globalThis);
