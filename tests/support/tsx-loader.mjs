// Keep Node's native TypeScript and the existing test module hooks intact.
// Only JSX needs transpilation; production files are never rewritten.
import {readFileSync,existsSync} from 'node:fs';
import {createRequire,registerHooks} from 'node:module';
import {dirname,extname,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const projectURL=pathToFileURL(root+'/').href;
const require=createRequire(import.meta.url);let compiler;
function candidate(path){
 for(const suffix of ['','.ts','.tsx','.js','/index.ts','/index.tsx']){
  const file=path+suffix;if(existsSync(file)&&extname(file))return pathToFileURL(file).href;
 }
 return null;
}
registerHooks({
 resolve(specifier,context,nextResolve){
  if(specifier.startsWith('@/')){
   const target=candidate(resolve(root,specifier.slice(2)));
   if(target)return nextResolve(target,context);
  }
  if(specifier.startsWith('.')&&context.parentURL?.startsWith(projectURL)&&!context.parentURL.includes('/node_modules/')&&!extname(specifier)){
   const target=candidate(resolve(dirname(fileURLToPath(context.parentURL)),specifier));
   if(target)return nextResolve(target,context);
  }
  return nextResolve(specifier,context);
 },
 load(url,context,nextLoad){
  if(url.startsWith(projectURL)&&!url.includes('/node_modules/')&&new URL(url).pathname.endsWith('.json')){
   return {format:'module',shortCircuit:true,source:'export default '+readFileSync(fileURLToPath(url),'utf8')+';'};
  }
  if(url.startsWith('file:')&&new URL(url).pathname.endsWith('.tsx')){
   const file=fileURLToPath(url);
   const ts=compiler??=require('typescript');
   const result=ts.transpileModule(readFileSync(file,'utf8'),{fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,inlineSourceMap:true,inlineSources:true}});
   return {format:'module',shortCircuit:true,source:result.outputText};
  }
  return nextLoad(url,context);
 },
});
