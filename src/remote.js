import { loadConfig } from './config.js';
import { createRemoteApp } from './remote-app.js';
process.umask(0o077);
const cfg=loadConfig();
const instance=createRemoteApp(cfg);
const server=instance.app.listen(cfg.port,cfg.host,()=>console.log(JSON.stringify({event:'started',service:'kdca-press',port:cfg.port,temporaryFiles:true})));
server.requestTimeout=60000;server.headersTimeout=15000;
function stop(){server.close(()=>{instance.close();process.exit(0);});setTimeout(()=>process.exit(1),10000).unref();}
process.once('SIGTERM',stop);process.once('SIGINT',stop);
