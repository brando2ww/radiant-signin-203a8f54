DROP POLICY IF EXISTS checklist_evidence_insert ON storage.objects;
CREATE POLICY checklist_evidence_insert
  ON storage.objects FOR INSERT
  TO anon, authenticated
  WITH CHECK (bucket_id = 'checklist-evidence');

DROP POLICY IF EXISTS checklist_evidence_update ON storage.objects;
CREATE POLICY checklist_evidence_update
  ON storage.objects FOR UPDATE
  TO anon, authenticated
  USING (bucket_id = 'checklist-evidence')
  WITH CHECK (bucket_id = 'checklist-evidence');

DROP POLICY IF EXISTS checklist_evidence_delete ON storage.objects;
CREATE POLICY checklist_evidence_delete
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'checklist-evidence');