export interface Config {
  demoMode: 'off'|'readonly'|'editor';
  production: boolean; port: number; origin: string; databaseUrl: string;
  sessionSecret: string; tenantId: string; clientId: string; clientSecret: string;
  adminObjectIds: string[]; uploadDir: string; dbSsl: boolean;
}
export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const required = (key: string): string => {
    const value = env[key]?.trim();
    if (!value) throw new Error(`Missing required configuration: ${key}`);
    return value;
  };
  const production = env.NODE_ENV === 'production';
  const demoMode = env.DEMO_MODE || 'off';
  if (!['off','readonly','editor'].includes(demoMode)) throw new Error('Invalid DEMO_MODE');
  const origin = new URL(required('APP_ORIGIN')).origin;
  if (production && !origin.startsWith('https://')) throw new Error('Production APP_ORIGIN requires HTTPS');
  if(demoMode!=='off') return {demoMode:demoMode as 'readonly'|'editor',production,origin,
    databaseUrl:required('DATABASE_URL'),port:Number(env.PORT||3000),sessionSecret:'',tenantId:'',clientId:'',clientSecret:'',
    adminObjectIds:[],uploadDir:env.UPLOAD_DIR||'./var/uploads',dbSsl:env.DATABASE_SSL==='true'};
  const sessionSecret = required('SESSION_SECRET');
  if (sessionSecret.length < 32) throw new Error('SESSION_SECRET must have at least 32 characters');
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const tenantId = required('ENTRA_TENANT_ID');
  const clientId = required('ENTRA_CLIENT_ID');
  const adminObjectIds = required('ENTRA_ADMIN_OBJECT_IDS').split(',').map(v => v.trim().toLowerCase());
  if (![tenantId, clientId, ...adminObjectIds].every(v => uuid.test(v))) throw new Error('Entra tenant/client/admin IDs must be UUIDs');
  const port = Number(env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
  return {demoMode:'off',production, port, origin, databaseUrl:required('DATABASE_URL'), sessionSecret,
    tenantId:tenantId.toLowerCase(), clientId, clientSecret:required('ENTRA_CLIENT_SECRET'), adminObjectIds,
    uploadDir:env.UPLOAD_DIR || './var/uploads', dbSsl:env.DATABASE_SSL === 'true'};
}
