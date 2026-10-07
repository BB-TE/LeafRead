const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname,'extension');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8'};
http.createServer(async(req,res)=>{
  let relative;
  try { relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname); } catch {res.writeHead(400);res.end();return;}
  if(relative==='/')relative='/popup-demo.html';
  if(relative==='/popup-demo.html'){
    const html=fs.readFileSync(path.join(root,'popup.html'),'utf8').replace('<script defer src="shared.js"></script>','<script defer src="core.js"></script><script defer src="shared.js"></script><script defer src="/popup-preview.js"></script>');
    res.writeHead(200,{'Content-Type':types['.html'],'Cache-Control':'no-store'});res.end(html);return;
  }
  if(relative==='/popup-preview.js'){
    res.writeHead(200,{'Content-Type':types['.js'],'Cache-Control':'no-store'});res.end(fs.readFileSync(path.join(__dirname,'tests/popup-preview.js'),'utf8'));return;
  }
  if(relative==='/api/dictionary'||relative==='/api/phrase'){
    const query=new URL(req.url,'http://localhost').searchParams.get('q')||'';
    if(req.method!=='GET'||!query.trim()||query.length>1500){res.writeHead(400);res.end();return;}
    // Local preview only. Destination is fixed; this is not a general-purpose proxy.
    const target=relative==='/api/dictionary'?'https://dict.youdao.com/jsonapi?q='+encodeURIComponent(query):'https://api.mymemory.translated.net/get?q='+encodeURIComponent(query)+'&langpair=en%7Czh-CN';
    try{const upstream=await fetch(target,{signal:AbortSignal.timeout(10000)});const data=await upstream.json();res.writeHead(upstream.status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
    catch{res.writeHead(502,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Translation service unavailable'}));}
    return;
  }
  const file=path.resolve(root,'.'+(relative==='/'?'/reader.html':relative));
  if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  fs.readFile(file,(error,data)=>{if(error){res.writeHead(404);res.end('Not found');return;}res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data);});
}).listen(4318,'127.0.0.1',()=>console.log('LeafRead preview: http://127.0.0.1:4318/popup-demo.html'));
