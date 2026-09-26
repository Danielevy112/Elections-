-- Per-candidate legislative record: the site reads one person's bills at a time instead
-- of loading every bill into the cached snapshot, so these lookups must be indexed.
CREATE INDEX IF NOT EXISTS bill_initiators_person ON bill_initiators (person_id, is_primary);
CREATE INDEX IF NOT EXISTS bill_initiators_bill ON bill_initiators (bill_id);
CREATE INDEX IF NOT EXISTS bills_status_type ON bills (status, bill_type);
