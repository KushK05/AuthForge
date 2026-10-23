ALTER TABLE showcase_users DROP CONSTRAINT showcase_users_email_check;
ALTER TABLE showcase_users ADD CONSTRAINT showcase_users_email_check CHECK (email ~ '^[a-z0-9._%+-]+@authforge\.demo$');
