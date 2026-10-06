'use strict';
importScripts('core.js','shared.js');
const service=LeafShared.createService(chrome.storage.local,fetch);
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  if(sender.id!==chrome.runtime.id||!message||typeof message.type!=='string')return;
  const extensionPage=sender.url?.startsWith(chrome.runtime.getURL(''));
  (async()=>{
    switch(message.type){
      case 'leaf:config': {
        const url=sender.tab?.url||sender.url||'';let siteHost='';try{siteHost=new URL(url).hostname;}catch{}
        return {settings:await service.settings(),siteHost,pageUrl:url,pageTitle:sender.tab?.title||''};
      }
      case 'leaf:lookup':return service.lookup(message.text);
      case 'leaf:save':return service.save(message.entry);
      case 'leaf:vocab':return service.vocabulary();
      case 'leaf:remove':return service.remove(message.id);
      case 'leaf:settings-get':if(extensionPage)return service.settings();break;
      case 'leaf:settings-set':if(extensionPage)return service.updateSettings(message.patch||{});break;
      case 'leaf:migrate':if(extensionPage)return service.migrate(message);break;
    }
    throw new Error('不支持的操作。');
  })().then(data=>respond({ok:true,data}),error=>respond({ok:false,error:error.name==='TimeoutError'?'在线查询超时，请稍后重试。':error.name==='TypeError'?'在线查询失败，请检查网络。':error.message}));
  return true;
});
