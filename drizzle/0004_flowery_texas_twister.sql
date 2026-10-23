CREATE TABLE `write_guards` (
	`token` text PRIMARY KEY NOT NULL,
	`valid` integer NOT NULL,
	CONSTRAINT "write_guard_valid" CHECK("write_guards"."valid"=1)
);
