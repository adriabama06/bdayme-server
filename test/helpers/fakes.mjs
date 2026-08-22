/**
 * Test helpers: fakes for pg and redis clients so the controllers and API
 * routes can be tested without a real Postgres/Redis.
 */

export function create_fake_pg() {
    const state = {
        impl: async () => ({ rows: [], rowCount: 0 }),
        calls: []
    };

    const client = {
        async query(sql, params) {
            state.calls.push({ sql, params });
            return state.impl(sql, params);
        },
        connect: async () => {},
        on: () => {}
    };

    return {
        client,
        set_impl(impl) {
            state.impl = impl;
        },
        reset(impl) {
            state.impl = impl ?? (async () => ({ rows: [], rowCount: 0 }));
            state.calls.length = 0;
        },
        get calls() {
            return state.calls;
        }
    };
}

export function create_fake_redis() {
    const store = new Map();

    function match_pattern(pattern, key) {
        if(!pattern.includes("*")) return pattern === key;

        const parts = pattern.split("*").filter(p => p.length > 0);

        return parts.every(part => key.includes(part));
    }

    const client = {
        connect: async () => {},
        on: () => {},

        async get(key) {
            return store.has(key) ? store.get(key) : null;
        },

        async set(key, value, options = {}) {
            if(options.NX && store.has(key)) return null;

            store.set(key, typeof value === "string" ? value : String(value));

            return "OK";
        },

        async del(key_or_keys) {
            const keys = Array.isArray(key_or_keys) ? key_or_keys : [key_or_keys];
            let deleted = 0;

            for(const key of keys) {
                if(store.delete(key)) deleted++;
            }

            return deleted;
        },

        async expire(key, _seconds) {
            return store.has(key) ? 1 : 0;
        },

        async scan(cursor, options = {}) {
            const pattern = options.MATCH ?? "*";
            const keys = [...store.keys()].filter(key => match_pattern(pattern, key));

            return { cursor: "0", keys };
        }
    };

    return {
        client,
        has: key => store.has(key),
        dump: () => Object.fromEntries(store),
        clear: () => store.clear()
    };
}

/**
 * In-memory emulation of the SQL queries used by the controllers.
 * Tables are exposed so tests can inspect/assert the stored data.
 */
