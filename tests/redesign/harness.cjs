const fs=require('fs'),path=require('path'),http=require('http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../../redesign');
const reportDir=process.env.REPORT_DIR||path.resolve(__dirname,'../../.test-output/redesign');
fs.mkdirSync(reportDir,{recursive:true});
const server=http.createServer((req,res)=>{
 // Exercise a conservative static-host URI budget in local share-link tests.
 if(Buffer.byteLength(req.url,'utf8')>8000){res.writeHead(414);res.end('URI Too Long');return;}
 const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 const file=path.resolve(root,'.'+pathname+(pathname.endsWith('/')?'index.html':''));
 if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 try{res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));}catch{res.writeHead(404);res.end();}
});
module.exports={fs,path,reportDir,chromium,server,async start(){await new Promise(r=>server.listen(0,'127.0.0.1',r));return 'http://127.0.0.1:'+server.address().port+'/'}};
