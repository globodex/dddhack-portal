CREATE TABLE `registration_absences` (
	`email` text PRIMARY KEY NOT NULL,
	`reconciled_at` text NOT NULL,
	`cutoff` text NOT NULL,
	FOREIGN KEY (`email`) REFERENCES `registrations`(`email`) ON UPDATE no action ON DELETE no action
);

CREATE TRIGGER registration_absences_immutable_update BEFORE UPDATE ON registration_absences BEGIN SELECT RAISE(ABORT,'IMMUTABLE'); END;

CREATE TRIGGER registration_absences_immutable_delete BEFORE DELETE ON registration_absences BEGIN SELECT RAISE(ABORT,'IMMUTABLE'); END;
