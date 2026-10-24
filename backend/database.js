"use strict";

const { AsyncLocalStorage } = require("node:async_hooks");
const { Pool, types } = require("pg");

// Epoch milliseconds and counts in this app fit safely in a JavaScript number.
types.setTypeParser(20, (value) => {
  const number = Number(value);
  if (!Number.isSafeInteger(number))
    throw new Error("Database integer exceeds the safe numeric range.");
  return number;
});

function parameters(sql, args) {
  let index = 0;
  const values = [];
  const named =
    args.length === 1 &&
    args[0] &&
    typeof args[0] === "object" &&
    !Array.isArray(args[0]);
  // Skip SQL literals, quoted identifiers and comments when translating placeholders.
  const text = sql.replace(
    /'(?:''|[^'])*'|"(?:""|[^"])*"|--[^\n]*|\/\*[\s\S]*?\*\/|\?|@[a-zA-Z_]\w*/g,
    (token) => {
      if (token === "?") {
        values.push(args[index++]);
        return `$${values.length}`;
      }
      if (token.startsWith("@")) {
        if (!named || !Object.hasOwn(args[0], token.slice(1)))
          throw new Error("Missing named SQL parameter.");
        values.push(args[0][token.slice(1)]);
        return `$${values.length}`;
      }
      return token;
    },
  );
  return { text, values };
}

function createDatabase(env = process.env) {
  // SQLite is an explicit, isolated test/development option; production never falls back.
  if (env.SQLITE_PATH && env.NODE_ENV !== "production") {
    const SQLite = require("better-sqlite3");
    const db = new SQLite(env.SQLITE_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    db.dialect = "sqlite";
    // Async callbacks must not be passed to better-sqlite3's synchronous transaction helper.
    const storage = new AsyncLocalStorage();
    let tail = Promise.resolve();
    db.transaction =
      (callback) =>
      async (...args) => {
        if (storage.getStore()) return callback(...args);
        const previous = tail;
        let release;
        tail = new Promise((resolve) => {
          release = resolve;
        });
        await previous;
        db.exec("BEGIN IMMEDIATE");
        try {
          const result = await storage.run(true, () => callback(...args));
          db.exec("COMMIT");
          return result;
        } catch (error) {
          db.exec("ROLLBACK");
          throw error;
        } finally {
          release();
        }
      };
    db.lock = async () => {};
    return db;
  }
  if (!env.DATABASE_URL)
    throw new Error(
      "DATABASE_URL is required. Configure the Neon pooled connection string.",
    );
  const url = new URL(env.DATABASE_URL);
  if (url.searchParams.get("sslmode") === "require")
    url.searchParams.set("sslmode", "verify-full");
  const pool = new Pool({
    connectionString: url.toString(),
    max: 5,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 15000,
  });
  pool.on("error", (error) =>
    console.error("Database pool error:", error.code || "connection closed"),
  );
  const storage = new AsyncLocalStorage();
  const query = (sql, values = []) =>
    (storage.getStore() || pool).query(sql, values);
  return {
    dialect: "postgres",
    pool,
    query,
    exec: (sql) => query(sql),
    prepare(sql) {
      const execute = (args) => {
        const bound = parameters(sql, args);
        return query(bound.text, bound.values);
      };
      return {
        get: async (...args) => (await execute(args)).rows[0],
        all: async (...args) => (await execute(args)).rows,
        run: async (...args) => ({ changes: (await execute(args)).rowCount }),
      };
    },
    transaction:
      (callback) =>
      async (...args) => {
        if (storage.getStore()) return callback(...args);
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const result = await storage.run(client, () => callback(...args));
          await client.query("COMMIT");
          return result;
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }
      },
    // Transaction-scoped locks also work through Neon's transaction pooler.
    lock: (key) =>
      query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [key]),
    close: () => pool.end(),
  };
}

module.exports = { createDatabase, parameters };