export function create_emulated_db() {
    const db = {
        users: [],
        profiles: [],
        friends: [],
        next_id: 1
    };

    function find_user(id) {
        return db.users.find(u => u.id === Number(id));
    }

    function friend_between(a, b) {
        return db.friends.find(f =>
            (f.user_a === Number(a) && f.user_b === Number(b)) ||
            (f.user_a === Number(b) && f.user_b === Number(a))
        );
    }

    async function query(sql, params = []) {
        sql = sql.replace(/\s+/g, " ").trim();
        const upper = sql.toUpperCase();

        // Like real pg, always hand out copies so callers can mutate results
        // (e.g. `delete user.password`) without corrupting the "database".
        const result = rows => ({ rows: rows.map(row => structuredClone(row)), rowCount: rows.length });

        // users
        if(upper.startsWith("SELECT * FROM USERS WHERE ID")) {
            const user = find_user(params[0]);
            return result(user ? [user] : []);
        }

        if(upper.startsWith("SELECT * FROM USERS WHERE")) {
            const column = sql.match(/WHERE (\w+) =/)[1];
            const user = db.users.find(u => String(u[column]) === String(params[0]));
            return result(user ? [user] : []);
        }

        if(upper.startsWith("INSERT INTO USERS")) {
            if(db.users.some(u => u.username === params[0])) {
                throw new Error("duplicate key value violates unique constraint");
            }

            const user = {
                id: db.next_id++,
                username: params[0],
                password: params[1],
                created_at: new Date()
            };
            db.users.push(user);
            return result([user]);
        }

        if(upper.startsWith("DELETE FROM USERS")) {
            const index = db.users.findIndex(u => u.id === Number(params[0]));
            if(index === -1) return { rows: [], rowCount: 0 };
            db.profiles = db.profiles.filter(p => p.id !== db.users[index].id); // ON DELETE CASCADE
            db.friends = db.friends.filter(f => f.user_a !== db.users[index].id && f.user_b !== db.users[index].id);
            return result([db.users.splice(index, 1)[0]]);
        }

        if(upper.startsWith("UPDATE USERS SET")) {
            const option = sql.match(/SET (\w+) =/)[1];
            const user = find_user(params[0]);
            if(!user) return { rows: [], rowCount: 0 };
            user[option] = params[1];
            return result([user]);
        }

        // profiles
        if(upper.startsWith("SELECT * FROM PROFILES WHERE ID")) {
            const profile = db.profiles.find(p => p.id === Number(params[0]));
            return result(profile ? [profile] : []);
        }

        if(upper.startsWith("SELECT * FROM PROFILES WHERE")) {
            const column = sql.match(/WHERE (\w+) =/)[1];
            const profile = db.profiles.find(p => String(p[column]) === String(params[0]));
            return result(profile ? [profile] : []);
        }

        if(upper.startsWith("INSERT INTO PROFILES")) {
            if(db.profiles.some(p => p.id === Number(params[0]))) {
                throw new Error("duplicate key value violates unique constraint");
            }
            if(!find_user(params[0])) {
                throw new Error("insert or update on table \"profiles\" violates foreign key constraint");
            }

            const profile = {
                id: Number(params[0]),
                display_name: params[1],
                birthday: params[2] instanceof Date ? params[2] : new Date(params[2]),
                aboutme: ""
            };
            db.profiles.push(profile);
            return result([profile]);
        }

        if(upper.startsWith("DELETE FROM PROFILES")) {
            const index = db.profiles.findIndex(p => p.id === Number(params[0]));
            if(index === -1) return { rows: [], rowCount: 0 };
            return result([db.profiles.splice(index, 1)[0]]);
        }

        if(upper.startsWith("UPDATE PROFILES SET")) {
            const option = sql.match(/SET (\w+) =/)[1];
            const profile = db.profiles.find(p => p.id === Number(params[0]));
            if(!profile) return { rows: [], rowCount: 0 };
            profile[option] = params[1];
            return result([profile]);
        }

        // friends
        if(upper.startsWith("SELECT * FROM FRIENDS WHERE USER_A") || upper.startsWith("SELECT * FROM FRIENDS WHERE (USER_A")) {
            const id = Number(params[0]);
            const rows = db.friends.filter(f => f.user_a === id || f.user_b === id);
            return result(rows);
        }

        if(upper.startsWith("SELECT 1 FROM FRIENDS")) {
            const found = friend_between(params[0], params[1]) !== undefined;
            return found ? { rows: [{ "?column?": 1 }], rowCount: 1 } : { rows: [], rowCount: 0 };
        }

        if(upper.startsWith("INSERT INTO FRIENDS")) {
            if(!find_user(params[0]) || !find_user(params[1])) {
                throw new Error("insert or update on table \"friends\" violates foreign key constraint");
            }
            if(friend_between(params[0], params[1])) {
                throw new Error("duplicate key value violates unique constraint");
            }

            const friend = {
                user_a: Number(params[0]),
                user_b: Number(params[1]),
                created_at: new Date()
            };
            db.friends.push(friend);
            return result([friend]);
        }

        if(upper.startsWith("DELETE FROM FRIENDS")) {
            const found = db.friends.find(f =>
                (f.user_a === Number(params[0]) && f.user_b === Number(params[1])) ||
                (f.user_a === Number(params[1]) && f.user_b === Number(params[0]))
            );
            if(!found) return { rows: [], rowCount: 0 };
            db.friends = db.friends.filter(f => f !== found);
            return result([found]);
        }

        throw new Error(`Unexpected SQL in test: ${sql}`);
    }

    return {
        query,
        tables: db,
        reset() {
            db.users.length = 0;
            db.profiles.length = 0;
            db.friends.length = 0;
            db.next_id = 1;
        }
    };
}
