-- Apply after the portal schema. Separate auth migration stream; no legacy data
-- is copied. Timestamps in milliseconds are BIGINT, kept below Number.MAX_SAFE_INTEGER.
CREATE TABLE auth_users (
  id TEXT PRIMARY KEY REFERENCES users(id),
  email TEXT NOT NULL UNIQUE CHECK (email = lower(trim(email))),
  name TEXT NOT NULL,
  email_verified_at TEXT NOT NULL
);
CREATE TABLE auth_accounts (
  provider TEXT NOT NULL CHECK (provider = 'google'),
  provider_subject TEXT NOT NULL,
  auth_user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  PRIMARY KEY (provider, provider_subject),
  UNIQUE (auth_user_id, provider)
);
CREATE TABLE auth_sessions (
  token_hash TEXT PRIMARY KEY,
  auth_user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  expires_at BIGINT NOT NULL
);
CREATE INDEX auth_sessions_expiry ON auth_sessions(expires_at);
CREATE INDEX auth_sessions_user ON auth_sessions(auth_user_id);
CREATE TABLE auth_magic_tokens (
  token_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL CHECK (email = lower(trim(email))),
  browser_hash TEXT NOT NULL,
  return_to TEXT NOT NULL,
  expires_at BIGINT NOT NULL
);
CREATE INDEX auth_magic_expiry ON auth_magic_tokens(expires_at);
CREATE INDEX auth_magic_email ON auth_magic_tokens(email);
CREATE TABLE auth_oauth_transactions (
  state_hash TEXT PRIMARY KEY,
  browser_hash TEXT NOT NULL,
  nonce TEXT NOT NULL,
  pkce_verifier TEXT NOT NULL,
  return_to TEXT NOT NULL,
  expires_at BIGINT NOT NULL
);
CREATE INDEX auth_oauth_expiry ON auth_oauth_transactions(expires_at);
CREATE TABLE auth_rate_limits (
  bucket TEXT PRIMARY KEY,
  count INTEGER NOT NULL CHECK (count > 0),
  expires_at BIGINT NOT NULL
);
CREATE INDEX auth_rate_expiry ON auth_rate_limits(expires_at);
