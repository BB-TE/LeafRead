(function (root) {
  'use strict';
  const WORDS = /[A-Za-z]+(?:['’][A-Za-z]+)*(?:-[A-Za-z]+(?:['’][A-Za-z]+)*)*/g;
  const dictionary = {
    exhausted:'adj. 筋疲力尽的；耗尽的', platform:'n. 站台；平台', quiet:'adj. 安静的', journey:'n. 旅程；行程', unfamiliar:'adj. 不熟悉的；陌生的', hesitation:'n. 犹豫；迟疑', curious:'adj. 好奇的', curiosity:'n. 好奇心', notice:'v. 注意到；n. 通知', noticed:'v. 注意到（notice 的过去式）', ordinary:'adj. 普通的；平常的', extraordinary:'adj. 非凡的', gentle:'adj. 温和的；轻柔的', gently:'adv. 轻轻地；温柔地', distant:'adj. 遥远的', distance:'n. 距离；远处', familiar:'adj. 熟悉的', stranger:'n. 陌生人', station:'n. 车站', suitcase:'n. 手提箱；行李箱', schedule:'n. 时间表；日程', departure:'n. 出发；离开', conversation:'n. 交谈；对话', silence:'n. 寂静；沉默', silent:'adj. 安静的；沉默的', suddenly:'adv. 突然', discover:'v. 发现', discovered:'v. 发现（discover 的过去式）', discovery:'n. 发现', attention:'n. 注意力；关注', patient:'adj. 耐心的；n. 病人', patience:'n. 耐心', patiently:'adv. 耐心地', opportunity:'n. 机会', perhaps:'adv. 也许；或许', eventually:'adv. 最终；终于', realize:'v. 意识到', realized:'v. 意识到（realize 的过去式）', meaningful:'adj. 有意义的', wonder:'v. 想知道；n. 惊奇', wondered:'v. 想知道（wonder 的过去式）', wandering:'adj. 漫游的；v. 闲逛', window:'n. 窗户', weather:'n. 天气', rain:'n. 雨；v. 下雨', steam:'n. 蒸汽', notebook:'n. 笔记本', memory:'n. 记忆', memories:'n. 回忆；记忆（复数）', remember:'v. 记得', remembered:'v. 记得（remember 的过去式）', forget:'v. 忘记', forgotten:'v. 忘记（forget 的过去分词）', invitation:'n. 邀请', uncertain:'adj. 不确定的', uncertainty:'n. 不确定性', comfortable:'adj. 舒适的', comfort:'n. 安慰；舒适', restless:'adj. 焦躁不安的', relieved:'adj. 感到宽慰的', breathe:'v. 呼吸', breath:'n. 呼吸；一口气', courage:'n. 勇气', brave:'adj. 勇敢的', slowly:'adv. 缓慢地', hurried:'adj. 匆忙的；v. 赶忙', hurry:'v. 赶忙；n. 匆忙', beneath:'prep. 在……下面', beyond:'prep. 在……之外；超过', through:'prep. 穿过；通过', although:'conj. 尽管；虽然', instead:'adv. 代替；反而', enough:'adj./adv. 足够（的）', barely:'adv. 几乎不；勉强', nearly:'adv. 几乎；差不多', return:'v./n. 返回', destination:'n. 目的地', arrival:'n. 到达', arrive:'v. 到达', arrived:'v. 到达（arrive 的过去式）', ticket:'n. 票', empty:'adj. 空的', crowded:'adj. 拥挤的', sunlight:'n. 阳光', shadow:'n. 影子；阴影', shadows:'n. 影子；阴影（复数）', leaf:'n. 叶子', leaves:'n. 叶子（复数）；v. 离开', autumn:'n. 秋天', spring:'n. 春天；弹簧', season:'n. 季节', habit:'n. 习惯', habits:'n. 习惯（复数）', chapter:'n. 章节', sentence:'n. 句子', sentence:'n. 句子', word:'n. 单词；话语', words:'n. 单词；话语（复数）', reading:'n. 阅读；v. 读', book:'n. 书', books:'n. 书（复数）', meaning:'n. 意思；意义', language:'n. 语言', story:'n. 故事', stories:'n. 故事（复数）', beginning:'n. 开始', understand:'v. 理解', understood:'v. 理解（understand 的过去式）', small:'adj. 小的', beautiful:'adj. 美丽的', different:'adj. 不同的', important:'adj. 重要的', difficult:'adj. 困难的', simple:'adj. 简单的', ready:'adj. 准备好的', light:'n. 光；adj. 轻的', bank:'n. 银行；河岸（具体含义取决于上下文）', felt:'v. 感觉（feel 的过去式）', sat:'v. 坐（sit 的过去式）', looked:'v. 看（look 的过去式）', carried:'v. 携带（carry 的过去式）', change:'v./n. 改变', waiting:'v. 等待；n. 等待', smiled:'v. 微笑（smile 的过去式）', narrow:'adj. 狭窄的', folded:'v. 折叠（fold 的过去式）', envelope:'n. 信封', handwriting:'n. 手写；笔迹', promise:'n. 承诺；v. 答应', direction:'n. 方向', impossible:'adj. 不可能的', possible:'adj. 可能的', careful:'adj. 小心的', carefully:'adv. 小心地；仔细地', ordinary:'adj. 普通的；平常的', 'give up':'放弃', 'look up':'查阅；抬头看', 'take off':'起飞；脱下', 'in the end':'最后；最终'
  };
  function tokens(text) {
    const result = []; let end = 0;
    for (const match of text.matchAll(WORDS)) {
      if (match.index > end) result.push({ text: text.slice(end, match.index) });
      result.push({ text: match[0], word: true, start: match.index });
      end = match.index + match[0].length;
    }
    if (end < text.length) result.push({ text: text.slice(end) });
    return result;
  }
  function sentenceAt(text, offset) {
    const before = text.slice(0, offset); const after = text.slice(offset);
    const left = Math.max(before.lastIndexOf('. '), before.lastIndexOf('! '), before.lastIndexOf('? '));
    const right = after.search(/[.!?](?:\s|$)/);
    return text.slice(left < 0 ? 0 : left + 2, right < 0 ? text.length : offset + right + 1).trim().slice(0, 1200);
  }
  function resolvePath(base, href) {
    const plain = href.split('#')[0].split('?')[0];
    const decoded = decodeURIComponent(plain);
    if (/^[a-z][a-z0-9+.-]*:/i.test(decoded) || decoded.startsWith('//')) throw new Error('不支持书籍中的外部章节链接。');
    const parts = (base.slice(0, base.lastIndexOf('/') + 1) + decoded).split('/'); const out = [];
    for (const part of parts) { if (part === '..') out.pop(); else if (part && part !== '.') out.push(part); }
    return out.join('/');
  }
  function parseText(text, title) {
    const clean = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
    if (!clean) throw new Error('正文是空的，请换一个文件。');
    const chunks = clean.split(/\n\s*\n/).map(x => x.replace(/\n/g, ' ').trim()).filter(Boolean);
    // Long plain-text books are divided at paragraph boundaries to keep rendering responsive.
    const chapters = []; let blocks = []; let size = 0;
    const paragraphs = chunks.flatMap(text=>text.length>18000?(text.match(/.{1,12000}(?:\s|$)|.{1,12000}/gs)||[text]).map(t=>t.trim()):[text]);
    for (const text of paragraphs) {
      if (size > 16000 && blocks.length) { chapters.push({ title: chapters.length ? `阅读片段 ${chapters.length + 1}` : '开始阅读', blocks }); blocks = []; size = 0; }
      blocks.push({ type:'p', text });
      size += text.length;
    }
    if (blocks.length) chapters.push({ title: chapters.length ? `阅读片段 ${chapters.length + 1}` : '开始阅读', blocks });
    return { title, author:'本地导入', format:'TXT', chapters };
  }
  function xml(text) {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.querySelector('parsererror')) throw new Error('EPUB 的结构文件无法解析。');
    return doc;
  }
  function all(doc, name) { return Array.from(doc.getElementsByTagNameNS('*', name)); }
  async function parseEpub(buffer, fallbackTitle) {
    const zip = await root.JSZip.loadAsync(buffer);
    async function read(path) {
      const file = zip.file(path);
      if (!file) throw new Error(`EPUB 缺少文件：${path}`);
      if (file._data?.uncompressedSize > 8 * 1024 * 1024) throw new Error('书籍章节过大，首版暂不支持。');
      return file.async('string');
    }
    const container = xml(await read('META-INF/container.xml'));
    const opfPath = all(container, 'rootfile')[0]?.getAttribute('full-path');
    if (!opfPath) throw new Error('这不是有效的 EPUB 文件。');
    const opf = xml(await read(opfPath));
    const items = new Map(all(opf,'item').map(x => [x.getAttribute('id'), x]));
    const spine = all(opf,'itemref').filter(x => x.getAttribute('linear') !== 'no');
    if (spine.length > 1500) throw new Error('这本书的章节过多，首版暂不支持。');
    const titles = new Map();
    const nav = Array.from(items.values()).find(x => (x.getAttribute('properties') || '').split(/\s+/).includes('nav'));
    if (nav) {
      const navPath = resolvePath(opfPath, nav.getAttribute('href'));
      const navDoc = xml(await read(navPath));
      const toc = Array.from(navDoc.querySelectorAll('nav')).find(n => /\btoc\b/.test(n.getAttribute('epub:type') || n.getAttribute('type') || '')) || navDoc;
      toc.querySelectorAll('a[href]').forEach(a => {
        const href = a.getAttribute('href');
        if (!/^(?:https?:|mailto:|javascript:)/i.test(href)) {
          const path = resolvePath(navPath,href);
          if (!titles.has(path)) titles.set(path,a.textContent.trim());
        }
      });
    }
    const chapters = []; let total = 0;
    for (const ref of spine) {
      const item = items.get(ref.getAttribute('idref'));
      if (!item) throw new Error('EPUB 的章节索引不完整。');
      if ((item.getAttribute('properties') || '').split(/\s+/).includes('nav')) continue;
      const path = resolvePath(opfPath,item.getAttribute('href'));
      const source = await read(path); total += source.length;
      if (total > 30 * 1024 * 1024) throw new Error('书籍正文过大，首版暂不支持。');
      // XHTML is parsed as XML so detached book documents cannot load remote images/frames.
      const doc = xml(source);
      const body = all(doc,'body')[0];
      if (!body) throw new Error('EPUB 章节缺少正文。');
      doc.querySelectorAll('script,style,nav,iframe,object,svg,form,noscript').forEach(x=>x.remove());
      const nodes = Array.from(body.querySelectorAll('h1,h2,h3,h4,p,li,pre,blockquote')).filter(n => !n.querySelector('h1,h2,h3,h4,p,li,pre,blockquote'));
      const blocks = nodes.map(n=>({type:/^h/i.test(n.localName)?'h2':'p',text:n.textContent.replace(/\s+/g,' ').trim()})).filter(b=>b.text);
      if (!blocks.length && body.textContent.trim()) blocks.push({type:'p',text:body.textContent.replace(/\s+/g,' ').trim()});
      if (!blocks.length) continue;
      const title = titles.get(path) || blocks.find(b=>b.type==='h2')?.text || `第 ${chapters.length + 1} 章`;
      if (blocks[0]?.type === 'h2' && blocks[0].text === title) blocks.shift();
      if (blocks.length) chapters.push({title,blocks});
    }
    if (!chapters.length) throw new Error('未找到可阅读的文字。加密书籍或纯图片 EPUB 暂不支持。');
    return {title:all(opf,'title')[0]?.textContent.trim() || fallbackTitle, author:all(opf,'creator')[0]?.textContent.trim() || '本地导入',format:'EPUB',chapters};
  }
  function csvCell(value) { let text=String(value ?? ''); if (/^[=+@\-\t\r]/.test(text)) text="'"+text; return '"'+text.replace(/"/g,'""')+'"'; }
  root.LeafCore = {tokens,sentenceAt,resolvePath,parseText,parseEpub,dictionary,csvCell};
})(globalThis);
