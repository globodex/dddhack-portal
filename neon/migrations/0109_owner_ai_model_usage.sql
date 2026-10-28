-- Owner model selection and prospective provider telemetry; no historical usage backfill.
CREATE TABLE ai_model_settings (
 id INTEGER PRIMARY KEY CHECK(id=1),
 model TEXT NOT NULL,
 revision INTEGER NOT NULL CHECK(revision>0),
 updated_by TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE TABLE ai_provider_usage (
 id TEXT PRIMARY KEY,
 version_id TEXT NOT NULL,
 requested_model TEXT NOT NULL,
 actual_model TEXT,
 input_tokens INTEGER CHECK(input_tokens>=0),
 output_tokens INTEGER CHECK(output_tokens>=0),
 cached_tokens INTEGER CHECK(cached_tokens>=0),
 total_tokens INTEGER CHECK(total_tokens>=0),
 created_at TEXT NOT NULL
);
CREATE INDEX ai_provider_usage_model_time ON ai_provider_usage(requested_model,created_at);
CREATE TRIGGER portal_serializable BEFORE INSERT OR UPDATE OR DELETE ON ai_model_settings FOR EACH STATEMENT EXECUTE FUNCTION portal_require_serializable();
CREATE TRIGGER portal_serializable BEFORE INSERT OR UPDATE OR DELETE ON ai_provider_usage FOR EACH STATEMENT EXECUTE FUNCTION portal_require_serializable();
