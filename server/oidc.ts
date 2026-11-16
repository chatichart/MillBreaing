import * as oidc from 'openid-client';
import { Config } from './config';
import { HttpError } from './policy';
export interface AuthFlow { verifier:string; state:string; nonce:string; createdAt:number }
export interface Identity { tid:string; oid:string; name:string; email:string }
export interface IdentityProvider {
  begin():Promise<{url:string;flow:AuthFlow}>;
  callback(url:URL, flow:AuthFlow):Promise<Identity>;
}
export async function entraProvider(c:Config):Promise<IdentityProvider> {
  const configuration = await oidc.discovery(new URL(`https://login.microsoftonline.com/${c.tenantId}/v2.0`),c.clientId,c.clientSecret);
  oidc.enableNonRepudiationChecks(configuration);
  const redirect_uri = `${c.origin}/auth/callback`;
  return {
    async begin() {
      const flow = {verifier:oidc.randomPKCECodeVerifier(),state:oidc.randomState(),nonce:oidc.randomNonce(),createdAt:Date.now()};
      const url = oidc.buildAuthorizationUrl(configuration,{redirect_uri,scope:'openid profile email',
        code_challenge:await oidc.calculatePKCECodeChallenge(flow.verifier),code_challenge_method:'S256',state:flow.state,nonce:flow.nonce});
      return {url:url.href,flow};
    },
    async callback(url,flow) {
      if (Date.now()-flow.createdAt > 10*60*1000) throw new HttpError(401,'Login expired; please sign in again');
      const tokens = await oidc.authorizationCodeGrant(configuration,url,{pkceCodeVerifier:flow.verifier,
        expectedState:flow.state,expectedNonce:flow.nonce,idTokenExpected:true},{redirect_uri});
      const claims = tokens.claims();
      if (!claims || String(claims.tid).toLowerCase()!==c.tenantId || !/^[0-9a-f-]{36}$/i.test(String(claims.oid)))
        throw new HttpError(401,'Identity is outside the configured tenant');
      return {tid:c.tenantId,oid:String(claims.oid).toLowerCase(),name:String(claims.name||claims.preferred_username||claims.oid).slice(0,200),
        email:String(claims.preferred_username||claims.email||'').slice(0,320)};
    },
  };
}
