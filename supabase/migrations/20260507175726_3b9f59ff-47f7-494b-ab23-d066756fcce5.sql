-- Storage bucket for delivery driver photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('delivery-drivers', 'delivery-drivers', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Driver photos publicly readable"
ON storage.objects FOR SELECT
USING (bucket_id = 'delivery-drivers');

CREATE POLICY "Users upload own driver photos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'delivery-drivers' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users update own driver photos"
ON storage.objects FOR UPDATE
USING (bucket_id = 'delivery-drivers' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users delete own driver photos"
ON storage.objects FOR DELETE
USING (bucket_id = 'delivery-drivers' AND auth.uid()::text = (storage.foldername(name))[1]);
