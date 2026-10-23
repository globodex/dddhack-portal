CREATE TABLE credit_batches (
 id TEXT PRIMARY KEY,
 digest TEXT NOT NULL,
 created_by TEXT NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL,
 deleted_at TEXT,
 UNIQUE(created_by,digest)
);
CREATE TABLE credit_batch_columns (
 batch_id TEXT NOT NULL REFERENCES credit_batches(id),
 type_id TEXT NOT NULL UNIQUE REFERENCES credit_types(id),
 column_key TEXT NOT NULL,
 source_heading TEXT NOT NULL,
 PRIMARY KEY(batch_id,column_key)
);
