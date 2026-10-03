-- A candidacy removed after the list was filed keeps its slot; seats skip it.
ALTER TABLE candidacies ADD COLUMN IF NOT EXISTS withdrawn_at date;
