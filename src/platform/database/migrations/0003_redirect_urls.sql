CREATE TABLE redirect_urls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id),
  url text NOT NULL CHECK (char_length(url) BETWEEN 1 AND 2_048),
  kind text NOT NULL DEFAULT 'all' CHECK (kind = 'all'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, url)
);

CREATE INDEX redirect_urls_project_id_idx ON redirect_urls (project_id, id);
