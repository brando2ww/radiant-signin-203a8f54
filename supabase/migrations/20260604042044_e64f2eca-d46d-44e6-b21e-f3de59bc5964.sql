
ALTER TABLE public.pdv_printer_status DROP CONSTRAINT pdv_printer_status_device_id_fkey;
ALTER TABLE public.pdv_printer_status ALTER COLUMN device_id TYPE text USING device_id::text;
