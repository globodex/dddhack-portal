-- Additive, reviewed stock migration. Duplicate legacy keys/fingerprints cause
-- an atomic failure for manual review, never a destructive automatic merge.
CREATE TABLE credit_category_keys(source_key text PRIMARY KEY,type_id text NOT NULL UNIQUE REFERENCES credit_types(id));
INSERT INTO credit_category_keys SELECT lower(trim(COALESCE((SELECT source_heading FROM credit_batch_columns c WHERE c.type_id=t.id),t.name))),t.id FROM credit_types t;
CREATE UNIQUE INDEX credit_inventory_global_fingerprint ON credit_inventory(fingerprint);
CREATE TABLE credit_code_history(
 fingerprint text PRIMARY KEY,inventory_id text NOT NULL UNIQUE,type_id text NOT NULL,source_key text NOT NULL,first_seen_at text NOT NULL,
 assigned integer NOT NULL DEFAULT 0 CHECK(assigned IN (0,1)),exposed integer NOT NULL DEFAULT 0 CHECK(exposed IN (0,1))
);
INSERT INTO credit_code_history SELECT i.fingerprint,i.id,i.type_id,k.source_key,i.created_at,CASE WHEN a.inventory_id IS NULL THEN 0 ELSE 1 END,CASE WHEN a.inventory_id IS NULL THEN 0 ELSE 1 END FROM credit_inventory i JOIN credit_category_keys k ON k.type_id=i.type_id LEFT JOIN credit_allocations a ON a.inventory_id=i.id;
CREATE TABLE credit_stock_imports(digest text PRIMARY KEY,created_at text NOT NULL,result text NOT NULL CHECK(portal_json_valid(result)));

CREATE FUNCTION portal_credit_stock_not_retired() RETURNS trigger LANGUAGE plpgsql AS $portal$
BEGIN
 IF EXISTS(SELECT 1 FROM credit_code_history WHERE fingerprint=NEW.fingerprint) THEN RAISE EXCEPTION 'CREDIT_CODE_RETIRED' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END;$portal$;
CREATE TRIGGER credit_stock_not_retired BEFORE INSERT ON credit_inventory FOR EACH ROW EXECUTE FUNCTION portal_credit_stock_not_retired();
CREATE FUNCTION portal_credit_stock_record() RETURNS trigger LANGUAGE plpgsql AS $portal$
BEGIN
 INSERT INTO credit_code_history VALUES(NEW.fingerprint,NEW.id,NEW.type_id,COALESCE((SELECT source_key FROM credit_category_keys WHERE type_id=NEW.type_id),(SELECT lower(trim(name)) FROM credit_types WHERE id=NEW.type_id)),NEW.created_at,0,0);
 RETURN NEW;
END;$portal$;
CREATE TRIGGER credit_stock_record AFTER INSERT ON credit_inventory FOR EACH ROW EXECUTE FUNCTION portal_credit_stock_record();
CREATE FUNCTION portal_credit_stock_immutable() RETURNS trigger LANGUAGE plpgsql AS $portal$
BEGIN
 IF NEW.id IS DISTINCT FROM OLD.id OR NEW.type_id IS DISTINCT FROM OLD.type_id OR NEW.fingerprint IS DISTINCT FROM OLD.fingerprint OR NEW.voucher_value IS DISTINCT FROM OLD.voucher_value OR NEW.ciphertext IS DISTINCT FROM OLD.ciphertext THEN RAISE EXCEPTION 'CREDIT_STOCK_IMMUTABLE' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END;$portal$;
CREATE TRIGGER credit_stock_immutable BEFORE UPDATE ON credit_inventory FOR EACH ROW EXECUTE FUNCTION portal_credit_stock_immutable();
CREATE FUNCTION portal_credit_history_no_delete() RETURNS trigger LANGUAGE plpgsql AS $portal$
BEGIN RAISE EXCEPTION 'CREDIT_HISTORY_IMMUTABLE' USING ERRCODE='23514'; END;$portal$;
CREATE TRIGGER credit_history_no_delete BEFORE DELETE ON credit_code_history FOR EACH ROW EXECUTE FUNCTION portal_credit_history_no_delete();
CREATE FUNCTION portal_credit_history_immutable() RETURNS trigger LANGUAGE plpgsql AS $portal$
BEGIN
 IF NEW.fingerprint IS DISTINCT FROM OLD.fingerprint OR NEW.inventory_id IS DISTINCT FROM OLD.inventory_id OR NEW.type_id IS DISTINCT FROM OLD.type_id OR NEW.source_key IS DISTINCT FROM OLD.source_key OR NEW.first_seen_at IS DISTINCT FROM OLD.first_seen_at
 OR NEW.assigned<OLD.assigned OR NEW.exposed<OLD.exposed THEN RAISE EXCEPTION 'CREDIT_HISTORY_IMMUTABLE' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END;$portal$;
CREATE TRIGGER credit_history_immutable BEFORE UPDATE ON credit_code_history FOR EACH ROW EXECUTE FUNCTION portal_credit_history_immutable();
CREATE FUNCTION portal_credit_assignment_not_recycled() RETURNS trigger LANGUAGE plpgsql AS $portal$
BEGIN
 IF EXISTS(SELECT 1 FROM credit_code_history h WHERE h.inventory_id=NEW.inventory_id AND h.assigned=1) AND NOT EXISTS(SELECT 1 FROM credit_allocations a WHERE a.inventory_id=NEW.inventory_id AND a.user_id=NEW.user_id) THEN RAISE EXCEPTION 'CREDIT_CODE_ALREADY_ASSIGNED' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END;$portal$;
CREATE TRIGGER credit_assignment_not_recycled BEFORE INSERT ON credit_allocations FOR EACH ROW EXECUTE FUNCTION portal_credit_assignment_not_recycled();
CREATE FUNCTION portal_credit_assignment_record() RETURNS trigger LANGUAGE plpgsql AS $portal$
BEGIN
 UPDATE credit_code_history SET assigned=1 WHERE inventory_id=NEW.inventory_id AND assigned=0;
 RETURN NEW;
END;$portal$;
CREATE TRIGGER credit_assignment_record AFTER INSERT ON credit_allocations FOR EACH ROW EXECUTE FUNCTION portal_credit_assignment_record();
CREATE FUNCTION portal_credit_import_immutable() RETURNS trigger LANGUAGE plpgsql AS $portal$
BEGIN RAISE EXCEPTION 'CREDIT_IMPORT_IMMUTABLE' USING ERRCODE='23514'; END;$portal$;
CREATE TRIGGER credit_import_no_update BEFORE UPDATE ON credit_stock_imports FOR EACH ROW EXECUTE FUNCTION portal_credit_import_immutable();
CREATE TRIGGER credit_import_no_delete BEFORE DELETE ON credit_stock_imports FOR EACH ROW EXECUTE FUNCTION portal_credit_import_immutable();
CREATE TRIGGER portal_serializable BEFORE INSERT OR UPDATE OR DELETE ON credit_category_keys FOR EACH STATEMENT EXECUTE FUNCTION portal_require_serializable();
CREATE TRIGGER portal_serializable BEFORE INSERT OR UPDATE OR DELETE ON credit_code_history FOR EACH STATEMENT EXECUTE FUNCTION portal_require_serializable();
CREATE TRIGGER portal_serializable BEFORE INSERT OR UPDATE OR DELETE ON credit_stock_imports FOR EACH STATEMENT EXECUTE FUNCTION portal_require_serializable();
