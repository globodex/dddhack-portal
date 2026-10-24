// Isolated QA process preload. No app source/system DNS/provider changes.
import dns from 'node:dns';
import {syncBuiltinESMExports} from 'node:module';
const allowed=new Set(['portal-perf.test','api.portal-perf.test']);
const original=dns.lookup.bind(dns);
dns.lookup=function(hostname,options,callback){
 if(typeof options==='function'){callback=options;options={};}
 if(!allowed.has(hostname))return original(hostname,options,callback);
 const all=options&&typeof options==='object'&&options.all;
 queueMicrotask(()=>all?callback(null,[{address:'127.0.0.1',family:4}]):callback(null,'127.0.0.1',4));
};
const lookup=dns.promises.lookup.bind(dns.promises);
dns.promises.lookup=async function(hostname,options){
 if(!allowed.has(hostname))return lookup(hostname,options);
 return options&&typeof options==='object'&&options.all?[{address:'127.0.0.1',family:4}]:{address:'127.0.0.1',family:4};
};
syncBuiltinESMExports();
