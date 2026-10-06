// Served only by the loopback preview server; never loaded by the extension.
(function(){
  'use strict';
  const changes=[];
  const aliases={leafSettings:'settings',leafVocab:'vocab',leafCache:'cache'};
  // Preserve words saved in the earlier popup preview while sharing data with the reader.
  if(!localStorage.getItem('leaf:popup-preview-migrated')){
    try{
      const legacy=JSON.parse(localStorage.getItem('leaf-popup-preview:leafVocab')||'[]'),words=JSON.parse(localStorage.getItem('leaf:vocab')||'[]');
      for(const entry of legacy)if(!words.some(word=>LeafShared.sameEntry(word,entry)))words.push(entry);
      localStorage.setItem('leaf:vocab',JSON.stringify(words));
      for(const key of ['leafSettings','leafCache'])if(!localStorage.getItem('leaf:'+aliases[key])&&localStorage.getItem('leaf-popup-preview:'+key))localStorage.setItem('leaf:'+aliases[key],localStorage.getItem('leaf-popup-preview:'+key));
      localStorage.setItem('leaf:popup-preview-migrated','true');
    }catch{}
  }
  const storage={
    async get(keys){return Object.fromEntries(keys.map(key=>{let value;try{value=JSON.parse(localStorage.getItem('leaf:'+(aliases[key]||key)));}catch{}return [key,value];}));},
    async set(values){const event={};for(const [key,value] of Object.entries(values)){localStorage.setItem('leaf:'+(aliases[key]||key),JSON.stringify(value));event[key]={newValue:value};}changes.forEach(fn=>fn(event,'local'));}
  };
  const service=LeafShared.createService(storage,(url,options)=>{const parsed=new URL(url);return fetch((parsed.hostname==='dict.youdao.com'?'/api/dictionary':'/api/phrase')+'?q='+encodeURIComponent(parsed.searchParams.get('q')),options);});
  window.chrome={
    runtime:{id:'preview',getURL:path=>path,async sendMessage(message){try{let data;switch(message.type){
      case 'leaf:settings-get':data=await service.settings();break;
      case 'leaf:settings-set':data=await service.updateSettings(message.patch);break;
      case 'leaf:lookup':data=await service.lookup(message.text);break;
      case 'leaf:vocab':data=await service.vocabulary();break;
      case 'leaf:save':data=await service.save(message.entry);break;
      default:throw new Error('预览暂不支持此操作。');
    }return {ok:true,data};}catch(error){return {ok:false,error:error.message};}}},
    tabs:{async query(){return [{id:1,url:'https://example.com/article'}];},async sendMessage(){return {version:'0.5.0'};},async create({url}){window.open(url,'_blank');}},
    storage:{onChanged:{addListener(fn){changes.push(fn);}}}
  };
  const note=document.querySelector('.note');note.textContent='弹窗交互预览。预览数据与正式扩展分开保存；正式使用请在 Chrome 加载扩展。';
  window.addEventListener('storage',event=>{const key=Object.keys(aliases).find(key=>event.key==='leaf:'+aliases[key]);if(key){let value;try{value=JSON.parse(event.newValue);}catch{}changes.forEach(fn=>fn({[key]:{newValue:value}},'local'));}});
})();
