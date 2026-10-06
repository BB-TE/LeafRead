(function(root){
  'use strict';
  const blocks='p,h1,h2,h3,h4,h5,h6,li,blockquote,td,th,figcaption,pre,div,article,section';
  function excluded(element){return !element||Boolean(element.closest('input,textarea,select,button,script,style,noscript,[contenteditable]:not([contenteditable="false"]),[role="textbox"],#leafread-web-tooltip'));}
  function runAt(node,offset){
    const block=node.parentElement?.closest(blocks)||node.parentElement;
    const walker=document.createTreeWalker(block,NodeFilter.SHOW_TEXT);const pieces=[];let length=0,index=-1,steps=0;
    while(walker.nextNode()&&steps++<400){const n=walker.currentNode;if(excluded(n.parentElement))continue;if(length+n.textContent.length>24000)break;if(n===node)index=length+offset;pieces.push({node:n,start:length,end:length+n.textContent.length});length+=n.textContent.length;}
    if(index<0){const start=Math.max(0,offset-2000);const text=node.textContent.slice(start,offset+2000);return {text,offset:offset-start,pieces:[{node,start:0,end:text.length,base:start}]};}
    return {text:pieces.map(p=>p.node.textContent).join(''),offset:index,pieces};
  }
  function atOffset(node,offset,x,y){
    if(!node||node.nodeType!==Node.TEXT_NODE||excluded(node.parentElement)||!node.isConnected)return null;
    const run=runAt(node,offset);let token;
    for(const t of root.LeafCore.tokens(run.text)){if(t.word&&run.offset>=t.start&&run.offset<=t.start+t.text.length){token=t;break;}}
    if(!token||token.text.length>120)return null;
    const start=token.start,end=start+token.text.length;
    const first=run.pieces.find(p=>start>=p.start&&start<p.end);const last=run.pieces.find(p=>end>p.start&&end<=p.end);if(!first||!last)return null;
    const range=document.createRange();range.setStart(first.node,start-first.start+(first.base||0));range.setEnd(last.node,end-last.start+(last.base||0));
    const rects=Array.from(range.getClientRects());
    if(!rects.some(r=>x>=r.left-.5&&x<=r.right+.5&&y>=r.top-.5&&y<=r.bottom+.5))return null;
    return {word:token.text,range,sentence:root.LeafCore.sentenceAt(run.text,start)};
  }
  function atPoint(x,y,target){
    if(excluded(target))return null;let node,offset;
    if(document.caretPositionFromPoint){const shadow=target.getRootNode();const caret=document.caretPositionFromPoint(x,y,shadow instanceof ShadowRoot?{shadowRoots:[shadow]}:undefined);node=caret?.offsetNode;offset=caret?.offset;}
    else if(document.caretRangeFromPoint){const caret=document.caretRangeFromPoint(x,y);node=caret?.startContainer;offset=caret?.startOffset;}
    return atOffset(node,offset,x,y);
  }
  function same(a,b){return Boolean(a&&b&&a.range.startContainer===b.range.startContainer&&a.range.startOffset===b.range.startOffset&&a.range.endContainer===b.range.endContainer&&a.range.endOffset===b.range.endOffset);}
  root.LeafWebText={atPoint,atOffset,excluded,same};
})(globalThis);
