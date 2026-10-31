/** Sanitized durable state only. Never retain an upstream exception, body, URL or header. */
export type RepositoryReadFailure = {code:'GITHUB_RATE_LIMITED'|'GITHUB_AUTH_UNAVAILABLE'|'GITHUB_UNAVAILABLE'|'GITHUB_PUBLIC_ONLY'|'GITHUB_READ_LIMIT';retryAt?:string};
const codes = new Set(['GITHUB_RATE_LIMITED','GITHUB_AUTH_UNAVAILABLE','GITHUB_UNAVAILABLE','GITHUB_PUBLIC_ONLY','GITHUB_READ_LIMIT']);
export class RepositoryReadError extends Error {
 readonly code:RepositoryReadFailure['code'];readonly retryAt?:string;
 constructor(failure:RepositoryReadFailure){super(failure.code);this.name='RepositoryReadError';this.code=failure.code;this.retryAt=failure.retryAt;}
}
export function repositoryReadFailure(error:unknown):RepositoryReadFailure|null {
 return error instanceof RepositoryReadError ? {code:error.code,...(error.retryAt?{retryAt:error.retryAt}:{})}:null;
}
export function storedRepositoryReadFailure(value:unknown):RepositoryReadFailure|null {
 if(typeof value!=='string'||value.length>200)return null;
 try{const item=JSON.parse(value);if(!item||!codes.has(item.code))return null;const retryAt=typeof item.retryAt==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(item.retryAt)&&Number.isFinite(Date.parse(item.retryAt))?item.retryAt:undefined;return {code:item.code,...(retryAt?{retryAt}:{})}}catch{return null}
}
