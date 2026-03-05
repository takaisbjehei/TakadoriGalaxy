-- Create a table for players
-- This table is optional for the core gameplay because player movement and 
-- state is kept in-memory via Supabase Realtime Channels (Presence & Broadcast).
-- However, it is useful if you want to save profiles, last seen times, or stats!

CREATE TABLE IF NOT EXISTS players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen TIMESTAMPTZ DEFAULT NOW()
);

-- Enable real-time for the players table
alter publication supabase_realtime add table players;
