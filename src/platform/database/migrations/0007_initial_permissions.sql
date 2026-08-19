INSERT INTO permissions (code)
VALUES ('profile:read'), ('profile:write')
ON CONFLICT (code) DO NOTHING;
