CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY, -- User ID
  email VARCHAR(320) NOT NULL UNIQUE, -- User email
  password VARCHAR(64) NOT NULL, -- User encrypted password
  created_at TIMESTAMP DEFAULT NOW() -- User creation date
);

CREATE TABLE IF NOT EXISTS profiles (
  id INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, -- User ID
  username VARCHAR(64) NOT NULL, -- User username
  aboutme VARCHAR(1024) NOT NULL DEFAULT '', -- User shared information to other users
  birthday TIMESTAMP NOT NULL -- User birthday date
);

CREATE TABLE IF NOT EXISTS friends (
  user_a INT REFERENCES users(id) ON DELETE CASCADE, -- ID User A (The person who request the friend creation)
  user_b INT REFERENCES users(id) ON DELETE CASCADE, -- ID User B (The person who accepts the friend)
  created_at TIMESTAMP DEFAULT NOW(), -- Timestamp indicating when this relationship was created (automatically filled with the current time upon insert)
  PRIMARY KEY (user_a, user_b) -- The combination of User A and User B ensures that there are no duplicate relationships.
);

-- Development only: create a default user and profile if not exists

-- INSERT INTO users (email, password)
-- VALUES 
--   ('devuser@example.com', 'd0cc333979497e7263f6288c1aacd6f2cdc659e9efad861265095b7db9060e6a'), -- devpassword
--   ('alice@example.com', 'cb824cd5fe4950a77e36776d275f8f7039682babd490d5da3bc8fd31f4c2254c'), -- alicepassword
--   ('bob@example.com', 'bc786c379d8b4334faa1f5ed4428d53ed5fbf6247a5974a72eac7fd5c13410d8') -- bobpassword
-- ON CONFLICT (email) DO NOTHING;

-- INSERT INTO profiles (id, username, birthday)
-- SELECT id, 'devuser', '1990-05-01'::timestamp FROM users WHERE email = 'devuser@example.com'
-- ON CONFLICT (id) DO NOTHING;

-- INSERT INTO profiles (id, username, birthday)
-- SELECT id, 'alice', '1992-08-15'::timestamp FROM users WHERE email = 'alice@example.com'
-- ON CONFLICT (id) DO NOTHING;

-- INSERT INTO profiles (id, username, birthday)
-- SELECT id, 'bob', '1988-12-22'::timestamp FROM users WHERE email = 'bob@example.com'
-- ON CONFLICT (id) DO NOTHING;
