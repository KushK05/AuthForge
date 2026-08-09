CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id),
  primary_email_normalized text NOT NULL CHECK (char_length(primary_email_normalized) BETWEEN 3 AND 320),
  password_hash text NOT NULL,
  email_verified_at timestamptz,
  status text NOT NULL DEFAULT 'pending_verification'
    CHECK (status IN ('pending_verification', 'active', 'disabled')),
  token_version integer NOT NULL DEFAULT 0 CHECK (token_version >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, primary_email_normalized),
  UNIQUE (id, project_id)
);

CREATE INDEX users_project_id_idx ON users (project_id, id);

CREATE TABLE verification_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  project_id uuid NOT NULL,
  purpose text NOT NULL DEFAULT 'email_verification' CHECK (purpose = 'email_verification'),
  token_hash bytea NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (user_id, project_id) REFERENCES users(id, project_id),
  CHECK (expires_at > created_at)
);

CREATE UNIQUE INDEX verification_tokens_one_active_per_user_idx
  ON verification_tokens (user_id, purpose)
  WHERE consumed_at IS NULL;

CREATE INDEX verification_tokens_active_lookup_idx
  ON verification_tokens (project_id, token_hash)
  WHERE consumed_at IS NULL;

CREATE TABLE outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL CHECK (char_length(event_type) BETWEEN 1 AND 160),
  event_version integer NOT NULL CHECK (event_version > 0),
  project_id uuid REFERENCES projects(id),
  correlation_id text NOT NULL CHECK (char_length(correlation_id) BETWEEN 8 AND 128),
  payload jsonb NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  lease_expires_at timestamptz,
  lease_owner text,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0)
);

CREATE INDEX outbox_events_pending_idx
  ON outbox_events (occurred_at)
  WHERE published_at IS NULL;
