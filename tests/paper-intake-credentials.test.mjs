import assert from 'node:assert/strict';
import {beforeEach,test} from 'node:test';
import {registerHooks} from 'node:module';
const hooks=registerHooks({resolve(name,context,next){
 if(name==='server-only')return{shortCircuit:true,url:'data:text/javascript,export {}'};
 if(name==='@aws-sdk/client-secrets-manager')return{shortCircuit:true,url:'data:text/javascript,'+encodeURIComponent('export class GetSecretValueCommand{constructor(input){this.input=input;}};export class SecretsManagerClient{constructor(options){globalThis.__paperSecrets.options=options;}async send(command){globalThis.__paperSecrets.calls.push(command.input);return globalThis.__paperSecrets.result;}destroy(){globalThis.__paperSecrets.destroyed++;}}')};
 return next(name,context);
}});
const {paperIntakeCredentials}=await import('../lib/paper-intake-credentials.ts');hooks.deregister();
let index=0;
beforeEach(()=>{for(const key of ['OPENAI_API_KEY','SUPABASE_SECRET_KEY','SUPABASE_SERVICE_ROLE_KEY','PAPER_INTAKE_SECRET_ID'])delete process.env[key];process.env.PAPER_INTAKE_SECRET_ID='fixture-secret-'+(++index);globalThis.__paperSecrets={calls:[],destroyed:0,result:{SecretString:JSON.stringify({OPENAI_API_KEY:'synthetic-model-key',SUPABASE_SECRET_KEY:'synthetic-database-key'})}};});
test('local server keys override runtime loading and absent configuration stays unavailable',async()=>{
 process.env.OPENAI_API_KEY='local-model-key';process.env.SUPABASE_SERVICE_ROLE_KEY='local-database-key';assert.deepEqual(await paperIntakeCredentials(),{openaiApiKey:'local-model-key',supabaseSecret:'local-database-key'});assert.equal(globalThis.__paperSecrets.calls.length,0);delete process.env.OPENAI_API_KEY;delete process.env.PAPER_INTAKE_SECRET_ID;assert.equal(await paperIntakeCredentials(),null);
});
test('concurrent server requests share a cached Secrets Manager read and close the SDK client',async()=>{
 const values=await Promise.all([paperIntakeCredentials(),paperIntakeCredentials()]);assert.deepEqual(values[0],{openaiApiKey:'synthetic-model-key',supabaseSecret:'synthetic-database-key'});assert.deepEqual(values[1],values[0]);await paperIntakeCredentials();assert.equal(globalThis.__paperSecrets.calls.length,1);assert.equal(globalThis.__paperSecrets.destroyed,1);assert.deepEqual(globalThis.__paperSecrets.calls[0],{SecretId:process.env.PAPER_INTAKE_SECRET_ID});
});
test('malformed or incomplete secret values fail privately and a later read can recover',async()=>{
 for(const value of ['PRIVATE invalid JSON',JSON.stringify({OPENAI_API_KEY:'PRIVATE KEY'}),JSON.stringify({OPENAI_API_KEY:' ',SUPABASE_SECRET_KEY:'value'})]){process.env.PAPER_INTAKE_SECRET_ID='failed-'+(++index);globalThis.__paperSecrets.result={SecretString:value};await assert.rejects(()=>paperIntakeCredentials(),error=>error.message==='Paper preparation server credentials are temporarily unavailable.');}
 globalThis.__paperSecrets.result={SecretString:JSON.stringify({OPENAI_API_KEY:'recovered-model',SUPABASE_SECRET_KEY:'recovered-database'})};assert.deepEqual(await paperIntakeCredentials(),{openaiApiKey:'recovered-model',supabaseSecret:'recovered-database'});
});
test('changing the configured secret reference never reuses another reference’s cached keys',async()=>{
 await paperIntakeCredentials();process.env.PAPER_INTAKE_SECRET_ID='new-reference-'+(++index);globalThis.__paperSecrets.result={SecretString:JSON.stringify({OPENAI_API_KEY:'new-model',SUPABASE_SECRET_KEY:'new-database'})};assert.equal((await paperIntakeCredentials()).openaiApiKey,'new-model');assert.equal(globalThis.__paperSecrets.calls.length,2);
});
