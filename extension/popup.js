'use strict';
const el=id=>document.getElementById(id);let settings,siteHost='',currentTab;
let lookup=null,sequence=0,vocabulary=[],saving=false;
const settingControls=['enabled','siteEnabled','delay','alt','online'];
settingControls.forEach(id=>{el(id).disabled=true;});
async function send(type,extra={}){return LeafShared.sendExtension({type,...extra},'popup');}
function searchStatus(message,error=false){el('searchStatus').textContent=message;el('searchStatus').dataset.error=String(error);}
function isSaved(word){return vocabulary.some(entry=>entry.word.toLowerCase()===word.toLowerCase()&&entry.bookId==='manual'&&!entry.sentence);}
function renderSave(){const saved=lookup&&isSaved(lookup.word);el('saveWord').disabled=!lookup||saved||saving;el('saveWord').textContent=saving?'正在收藏……':saved?'✓ 已收藏':'收藏单词';}
el('searchForm').onsubmit=async event=>{
  event.preventDefault();const current=++sequence;const word=el('searchWord').value.trim();
  if('speechSynthesis' in window)speechSynthesis.cancel();
  lookup=null;el('searchResult').hidden=true;renderSave();
  if(!/^[A-Za-z]+(?:['’-][A-Za-z]+)*$/.test(word)||word.length>120){el('searchResult').setAttribute('aria-busy','false');searchStatus('请输入一个英文单词，例如 journey。',true);el('searchWord').focus();return;}
  el('searchResult').setAttribute('aria-busy','true');searchStatus('正在查询 '+word+'……');
  try{
    const result=await send('leaf:lookup',{text:word});if(current!==sequence)return;
    lookup={word,translation:result.text};el('resultWord').textContent=word;el('pronunciation').textContent=result.pronunciation||'';el('definition').textContent=result.text;el('dictionarySource').textContent=result.source;
    el('searchResult').hidden=false;el('speakWord').disabled=!('speechSynthesis' in window);renderSave();searchStatus('查询完成。');
  }catch(error){if(current===sequence)searchStatus(error.message,true);}
  finally{if(current===sequence)el('searchResult').setAttribute('aria-busy','false');}
};
el('speakWord').onclick=()=>{
  if(!lookup||!('speechSynthesis' in window))return;
  const current=sequence,utterance=new SpeechSynthesisUtterance(lookup.word);utterance.lang='en-US';utterance.rate=.85;
  utterance.onerror=event=>{if(current===sequence&&!['canceled','interrupted'].includes(event.error))searchStatus('朗读失败，请检查系统是否安装英语语音。',true);};
  speechSynthesis.cancel();speechSynthesis.speak(utterance);
};
el('saveWord').onclick=async()=>{
  if(!lookup||saving||isSaved(lookup.word))return;const savedLookup={...lookup},current=sequence;saving=true;renderSave();
  try{vocabulary=await send('leaf:save',{entry:{...savedLookup,sentence:'',book:'手动查词',bookId:'manual',url:''}});if(current===sequence)searchStatus('已加入生词本。');}
  catch(error){if(current===sequence)searchStatus(error.message,true);}
  finally{saving=false;renderSave();}
};
window.addEventListener('pagehide',()=>{sequence++;if('speechSynthesis' in window)speechSynthesis.cancel();});
send('leaf:vocab').then(list=>{vocabulary=list;renderSave();}).catch(()=>{});
chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes.leafVocab){vocabulary=changes.leafVocab.newValue||[];renderSave();}});
function render(){settingControls.forEach(id=>{el(id).disabled=false;});el('enabled').checked=settings.webEnabled;el('siteEnabled').checked=Boolean(siteHost)&&!settings.disabledHosts.includes(siteHost);el('siteEnabled').disabled=!siteHost||!settings.webEnabled;el('delay').value=settings.delay;el('delayValue').textContent=settings.delay+' 秒';el('alt').checked=settings.alt;el('online').checked=settings.online;}
async function status(){
  if(!siteHost){el('pageStatus').textContent='当前页面暂不支持网页查词。请打开普通英文文章或文字形式的在线书籍。';return;}
  if(!settings.webEnabled){el('pageStatus').textContent='网页查词已暂停。打开上面的开关即可恢复。';return;}
  if(settings.disabledHosts.includes(siteHost)){el('pageStatus').textContent='已在 '+siteHost+' 暂停查词。';return;}
  try{const response=await chrome.tabs.sendMessage(currentTab.id,{type:'leaf:ping'});el('pageStatus').textContent=response?.version==='0.6.0'?'已开启 · '+siteHost+'\n鼠标停在英文单词上即可查看释义。':'请刷新文章页面，启用新版网页查词。';}
  catch{el('pageStatus').textContent='请刷新文章页面。Chrome 内置页面、内置 PDF 阅读器和图片文字暂不支持。';}
}
async function update(patch){try{settings=await send('leaf:settings-set',{patch});render();await status();}catch(e){el('pageStatus').textContent=e.message;}}
el('enabled').onchange=()=>update({webEnabled:el('enabled').checked});el('alt').onchange=()=>update({alt:el('alt').checked});el('online').onchange=()=>update({online:el('online').checked});
el('delay').oninput=()=>{el('delayValue').textContent=el('delay').value+' 秒';};el('delay').onchange=()=>update({delay:Number(el('delay').value)});
el('siteEnabled').onchange=()=>update({disabledHosts:el('siteEnabled').checked?settings.disabledHosts.filter(h=>h!==siteHost):[...settings.disabledHosts,siteHost]});
el('vocab').onclick=()=>chrome.tabs.create({url:chrome.runtime.getURL('vocabulary.html')});
(async()=>{try{settings=await send('leaf:settings-get');[currentTab]=await chrome.tabs.query({active:true,currentWindow:true});try{const url=new URL(currentTab.url);if(['http:','https:'].includes(url.protocol))siteHost=url.hostname;}catch{}render();await status();}catch(e){el('pageStatus').textContent=e.message;}})();
