CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY, -- User ID
  email VARCHAR(255) NOT NULL UNIQUE, -- User email
  password VARCHAR(255) NOT NULL, -- User encrypted password
  created_at TIMESTAMP DEFAULT NOW() -- User creation date
);

CREATE TABLE IF NOT EXISTS profiles (
  id INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, -- User ID
  username VARCHAR(64) NOT NULL, -- User username
  birthday TIMESTAMP NOT NULL -- User birthday date
);

CREATE TABLE IF NOT EXISTS contacts (
  user_a INT REFERENCES users(id) ON DELETE CASCADE, -- ID User A
  user_b INT REFERENCES users(id) ON DELETE CASCADE, -- ID User B
  created_at TIMESTAMP DEFAULT NOW(), -- Timestamp indicating when this relationship was created (automatically filled with the current time upon insert)
  PRIMARY KEY (user_a, user_b) -- The combination of User A and User B ensures that there are no duplicate relationships.
);

-- Development only: create a default user and profile if not exists
INSERT INTO users (email, password)
VALUES ('devuser@example.com', 'devpassword')
ON CONFLICT (email) DO NOTHING;

INSERT INTO profiles (id, username, birthday)
SELECT id, 'devuser', '1990-05-01'::timestamp FROM users WHERE email = 'devuser@example.com'
ON CONFLICT (id) DO NOTHING;
