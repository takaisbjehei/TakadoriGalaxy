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

-- Optional: Create a table for chat messages if you want to keep a history
-- Currently, chat is also broadcasted immediately via Realtime Broadcast.
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_name TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable real-time for the players table
alter publication supabase_realtime add table players;

-- Enable real-time for chat messages (if using DB inserts instead of standard Broadcast logic)
alter publication supabase_realtime add table chat_messages;
