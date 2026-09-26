-- Elections 26: initial schema. Mirrors packages/schema (zod) one table per collection;
-- column map lives in src/columns.ts and a test checks the two agree.
-- Web app connects with a read-only role (web_reader); only the sync job writes.

CREATE TABLE IF NOT EXISTS elections (
  id text PRIMARY KEY, knesset_number int NOT NULL, election_date date NOT NULL,
  total_seats int NOT NULL, threshold_pct numeric NOT NULL,
  list_submission_opens_at date, list_submission_closes_at date
);
CREATE TABLE IF NOT EXISTS persons (
  id text PRIMARY KEY, slug text NOT NULL UNIQUE, name_he text NOT NULL, name_en text,
  name_normalized text NOT NULL, gender text NOT NULL, birth_date date, photo_url text,
  knesset_person_id int, wikidata_id text, knesset_profile_url text
);
CREATE INDEX IF NOT EXISTS persons_knesset_person_id ON persons (knesset_person_id);
CREATE TABLE IF NOT EXISTS parties (
  id text PRIMARY KEY, slug text NOT NULL UNIQUE, name_he text NOT NULL, name_en text, short_name_he text,
  leader_person_id text, logo_url text, ballot_letters text, knesset_faction_id int, website_url text
);
CREATE TABLE IF NOT EXISTS candidate_lists (
  id text PRIMARY KEY, election_id text NOT NULL REFERENCES elections(id), party_id text NOT NULL REFERENCES parties(id),
  status text NOT NULL CHECK (status IN ('submitted','approved','disqualified','withdrawn')),
  submitted_at date, status_changed_at date, status_note text
);
CREATE TABLE IF NOT EXISTS candidacies (
  id text PRIMARY KEY, list_id text NOT NULL REFERENCES candidate_lists(id) ON DELETE CASCADE,
  person_id text NOT NULL REFERENCES persons(id), position int NOT NULL CHECK (position > 0),
  UNIQUE (list_id, position)
);
CREATE INDEX IF NOT EXISTS candidacies_person ON candidacies (person_id);
CREATE TABLE IF NOT EXISTS knesset_memberships (
  id text PRIMARY KEY, person_id text NOT NULL REFERENCES persons(id), knesset_number int NOT NULL,
  faction_id text, faction_name_he text, start_date date, end_date date
);
CREATE TABLE IF NOT EXISTS committees (
  id text PRIMARY KEY, knesset_committee_id int, name_he text NOT NULL, knesset_number int
);
CREATE TABLE IF NOT EXISTS committee_memberships (
  id text PRIMARY KEY, person_id text NOT NULL REFERENCES persons(id), committee_id text NOT NULL REFERENCES committees(id),
  knesset_number int NOT NULL, role text NOT NULL, start_date date, end_date date
);
CREATE TABLE IF NOT EXISTS bills (
  id text PRIMARY KEY, knesset_bill_id int, name_he text NOT NULL, knesset_number int, status text NOT NULL,
  status_raw_he text, bill_type text NOT NULL, last_updated_at date, url text
);
CREATE TABLE IF NOT EXISTS bill_initiators (
  id text PRIMARY KEY, bill_id text NOT NULL REFERENCES bills(id), person_id text NOT NULL REFERENCES persons(id),
  is_primary bool NOT NULL
);
CREATE TABLE IF NOT EXISTS polls (
  id text PRIMARY KEY, election_id text NOT NULL REFERENCES elections(id), pollster text NOT NULL, publisher text NOT NULL,
  published_at date NOT NULL, fieldwork_start date, fieldwork_end date, sample_size int, margin_of_error numeric,
  source_url text NOT NULL
);
CREATE TABLE IF NOT EXISTS poll_results (
  id text PRIMARY KEY, poll_id text NOT NULL REFERENCES polls(id) ON DELETE CASCADE, party_id text NOT NULL REFERENCES parties(id),
  mandates int NOT NULL CHECK (mandates >= 0), below_threshold bool NOT NULL, UNIQUE (poll_id, party_id)
);
CREATE TABLE IF NOT EXISTS sources (
  id text PRIMARY KEY, kind text NOT NULL, url text, title text NOT NULL, retrieved_at text NOT NULL, note text
);
CREATE TABLE IF NOT EXISTS claims (
  id text PRIMARY KEY, subject_type text NOT NULL, subject_id text NOT NULL, field text NOT NULL, value text NOT NULL,
  source_id text NOT NULL REFERENCES sources(id), verified_at text NOT NULL
);
CREATE INDEX IF NOT EXISTS claims_subject ON claims (subject_type, subject_id);

-- Side data keyed by the name as filed / list position (see apps/web/src/lib/extras.ts).
CREATE TABLE IF NOT EXISTS knesset_profiles (
  filed_name text PRIMARY KEY, knesset_person_id int NOT NULL, profile jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS legislative_items (
  filed_name text PRIMARY KEY, items jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS photos (
  party_key text NOT NULL, position int NOT NULL, name_he text NOT NULL, name_as_printed text NOT NULL,
  path text NOT NULL, image_url text NOT NULL, source_page text NOT NULL, credit text NOT NULL,
  removed_at timestamptz, PRIMARY KEY (party_key, position)
);
CREATE TABLE IF NOT EXISTS bios (
  party_key text NOT NULL, position int NOT NULL, name_he text NOT NULL, name_as_printed text NOT NULL,
  text text NOT NULL, source_page text NOT NULL, credit text NOT NULL, source text NOT NULL DEFAULT 'party',
  PRIMARY KEY (party_key, position)
);

-- One row per published data version: what the site is currently serving.
CREATE TABLE IF NOT EXISTS meta (
  singleton bool PRIMARY KEY DEFAULT true CHECK (singleton), generated_at text NOT NULL, mode text NOT NULL,
  dataset text NOT NULL CHECK (dataset IN ('example','preliminary','real')), counts jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS sync_runs (
  id bigserial PRIMARY KEY, started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','published','failed')),
  counts jsonb, error text
);

-- Row order as published, so pages list things exactly as the source did.
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['elections','persons','parties','candidate_lists','candidacies','knesset_memberships',
    'committees','committee_memberships','bills','bill_initiators','polls','poll_results','sources','claims',
    'knesset_profiles','legislative_items','photos','bios'] LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS ord int NOT NULL DEFAULT 0', t);
  END LOOP;
END $$;

-- Read-only role for the web app (created by the migration runner when it has rights).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'web_reader') THEN
    CREATE ROLE web_reader NOLOGIN;
  END IF;
  GRANT USAGE ON SCHEMA public TO web_reader;
  GRANT SELECT ON ALL TABLES IN SCHEMA public TO web_reader;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO web_reader;
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
