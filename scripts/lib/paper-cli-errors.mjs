import OpenAI from 'openai';

/** SDK errors can echo key fragments. Keep CLI diagnostics free of credentials. */
export function paperCLIError(error,environment=process.env){
 if(error instanceof OpenAI.APIError){
  const status=Number.isInteger(error.status)?error.status:'unavailable';
  const code=/^[a-z][a-z0-9_]{0,80}$/i.test(error.code??'')?error.code:'unavailable';
  return `OpenAI request failed (HTTP ${status}, code ${code}). Check credentials, quota and connectivity; retained submission identities will not be replaced automatically.`;
 }
 let message=error instanceof Error?error.message:'Paper CLI failed.';
 for(const [name,value] of Object.entries(environment))if(/(?:KEY|TOKEN|SECRET)$/.test(name)&&value?.length>=8)message=message.split(value).join('[redacted]');
 return message.replace(/\b(?:sk-|sbp_|sb_secret_)[A-Za-z0-9_-]+/g,'[redacted]');
}
