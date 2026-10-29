CREATE TABLE broken_probe (id int);
--> statement-breakpoint
SELECT 1/0;
