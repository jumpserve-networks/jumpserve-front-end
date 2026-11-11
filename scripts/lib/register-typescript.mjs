// CLI entrypoints use the same TypeScript modules as Next.js (Node 24+).
import {registerHooks} from 'node:module';
import {existsSync} from 'node:fs';
import {dirname,extname,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
registerHooks({resolve(name,context,next){
 if(name.startsWith('.')&&!extname(name)&&context.parentURL?.startsWith(pathToFileURL(root+'/').href)&&!context.parentURL.includes('/node_modules/')){
  const file=resolve(dirname(fileURLToPath(context.parentURL)),name)+'.ts';
  if(existsSync(file))return next(pathToFileURL(file).href,context);
 }
 return next(name,context);
}});
