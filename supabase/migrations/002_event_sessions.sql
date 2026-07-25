-- Arena-style event schedule: parallel tracks at fixed rounds.
-- YC assigns each attendee one session per round, but attendance isn't enforced,
-- so every session in a round is a live alternative to the others.
alter table school_sessions
  add column if not exists speaker text not null default '',
  add column if not exists speaker_title text not null default '',
  add column if not exists venue text not null default '',
  add column if not exists round_label text not null default '',
  -- arena = multi-thousand stadium talk on headphones
  -- suite = capacity-limited small-group session with a YC partner
  -- symposium / curated = other invite-only formats
  add column if not exists session_type text not null default '';
