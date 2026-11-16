CREATE TABLE IF NOT EXISTS mb_users (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL, object_id uuid NOT NULL,
  display_name text NOT NULL, email text NOT NULL,
  role text CHECK (role IN ('viewer','editor')),
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','pending','approved','denied')),
  requested_role text CHECK (requested_role IN ('viewer','editor')),
  requested_at timestamptz, decided_at timestamptz, decided_by uuid REFERENCES mb_users(id),
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id, object_id)
);
CREATE TABLE IF NOT EXISTS mb_projects (
  id text PRIMARY KEY, revision integer NOT NULL DEFAULT 0,
  data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS mb_documents (
  id uuid PRIMARY KEY, item_id text NOT NULL, kind text NOT NULL, revision text NOT NULL,
  original_name text NOT NULL, storage_name text NOT NULL UNIQUE, size_bytes integer NOT NULL,
  uploaded_by uuid NOT NULL REFERENCES mb_users(id), uploaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS mb_audit (
  id bigserial PRIMARY KEY, actor_id uuid REFERENCES mb_users(id), action text NOT NULL,
  details jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS mb_sessions (
  sid varchar PRIMARY KEY, sess json NOT NULL, expire timestamp(6) NOT NULL
);
CREATE INDEX IF NOT EXISTS mb_sessions_expire ON mb_sessions(expire);
