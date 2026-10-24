-- Additive stock history. Duplicate legacy keys/fingerprints abort this migration
-- atomically for review; never merge categories or reassign their codes.
CREATE TABLE credit_category_keys (
 source_key TEXT PRIMARY KEY,
 type_id TEXT NOT NULL UNIQUE REFERENCES credit_types(id)
);
INSERT INTO credit_category_keys
 SELECT lower(trim(COALESCE((SELECT source_heading FROM credit_batch_columns c WHERE c.type_id=t.id),t.name))),t.id FROM credit_types t;

CREATE UNIQUE INDEX credit_inventory_global_fingerprint ON credit_inventory(fingerprint);
CREATE TABLE credit_code_history (
 fingerprint TEXT PRIMARY KEY,
 inventory_id TEXT NOT NULL UNIQUE,
 type_id TEXT NOT NULL,
 source_key TEXT NOT NULL,
 first_seen_at TEXT NOT NULL,
 assigned INTEGER NOT NULL DEFAULT 0 CHECK(assigned IN (0,1)),
 exposed INTEGER NOT NULL DEFAULT 0 CHECK(exposed IN (0,1))
);
INSERT INTO credit_code_history
 SELECT i.fingerprint,i.id,i.type_id,k.source_key,i.created_at,CASE WHEN a.inventory_id IS NULL THEN 0 ELSE 1 END,CASE WHEN a.inventory_id IS NULL THEN 0 ELSE 1 END
 FROM credit_inventory i JOIN credit_category_keys k ON k.type_id=i.type_id LEFT JOIN credit_allocations a ON a.inventory_id=i.id;
CREATE TABLE credit_stock_imports (
 digest TEXT PRIMARY KEY,
 created_at TEXT NOT NULL,
 result TEXT NOT NULL CHECK(json_valid(result))
);

CREATE TRIGGER credit_stock_not_retired BEFORE INSERT ON credit_inventory
 WHEN EXISTS(SELECT 1 FROM credit_code_history WHERE fingerprint=NEW.fingerprint)
 BEGIN SELECT RAISE(ABORT,'CREDIT_CODE_RETIRED'); END;
CREATE TRIGGER credit_stock_record AFTER INSERT ON credit_inventory
 BEGIN
 INSERT INTO credit_code_history VALUES(NEW.fingerprint,NEW.id,NEW.type_id,COALESCE((SELECT source_key FROM credit_category_keys WHERE type_id=NEW.type_id),(SELECT lower(trim(name)) FROM credit_types WHERE id=NEW.type_id)),NEW.created_at,0,0);
 END;
CREATE TRIGGER credit_stock_immutable BEFORE UPDATE ON credit_inventory
 WHEN NEW.id IS NOT OLD.id OR NEW.type_id IS NOT OLD.type_id OR NEW.fingerprint IS NOT OLD.fingerprint OR NEW.voucher_value IS NOT OLD.voucher_value OR NEW.ciphertext IS NOT OLD.ciphertext
 BEGIN SELECT RAISE(ABORT,'CREDIT_STOCK_IMMUTABLE'); END;
CREATE TRIGGER credit_history_no_delete BEFORE DELETE ON credit_code_history
 BEGIN SELECT RAISE(ABORT,'CREDIT_HISTORY_IMMUTABLE'); END;
CREATE TRIGGER credit_history_immutable BEFORE UPDATE ON credit_code_history
 WHEN NEW.fingerprint IS NOT OLD.fingerprint OR NEW.inventory_id IS NOT OLD.inventory_id OR NEW.type_id IS NOT OLD.type_id OR NEW.source_key IS NOT OLD.source_key OR NEW.first_seen_at IS NOT OLD.first_seen_at
 OR NEW.assigned<OLD.assigned OR NEW.exposed<OLD.exposed
 BEGIN SELECT RAISE(ABORT,'CREDIT_HISTORY_IMMUTABLE'); END;
CREATE TRIGGER credit_assignment_not_recycled BEFORE INSERT ON credit_allocations
 WHEN EXISTS(SELECT 1 FROM credit_code_history h WHERE h.inventory_id=NEW.inventory_id AND h.assigned=1) AND NOT EXISTS(SELECT 1 FROM credit_allocations a WHERE a.inventory_id=NEW.inventory_id AND a.user_id=NEW.user_id)
 BEGIN SELECT RAISE(ABORT,'CREDIT_CODE_ALREADY_ASSIGNED'); END;
CREATE TRIGGER credit_assignment_record AFTER INSERT ON credit_allocations
 BEGIN UPDATE credit_code_history SET assigned=1 WHERE inventory_id=NEW.inventory_id AND assigned=0; END;
CREATE TRIGGER credit_assignment_immutable BEFORE UPDATE ON credit_allocations
 WHEN NEW.inventory_id IS NOT OLD.inventory_id OR NEW.type_id IS NOT OLD.type_id OR NEW.user_id IS NOT OLD.user_id
 BEGIN SELECT RAISE(ABORT,'CREDIT_ASSIGNMENT_IMMUTABLE'); END;
CREATE TRIGGER credit_import_no_update BEFORE UPDATE ON credit_stock_imports
 BEGIN SELECT RAISE(ABORT,'CREDIT_IMPORT_IMMUTABLE'); END;
CREATE TRIGGER credit_import_no_delete BEFORE DELETE ON credit_stock_imports
 BEGIN SELECT RAISE(ABORT,'CREDIT_IMPORT_IMMUTABLE'); END;
