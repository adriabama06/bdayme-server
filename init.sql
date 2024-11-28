CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY, -- User ID
  username VARCHAR(64) NOT NULL UNIQUE, -- User username
  email VARCHAR(255) NOT NULL UNIQUE, -- User email
  password TEXT NOT NULL, -- User encrypted password
  created_at TIMESTAMP DEFAULT NOW() -- User creation date
);

CREATE TABLE IF NOT EXISTS contacts (
  user_a INT REFERENCES users(id) ON DELETE CASCADE, -- ID User A
  user_b INT REFERENCES users(id) ON DELETE CASCADE, -- ID User B
  created_at TIMESTAMP DEFAULT NOW(), -- Timestamp indicating when this relationship was created (automatically filled with the current time upon insert)
  PRIMARY KEY (user_a, user_b) -- The combination of User A and User B ensures that there are no duplicate relationships.
);