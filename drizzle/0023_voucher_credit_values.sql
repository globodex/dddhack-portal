ALTER TABLE `credit_inventory` ADD `voucher_value` text;
--> statement-breakpoint
CREATE TRIGGER voucher_credit_storage_insert BEFORE INSERT ON credit_inventory WHEN NEW.voucher_value IS NOT NULL AND (length(NEW.voucher_value)<1 OR length(NEW.voucher_value)>4000 OR NEW.ciphertext<>'') BEGIN SELECT RAISE(ABORT,'INVALID_VOUCHER_STORAGE'); END;
--> statement-breakpoint
CREATE TRIGGER voucher_credit_storage_update BEFORE UPDATE OF voucher_value,ciphertext ON credit_inventory WHEN NEW.voucher_value IS NOT NULL AND (length(NEW.voucher_value)<1 OR length(NEW.voucher_value)>4000 OR NEW.ciphertext<>'') BEGIN SELECT RAISE(ABORT,'INVALID_VOUCHER_STORAGE'); END;
