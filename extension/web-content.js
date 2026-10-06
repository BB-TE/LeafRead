(function(){
  'use strict';
  const extension=Boolean(globalThis.chrome?.runtime?.id);
  const demo=document.documentElement.hasAttribute('data-leafread-demo')&&['127.0.0.1','localhost'].includes(location.hostname);
  // The local demo loads the UI itself; avoid two copies when the extension is installed.
  if(extension&&demo)return;
  if((!extension&&!demo)||document.querySelector('meta[name="leafread-reader"]')||globalThis.__leafreadWebLoaded)return;
  globalThis.__leafreadWebLoaded=true;
  const S=LeafShared,T=LeafWebText;
  const events=new AbortController();let invalidated=false;
  function listen(target,type,listener,options={}){target.addEventListener(type,listener,{...options,signal:events.signal});}
  let config={settings:S.normalizeSettings(),siteHost:location.hostname,pageUrl:location.href,pageTitle:document.title},ready=false;
  let timer,closeTimer,sequence=0,candidate,active,lookup,down=false,lastEvent,frame;
  let host,shadow,fields;
  const localService=demo&&!extension?S.createService({
    async get(keys){const result={};for(const key of keys){const alias={leafSettings:'settings',leafVocab:'vocab',leafCache:'cache'}[key]||key;try{result[key]=JSON.parse(localStorage.getItem('leaf:'+alias));}catch{}}return result;},
    async set(data){for(const [key,value] of Object.entries(data)){const alias={leafSettings:'settings',leafVocab:'vocab',leafCache:'cache'}[key]||key;localStorage.setItem('leaf:'+alias,JSON.stringify(value));}}
  },(url,options)=>fetch(url.startsWith('https://dict.youdao.com')?'/api/dictionary'+new URL(url).search:'/api/phrase'+new URL(url).search,options)):null;
  async function send(message){
    if(extension){try{return await S.sendExtension(message);}catch(error){if(S.isContextInvalidated(error))retire();throw error;}}
    switch(message.type){case 'leaf:config':return {...config,settings:await localService.settings()};case 'leaf:lookup':return localService.lookup(message.text);case 'leaf:save':return localService.save(message.entry);case 'leaf:vocab':return localService.vocabulary();default:throw new Error('不支持的操作。');}
  }
  function retire(){
    invalidated=true;ready=false;clearTimeout(timer);clearTimeout(closeTimer);closeTimer=null;candidate=null;lookup=null;down=false;
    if(frame){cancelAnimationFrame(frame);frame=null;}events.abort();
    if(globalThis.CSS?.highlights)CSS.highlights.delete('leafread-web-word');
    if(fields){fields.save.disabled=true;fields.speak.disabled=true;}
  }
  function enabled(){return ready&&config.settings.webEnabled&&!config.settings.disabledHosts.includes(config.siteHost);}
  function ensureUI(){
    if(host?.isConnected)return;
    host=document.createElement('div');host.id='leafread-web-tooltip';host.setAttribute('popover','manual');host.style.setProperty('display','none','important');
    shadow=host.attachShadow({mode:'open'});
    const style=document.createElement('style');style.textContent=`
      :host{font:14px/1.6 "Segoe UI","Microsoft YaHei",sans-serif;color:#303b32;text-align:left;direction:ltr}
      *{box-sizing:border-box}section{background:#fffef9;border:1px solid #dfe3d7;border-radius:12px;padding:16px 18px 13px;box-shadow:0 8px 35px #20302026;width:100%;font:14px/1.7 "Segoe UI","Microsoft YaHei",sans-serif;color:#303b32}
      header{display:flex;align-items:center;gap:7px}strong{font:600 23px/1.35 Georgia,serif;flex:1;overflow-wrap:anywhere}button{font:inherit;cursor:pointer;border:0;background:transparent;border-radius:5px;color:#6a7868;padding:4px 6px}button:focus-visible{outline:2px solid #619477}button:disabled{opacity:.5;cursor:default}
      .phonetic{font-size:12px;color:#7c8379;margin-top:6px}.result{white-space:pre-line;font-size:14px;line-height:1.8;margin:13px 0 8px;max-height:210px;overflow:auto}.source{color:#7c8379;font-size:10px;margin-bottom:10px}.save{width:100%;border-top:1px solid #e2e3d8;padding:11px 0 0;text-align:left;color:#345e49;font-size:12px}.error{color:#986443}
    `;
    const section=document.createElement('section');section.setAttribute('role','region');section.setAttribute('aria-label','LeafRead 单词释义');section.setAttribute('aria-live','polite');
    const header=document.createElement('header');const word=document.createElement('strong');const speak=document.createElement('button');speak.textContent='◖))';speak.setAttribute('aria-label','朗读单词');const close=document.createElement('button');close.textContent='×';close.setAttribute('aria-label','关闭释义');header.append(word,speak,close);
    const pronunciation=document.createElement('div');pronunciation.className='phonetic';const result=document.createElement('div');result.className='result';const source=document.createElement('div');source.className='source';const save=document.createElement('button');save.className='save';save.textContent='＋ 加入生词本';section.append(header,pronunciation,result,source,save);shadow.append(style,section);document.documentElement.append(host);fields={word,pronunciation,result,source,save,speak};
    close.onclick=hide;
    host.addEventListener('pointerenter',()=>{clearTimeout(closeTimer);closeTimer=null;});host.addEventListener('pointerleave',()=>{clearTimeout(closeTimer);closeTimer=setTimeout(hide,250);});
    speak.onclick=()=>{if(!lookup||!('speechSynthesis' in window))return;const voice=new SpeechSynthesisUtterance(lookup.word);voice.lang='en-US';voice.rate=.85;speechSynthesis.cancel();speechSynthesis.speak(voice);};
    save.onclick=async()=>{
      if(!lookup?.translation)return;const savedLookup=lookup;const currentSequence=sequence;save.disabled=true;
      try{await send({type:'leaf:save',entry:{word:savedLookup.word,translation:savedLookup.translation,sentence:savedLookup.sentence,book:config.pageTitle||document.title||config.siteHost,bookId:'web:'+config.pageUrl,url:config.pageUrl}});if(currentSequence===sequence)save.textContent='✓ 已保存单词和原句';}
      catch(e){if(currentSequence===sequence){save.disabled=invalidated;source.textContent='保存失败：'+e.message;}}
    };
  }
  function hide(){
    clearTimeout(timer);clearTimeout(closeTimer);closeTimer=null;sequence++;candidate=null;active=null;lookup=null;
    if(host){if(host.matches(':popover-open'))host.hidePopover();host.style.setProperty('display','none','important');}
    if(globalThis.CSS?.highlights)CSS.highlights.delete('leafread-web-word');
  }
  function place(range){
    if(!host||!range.startContainer.isConnected){hide();return;}
    const rect=range.getBoundingClientRect();const width=Math.min(320,innerWidth-24);host.style.setProperty('width',width+'px','important');
    const height=host.getBoundingClientRect().height;const below=rect.bottom+9;const top=below+height<=innerHeight-12?below:Math.max(12,rect.top-height-9);
    host.style.setProperty('left',Math.max(12,Math.min(rect.left,innerWidth-width-12))+'px','important');host.style.setProperty('top',Math.min(top,Math.max(12,innerHeight-height-12))+'px','important');
  }
  async function show(word){
    if(!enabled()||!word.range.startContainer.isConnected)return;
    if(window===window.top){config.pageUrl=location.href;config.pageTitle=document.title||config.pageTitle;}
    ensureUI();clearTimeout(closeTimer);const currentSequence=++sequence;active=word;lookup={word:word.word,sentence:word.sentence,translation:null};
    fields.word.textContent=word.word;fields.pronunciation.textContent='';fields.result.textContent='正在查词……';fields.result.classList.remove('error');fields.source.textContent='';fields.save.disabled=true;fields.save.textContent='＋ 加入生词本';
    host.style.setProperty('display','block','important');if(typeof host.showPopover==='function'&&!host.matches(':popover-open'))host.showPopover();
    if(globalThis.CSS?.highlights&&globalThis.Highlight)CSS.highlights.set('leafread-web-word',new Highlight(word.range));place(word.range);
    try{
      const result=await send({type:'leaf:lookup',text:word.word});if(currentSequence!==sequence||invalidated)return;
      lookup.translation=result.text;fields.result.textContent=result.text;fields.source.textContent=result.source;fields.pronunciation.textContent=result.pronunciation||'';fields.save.disabled=false;place(word.range);
      const list=await send({type:'leaf:vocab'});if(currentSequence!==sequence||invalidated)return;
      if(list.some(v=>S.sameEntry(v,{word:word.word,sentence:word.sentence,bookId:'web:'+config.pageUrl}))){fields.save.textContent='✓ 已加入生词本';fields.save.disabled=true;}
    }catch(e){if(currentSequence!==sequence)return;fields.result.classList.add('error');fields.result.textContent=e.message;fields.source.textContent='LeafRead · 书页阅读不受影响';place(word.range);}
  }
  function move(event){
    if(!enabled()||down||event.buttons||getSelection()?.toString().trim())return;
    if(event.path.includes(host)){clearTimeout(closeTimer);closeTimer=null;return;}
    const target=event.path.find(n=>n instanceof Element);const next=T.atPoint(event.clientX,event.clientY,target);
    if(!next){clearTimeout(timer);candidate=null;if(active&&!closeTimer)closeTimer=setTimeout(()=>{closeTimer=null;hide();},250);return;}
    clearTimeout(closeTimer);closeTimer=null;
    if(T.same(next,candidate))return;
    hide();candidate=next;
    if(config.settings.alt&&!event.altKey)return;
    timer=setTimeout(()=>{if(T.same(candidate,next))show(next);},config.settings.delay*1000);
  }
  listen(document,'pointermove',event=>{
    // Event paths are cleared after dispatch; retain the path before processing in the next frame.
    lastEvent={path:event.composedPath(),clientX:event.clientX,clientY:event.clientY,buttons:event.buttons,altKey:event.altKey};
    if(!frame)frame=requestAnimationFrame(()=>{frame=null;move(lastEvent);});
  },{passive:true});
  listen(document,'pointerdown',event=>{if(event.composedPath().includes(host))return;down=true;hide();},{passive:true});
  listen(document,'pointerup',event=>{
    if(!down)return;down=false;if(!enabled()||event.button!==0)return;const selection=getSelection();const word=selection?.toString().trim();if(!word||word.length>120||!/[a-z]/i.test(word)||!selection.rangeCount)return;
    const range=selection.getRangeAt(0).cloneRange();const element=range.commonAncestorContainer.nodeType===Node.ELEMENT_NODE?range.commonAncestorContainer:range.commonAncestorContainer.parentElement;if(T.excluded(element))return;
    show({word,range,sentence:element.closest('p,li,blockquote,div')?.textContent.trim().slice(0,1200)||word});
  },{passive:true});
  listen(document,'keydown',event=>{if(event.key==='Escape')hide();if(event.key==='Alt'&&config.settings.alt&&candidate){const next=candidate;clearTimeout(timer);timer=setTimeout(()=>{if(T.same(next,candidate))show(next);},config.settings.delay*1000);}});
  listen(document,'keyup',event=>{if(event.key==='Alt'&&config.settings.alt)hide();});
  // Keep dismissal active after retirement so the refresh hint can still be closed.
  document.addEventListener('keydown',event=>{if(invalidated&&event.key==='Escape')hide();});
  document.addEventListener('scroll',event=>{if(event.composedPath().includes(host))return;hide();},{capture:true,passive:true});
  listen(document,'pointerout',event=>{if(!event.relatedTarget)hide();});
  window.addEventListener('blur',()=>{down=false;hide();});window.addEventListener('resize',hide);
  if(extension){
    chrome.storage.onChanged.addListener((changes,area)=>{if(!invalidated&&area==='local'&&changes.leafSettings){config.settings=S.normalizeSettings(changes.leafSettings.newValue);hide();}});
    chrome.runtime.onMessage.addListener((message,sender,respond)=>{if(!invalidated&&message.type==='leaf:ping'){respond({ok:true,enabled:enabled(),version:'0.5.0'});}});
  }else window.addEventListener('storage',event=>{if(event.key==='leaf:settings'){try{config.settings=S.normalizeSettings(JSON.parse(event.newValue));hide();}catch{}}});
  send({type:'leaf:config'}).then(data=>{if(invalidated)return;config={...config,...data};ready=true;if(demo)document.documentElement.dataset.leafreadReady='true';}).catch(()=>{});
})();
