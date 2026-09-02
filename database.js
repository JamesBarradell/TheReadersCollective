const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

const DATA_DIR = process.env.READERS_CORNER_DATA_DIR || path.join(__dirname, "data");
const SQLITE_PATH = path.join(DATA_DIR, "readers-corner.db");
const LEGACY_JSON_PATH = path.join(DATA_DIR, "db.json");

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(SQLITE_PATH);
db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL DEFAULT '',
    avatar_url TEXT NOT NULL DEFAULT '',
    google_id TEXT UNIQUE,
    auth_provider TEXT,
    reading_goal INTEGER NOT NULL DEFAULT 12,
    token_version INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS books (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    author TEXT NOT NULL DEFAULT '',
    genre TEXT NOT NULL DEFAULT '',
    rating REAL NOT NULL DEFAULT 2.5,
    year INTEGER,
    started_at TEXT NOT NULL DEFAULT '',
    finished_at TEXT NOT NULL DEFAULT '',
    cover_url TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS books_user_id_idx ON books(user_id);
  CREATE TABLE IF NOT EXISTS friendships (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    friend_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, friend_id)
  );
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    from_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    to_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS messages_participants_idx ON messages(from_user_id, to_user_id, created_at);
  CREATE TABLE IF NOT EXISTS recommendations (
    id TEXT PRIMARY KEY,
    from_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    to_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    note TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    UNIQUE (from_user_id, to_user_id, book_id)
  );
  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS book_clubs (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS book_club_members (
    club_id TEXT NOT NULL REFERENCES book_clubs(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at INTEGER NOT NULL,
    PRIMARY KEY (club_id, user_id)
  );
  CREATE INDEX IF NOT EXISTS book_club_members_user_idx ON book_club_members(user_id);
  CREATE TABLE IF NOT EXISTS book_club_messages (
    id TEXT PRIMARY KEY,
    club_id TEXT NOT NULL REFERENCES book_clubs(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS book_club_messages_club_idx ON book_club_messages(club_id, created_at);
  CREATE TABLE IF NOT EXISTS book_club_invitations (
    club_id TEXT NOT NULL REFERENCES book_clubs(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    invited_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (club_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS book_club_books (
    club_id TEXT NOT NULL REFERENCES book_clubs(id) ON DELETE CASCADE,
    book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    added_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    is_book_of_month INTEGER NOT NULL DEFAULT 0,
    added_at INTEGER NOT NULL,
    PRIMARY KEY (club_id, book_id)
  );
  CREATE TABLE IF NOT EXISTS book_club_discussions (
    id TEXT PRIMARY KEY,
    club_id TEXT NOT NULL REFERENCES book_clubs(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    parent_id TEXT REFERENCES book_club_discussions(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS book_club_discussions_club_idx ON book_club_discussions(club_id, created_at);
  CREATE TABLE IF NOT EXISTS book_club_progress (
    club_id TEXT NOT NULL REFERENCES book_clubs(id) ON DELETE CASCADE,
    book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    percent INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (club_id, book_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS recommendation_dismissals (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    book_key TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, book_key)
  );
  CREATE TABLE IF NOT EXISTS trinkets (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    trinket_id TEXT NOT NULL,
    x REAL NOT NULL DEFAULT -1,
    y REAL NOT NULL DEFAULT -1,
    unlocked_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, trinket_id)
  );
  CREATE TABLE IF NOT EXISTS reading_activity (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    activity_type TEXT NOT NULL,
    book_id TEXT REFERENCES books(id) ON DELETE SET NULL,
    title TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS reading_activity_user_idx ON reading_activity(user_id, created_at);
  CREATE TABLE IF NOT EXISTS book_likes (
    book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (book_id, user_id)
  );
  CREATE INDEX IF NOT EXISTS book_likes_book_idx ON book_likes(book_id);
`);

function addColumnIfMissing(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((entry) => entry.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
  }
}

addColumnIfMissing("books", "page_count", "page_count INTEGER NOT NULL DEFAULT 0");
addColumnIfMissing("books", "current_page", "current_page INTEGER NOT NULL DEFAULT 0");
addColumnIfMissing("books", "notes", "notes TEXT NOT NULL DEFAULT ''");
addColumnIfMissing("books", "favorite_quote", "favorite_quote TEXT NOT NULL DEFAULT ''");
addColumnIfMissing("books", "tags", "tags TEXT NOT NULL DEFAULT '[]'");
addColumnIfMissing("books", "did_not_finish", "did_not_finish INTEGER NOT NULL DEFAULT 0");
addColumnIfMissing("books", "is_owned", "is_owned INTEGER NOT NULL DEFAULT 1");
addColumnIfMissing("books", "recommended_by", "recommended_by TEXT NOT NULL DEFAULT ''");
addColumnIfMissing("books", "shelf_x", "shelf_x REAL NOT NULL DEFAULT -1");
addColumnIfMissing("books", "shelf_y", "shelf_y REAL NOT NULL DEFAULT -1");
addColumnIfMissing("books", "series_name", "series_name TEXT NOT NULL DEFAULT ''");
addColumnIfMissing("books", "series_position", "series_position INTEGER NOT NULL DEFAULT 0");
addColumnIfMissing("books", "review", "review TEXT NOT NULL DEFAULT ''");
addColumnIfMissing("users", "weekly_summary_enabled", "weekly_summary_enabled INTEGER NOT NULL DEFAULT 0");
addColumnIfMissing("users", "reading_reminders_enabled", "reading_reminders_enabled INTEGER NOT NULL DEFAULT 0");
addColumnIfMissing("users", "username", "username TEXT NOT NULL DEFAULT ''");
addColumnIfMissing("users", "profile_books_visible", "profile_books_visible INTEGER NOT NULL DEFAULT 1");
addColumnIfMissing("users", "profile_activity_visible", "profile_activity_visible INTEGER NOT NULL DEFAULT 1");

function importLegacyJson() {
  const existing = db.prepare("SELECT COUNT(*) AS count FROM users").get().count;
  if (existing || !fs.existsSync(LEGACY_JSON_PATH)) return;
  const legacy = JSON.parse(fs.readFileSync(LEGACY_JSON_PATH, "utf8"));
  const insertUser = db.prepare("INSERT INTO users (id, email, password_hash, avatar_url, google_id, auth_provider, reading_goal, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
  const insertBook = db.prepare("INSERT INTO books (id, user_id, title, author, genre, rating, year, started_at, finished_at, cover_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
  const insertFriend = db.prepare("INSERT OR IGNORE INTO friendships (user_id, friend_id, created_at) VALUES (?, ?, ?)");
  const insertMessage = db.prepare("INSERT INTO messages (id, from_user_id, to_user_id, text, created_at) VALUES (?, ?, ?, ?, ?)");
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const user of legacy.users || []) insertUser.run(user.id, user.email, user.passwordHash || "", user.avatarUrl || "", user.googleId || null, user.authProvider || null, user.readingGoal || 12, user.createdAt || Date.now());
    for (const book of legacy.books || []) insertBook.run(book.id, book.userId, book.title || "Untitled", book.author || "", book.genre || "", book.rating || 2.5, book.year || null, book.startedAt || "", book.finishedAt || "", book.coverUrl || "", book.createdAt || Date.now());
    for (const friendship of legacy.friendships || []) insertFriend.run(friendship.userId, friendship.friendId, friendship.createdAt || Date.now());
    for (const message of legacy.messages || []) insertMessage.run(message.id, message.fromUserId, message.toUserId, message.text || "", message.createdAt || Date.now());
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

importLegacyJson();
module.exports = db;
