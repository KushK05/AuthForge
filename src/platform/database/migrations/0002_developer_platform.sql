CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE developer_organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES developer_organizations(id),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name),
  UNIQUE (id, organization_id)
);

CREATE TABLE project_environments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id),
  name text NOT NULL CHECK (name IN ('development', 'staging', 'production')),
  issuer text NOT NULL CHECK (char_length(issuer) BETWEEN 1 AND 2_048),
  audience text NOT NULL CHECK (char_length(audience) BETWEEN 1 AND 2_048),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, name),
  UNIQUE (id, project_id)
);

CREATE TABLE api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  environment_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('publishable', 'secret')),
  secret_hash bytea NOT NULL UNIQUE,
  prefix text NOT NULL CHECK (char_length(prefix) BETWEEN 4 AND 32),
  scopes text[] NOT NULL DEFAULT '{}',
  revoked_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (environment_id, project_id)
    REFERENCES project_environments(id, project_id),
  CHECK (expires_at IS NULL OR expires_at > created_at)
);

CREATE INDEX api_keys_active_lookup_idx
  ON api_keys (secret_hash)
  WHERE revoked_at IS NULL;

CREATE INDEX api_keys_project_id_idx ON api_keys (project_id, id);

CREATE TABLE audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id),
  actor_type text NOT NULL CHECK (actor_type IN ('api_key', 'system', 'user', 'developer')),
  actor_id uuid,
  action text NOT NULL CHECK (char_length(action) BETWEEN 1 AND 160),
  target_type text NOT NULL CHECK (char_length(target_type) BETWEEN 1 AND 120),
  target_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  correlation_id text NOT NULL CHECK (char_length(correlation_id) BETWEEN 8 AND 128),
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_events_project_occurred_idx
  ON audit_events (project_id, occurred_at DESC);

CREATE TABLE idempotency_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  principal_id uuid NOT NULL,
  project_id uuid NOT NULL REFERENCES projects(id),
  route text NOT NULL CHECK (char_length(route) BETWEEN 1 AND 256),
  idempotency_key text NOT NULL CHECK (char_length(idempotency_key) BETWEEN 1 AND 255),
  request_hash bytea NOT NULL,
  response_status integer NOT NULL CHECK (response_status BETWEEN 200 AND 599),
  response_body jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  UNIQUE (principal_id, project_id, route, idempotency_key),
  CHECK (expires_at > created_at)
);

CREATE INDEX idempotency_records_expiry_idx ON idempotency_records (expires_at);
