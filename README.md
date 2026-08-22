# bdayme-server
bdayme app backend

## Tests

- `npm test`: unit + API tests (no database/redis needed, they are mocked with the Node.js built-in test runner)
- `npm run test:e2e -- -- <base_url>`: full E2E test of the friends system against a deployed backend (creates 2 accounts, adds them as friends, checks both sides can see the info, logs out and prints a SQL command to remove the test accounts). Defaults to `http://127.0.0.1:6570`, or set `TEST_URL`.

TODO:
- Change ' to " for strings that are not a single char (like in C/C++) + Typo fix (like remove usage of `` when is not required, or change from == to ===)
- Leave ID as number, do not use number | string to clear what is the ID
- Clear code
- Add WebSockets to enhance the client/server comunication
