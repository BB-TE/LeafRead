'use strict';
const el=id=>document.getElementById(id),sharedExtension=Boolean(globalThis.chrome?.runtime?.id&&globalThis.chrome?.storage?.local);
let vocabulary=[];
function read(key,fallback){try{return JSON.parse(localStorage.getItem('leaf:'+key))??fallback;}catch{return fallback;}}
function status(text,error=false){el('vocabStatus').textContent=text;el('vocabStatus').dataset.error=String(error);}
function render(){
  const filter=el('filterWords').value.trim().toLowerCase();const entries=vocabulary.filter(v=>[v.word,v.translation,v.sentence].some(text=>String(text||'').toLowerCase().includes(filter)));
  status(filter?'找到 '+entries.length+' 条收藏，共 '+vocabulary.length+' 条。':'共 '+vocabulary.length+' 条收藏。');
  el('wordCount').textContent=vocabulary.length+' 个词';el('exportWords').disabled=!vocabulary.length;el('vocabularyList').replaceChildren();
  if(!entries.length){const empty=document.createElement('section');empty.className='empty';const title=document.createElement('strong'),tip=document.createElement('p');title.textContent=vocabulary.length?'没有找到匹配的词':'还没有收藏的词';tip.textContent=vocabulary.length?'换一个单词试试，或清空搜索框。':'在网页释义卡片或扩展查词弹窗中点击收藏，就会出现在这里。';empty.append(title,tip);el('vocabularyList').append(empty);return;}
  for(const entry of entries){
    const card=document.createElement('section');card.className='vocab-card';const header=document.createElement('div');header.className='word-row';const word=document.createElement('h2');word.textContent=entry.word;word.dataset.long=String(entry.word.length>60);
    const speak=document.createElement('button');speak.textContent='听发音';speak.setAttribute('aria-label','朗读 '+entry.word);speak.disabled=!('speechSynthesis' in window);speak.onclick=()=>{const utterance=new SpeechSynthesisUtterance(entry.word);utterance.lang='en-US';utterance.rate=.85;speechSynthesis.cancel();speechSynthesis.speak(utterance);};
    const remove=document.createElement('button');remove.className='remove';remove.textContent='移除';remove.setAttribute('aria-label','移除 '+entry.word);remove.onclick=async()=>{remove.disabled=true;try{if(sharedExtension)vocabulary=await LeafShared.sendExtension({type:'leaf:remove',id:entry.id});else{vocabulary=read('vocab',[]).filter(v=>v.id!==entry.id);localStorage.setItem('leaf:vocab',JSON.stringify(vocabulary));}render();status('已移除 '+entry.word+'。');}catch(error){remove.disabled=false;status(error.message,true);}};
    header.append(word,speak,remove);const definition=document.createElement('p');definition.className='translation';definition.textContent=entry.translation;card.append(header,definition);
    if(entry.sentence){const sentence=document.createElement('blockquote');sentence.textContent=entry.sentence;card.append(sentence);}
    const source=document.createElement('div');source.className='source';const book=document.createElement('span');book.textContent=entry.book||'手动查词';source.append(book);
    if(entry.url&&/^https?:\/\//i.test(entry.url)){const link=document.createElement('a');link.href=entry.url;link.textContent='查看原文 ↗';link.target='_blank';link.rel='noopener noreferrer';source.append(link);}card.append(source);el('vocabularyList').append(card);
  }
}
el('filterWords').oninput=render;
el('exportWords').onclick=()=>{
  const rows=[['单词','释义','原句','书名或文章','来源链接'],...vocabulary.map(v=>[v.word,v.translation,v.sentence,v.book,v.url||''])];
  const blob=new Blob(['\uFEFF'+rows.map(row=>row.map(LeafCore.csvCell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='LeafRead-生词本.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
};
if(sharedExtension)chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes.leafVocab){vocabulary=changes.leafVocab.newValue||[];render();}});
else window.addEventListener('storage',event=>{if(event.key==='leaf:vocab'){vocabulary=read('vocab',[]);render();}});
window.addEventListener('pagehide',()=>{if('speechSynthesis' in window)speechSynthesis.cancel();});
(async()=>{try{vocabulary=sharedExtension?(await LeafShared.sendExtension({type:'leaf:migrate',vocab:read('vocab',[]),settings:read('settings',{})})).vocab:read('vocab',[]);render();status('共 '+vocabulary.length+' 条收藏。');document.body.dataset.ready='true';}catch(error){status(error.message,true);}})();
