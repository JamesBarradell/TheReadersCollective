const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");
const multer = require("multer");
const { OAuth2Client } = require("google-auth-library");
const db = require("./database");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === "production" ? "" : "local-development-secret-change-me");
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "";
const APP_BASE_URL = process.env.APP_BASE_URL || "";
const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;
const UPLOADS_DIR = process.env.READERS_COLLECTIVE_UPLOADS_DIR || path.join(__dirname, "uploads");
if (!JWT_SECRET) throw new Error("JWT_SECRET must be configured when NODE_ENV=production.");
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const allowedOrigins = String(process.env.CORS_ORIGIN || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const corsOrigin = allowedOrigins.length
  ? (origin, callback) => callback(null, !origin || allowedOrigins.includes(origin))
  : true;

app.disable("x-powered-by");
app.use(cors({ origin: corsOrigin }));
app.use(express.json({ limit: "32kb" }));
const noLimit = (_req, _res, next) => next();
const authLimit = process.env.NODE_ENV === "test" ? noLimit : rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: "draft-7", legacyHeaders: false, message: { message: "Too many attempts. Try again later." } });
const writeLimit = process.env.NODE_ENV === "test" ? noLimit : rateLimit({ windowMs: 60 * 1000, limit: 60, standardHeaders: "draft-7", legacyHeaders: false, message: { message: "Too many requests. Try again shortly." } });
const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, UPLOADS_DIR),
    filename: (_req, file, callback) => callback(null, `${crypto.randomUUID()}${path.extname(file.originalname || "").toLowerCase()}`)
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => callback(null, ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.mimetype))
});
const libraryImport = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const clean = (value, max = 255) => String(value || "").trim().slice(0, max);
const email = (value) => clean(value, 254).toLowerCase();
const today = () => new Date().toLocaleDateString("en-CA");
const date = (value) => { const result = clean(value, 10); return /^\d{4}-\d{2}-\d{2}$/.test(result) && result <= today() ? result : ""; };
const rating = (value) => { const result = Number(value); return Number.isFinite(result) ? Math.min(5, Math.max(1, result)) : 2.5; };
const goal = (value) => { const result = Number(value); return Number.isInteger(result) && result >= 1 ? Math.min(result, 1000) : 12; };
const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const username = (value) => clean(value, 24);
const isUsername = (value) => /^[a-z0-9_]{3,24}$/i.test(value);
const defaultUsername = (userEmail, userId = "") => {
  const base = String(userEmail || "reader").split("@")[0].replace(/[^a-z0-9_]/gi, "_").replace(/^_+|_+$/g, "").slice(0, 18) || "reader";
  return `${base}${userId ? `_${String(userId).slice(0, 5)}` : ""}`.slice(0, 24);
};
const isUrl = (value) => !value || /^https:\/\/[^\s]+$/i.test(value);
const isUploadedAvatar = (value) => {
  const match = /^\/uploads\/([a-f0-9-]+\.(?:jpg|jpeg|png|webp|gif))$/i.exec(value);
  return Boolean(match) && fs.existsSync(path.join(UPLOADS_DIR, match[1]));
};
const isAvatarUrl = (value) => isUrl(value) || isUploadedAvatar(value);
const hashToken = (value) => crypto.createHash("sha256").update(value).digest("hex");
const passwordResetReady = () => Boolean(RESEND_API_KEY && RESEND_FROM_EMAIL);

function userResponse(user) { return { id: user.id, username: user.username || defaultUsername(user.email, user.id), email: user.email, avatarUrl: user.avatar_url, readingGoal: user.reading_goal, weeklySummaryEnabled: Boolean(user.weekly_summary_enabled), readingRemindersEnabled: Boolean(user.reading_reminders_enabled), profileBooksVisible: Boolean(user.profile_books_visible), profileActivityVisible: Boolean(user.profile_activity_visible), createdAt: user.created_at }; }
function publicFriend(user) { return { id: user.id, username: user.username || defaultUsername(user.email, user.id), email: user.email, avatarUrl: user.avatar_url }; }
function bookResponse(book) { return { id: book.id, userId: book.user_id, title: book.title, author: book.author, genre: book.genre, rating: book.rating, year: book.year || "", isOwned: Boolean(book.is_owned), isRead: Boolean(book.finished_at), didNotFinish: Boolean(book.did_not_finish), startedAt: book.started_at, finishedAt: book.finished_at, coverUrl: book.cover_url, pageCount: book.page_count, currentPage: book.current_page, notes: book.notes, favoriteQuote: book.favorite_quote, review: book.review || "", tags: JSON.parse(book.tags || "[]"), recommendedBy: book.recommended_by || "", shelfX: book.shelf_x, shelfY: book.shelf_y, seriesName: book.series_name || "", seriesPosition: book.series_position || 0, createdAt: book.created_at }; }
function csvCell(value) { const text = String(value ?? ""); const safe = /^[=+\-@]/.test(text) ? `'${text}` : text; return `"${safe.replaceAll('"', '""')}"`; }
function tokenFor(user) { return jwt.sign({ sub: user.id, version: user.token_version }, JWT_SECRET, { expiresIn: "7d" }); }
function getUser(id) { return db.prepare("SELECT * FROM users WHERE id = ?").get(id); }
function logActivity(userId, activityType, bookId, title) { db.prepare("INSERT INTO reading_activity (id, user_id, activity_type, book_id, title, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(crypto.randomUUID(), userId, activityType, bookId || null, clean(title, 200), Date.now()); }
function authRequired(req, res, next) {
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ message: "Missing authorization token." });
  try { const payload = jwt.verify(token, JWT_SECRET); const user = getUser(payload.sub); if (!user || user.token_version !== payload.version) throw new Error(); req.authUser = user; return next(); }
  catch { return res.status(401).json({ message: "Invalid or expired token." }); }
}
function sanitizeBook(input, existing = {}) {
  const title = clean(input.title ?? existing.title, 200); const coverUrl = clean(input.coverUrl ?? existing.cover_url, 2000);
  const startedAt = date(input.startedAt ?? existing.started_at); const requestedFinish = date(input.finishedAt ?? existing.finished_at);
  const pageCount = Math.max(0, Math.min(100000, Number.parseInt(input.pageCount ?? existing.page_count, 10) || 0));
  const isRead = Boolean(input.isRead);
  // A finished book should always show full progress, even if the caller didn't update the current page.
  const currentPage = isRead && pageCount > 0 ? pageCount : Math.min(pageCount, Math.max(0, Number.parseInt(input.currentPage ?? existing.current_page, 10) || 0));
  const rawTags = Array.isArray(input.tags) ? input.tags : String(input.tags ?? existing.tags ?? "").split(",");
  const tags = [...new Set(rawTags.map((tag) => clean(tag, 32).toLowerCase()).filter(Boolean))].slice(0, 12);
  const savedRating = Number.isFinite(Number(existing.rating)) ? Number(existing.rating) : 2.5;
  const seriesPosition = Math.max(0, Math.min(9999, Number.parseInt(input.seriesPosition ?? existing.series_position, 10) || 0));
  return { title, author: clean(input.author, 160), genre: clean(input.genre, 80), rating: isRead ? rating(input.rating) : savedRating, year: Number.isInteger(Number(input.year)) && Number(input.year) > 0 && Number(input.year) <= 3000 ? Number(input.year) : null, isOwned: Boolean(input.isOwned ?? existing.is_owned ?? true), startedAt, finishedAt: isRead ? requestedFinish || today() : "", didNotFinish: !isRead && Boolean(input.didNotFinish ?? existing.did_not_finish), coverUrl, pageCount, currentPage, notes: clean(input.notes ?? existing.notes, 4000), favoriteQuote: clean(input.favoriteQuote ?? existing.favorite_quote, 1000), review: clean(input.review ?? existing.review, 4000), tags, recommendedBy: clean(input.recommendedBy ?? existing.recommended_by, 200), seriesName: clean(input.seriesName ?? existing.series_name, 200), seriesPosition };
}

async function sendPasswordResetEmail(recipient, token, requestBaseUrl) {
  const resetUrl = `${APP_BASE_URL || requestBaseUrl}/reset.html?token=${encodeURIComponent(token)}`;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: RESEND_FROM_EMAIL,
      to: [recipient],
      subject: "Reset your Readers Collective password",
      text: `Reset your password: ${resetUrl}\n\nThis link expires in one hour.`,
      html: `<p>Reset your Readers Collective password:</p><p><a href="${resetUrl}">Reset password</a></p><p>This link expires in one hour.</p>`
    })
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const message = clean(payload?.message || payload?.name || "Unknown Resend error", 500);
    throw new Error(`Resend rejected password recovery email (${response.status}): ${message}`);
  }
}
function parseCsv(text) {
  const content = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows = []; let row = []; let cell = ""; let quoted = false;
  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    if (character === '"' && quoted && content[index + 1] === '"') { cell += '"'; index += 1; }
    else if (character === '"') quoted = !quoted;
    else if (character === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((character === "\n" || character === "\r") && !quoted) { if (character === "\r" && content[index + 1] === "\n") index += 1; row.push(cell); if (row.some(Boolean)) rows.push(row); row = []; cell = ""; }
    else cell += character;
  }
  row.push(cell); if (row.some(Boolean)) rows.push(row);
  const [headers, ...entries] = rows;
  return entries.map((entry) => Object.fromEntries(headers.map((header, index) => [header, entry[index] || ""])));
}
function importBookData(entry) {
  const exclusiveShelf = String(entry["Exclusive Shelf"] || "").trim().toLowerCase();
  const isRead = entry.isRead === true || entry.isRead === "true" || entry.Status === "Finished" || exclusiveShelf === "read" || Boolean(entry.finishedAt || entry["Finished On"] || entry["Date Read"]);
  const goodreadsCoverUrl = String(entry["Image URL"] || entry["Small Image URL"] || "").trim();
  const coverUrl = entry.coverUrl ?? entry["Cover URL"] ?? (/(?:goodreads|gr-assets)\.com/i.test(goodreadsCoverUrl) ? "" : goodreadsCoverUrl);
  const tags = entry.tags ?? entry.Tags ?? entry.Bookshelves ?? "";
  const explicitOwned = entry.isOwned ?? entry["Owned"];
  const ownedCopies = Number(entry["Owned Copies"]);
  // Only treat a book as a wishlist item when the import explicitly says so or it's on a to-read shelf.
  const isOwned = explicitOwned !== undefined ? explicitOwned : ownedCopies > 0 ? true : exclusiveShelf !== "to-read";
  return sanitizeBook({ title: entry.title ?? entry.Title, author: entry.author ?? entry.Author, genre: entry.genre ?? entry.Genre, tags, rating: entry.rating ?? entry.Rating ?? entry["My Rating"], year: entry.year ?? entry.Year ?? entry["Year Published"] ?? entry["Original Publication Year"], isOwned, startedAt: entry.startedAt ?? entry["Started On"], finishedAt: entry.finishedAt ?? entry["Finished On"] ?? entry["Date Read"], isRead, coverUrl, pageCount: entry.pageCount ?? entry["Total Pages"] ?? entry["Number of Pages"], currentPage: entry.currentPage ?? entry["Current Page"], notes: entry.notes ?? entry.Notes ?? entry["My Review"] ?? entry["Private Notes"], favoriteQuote: entry.favoriteQuote ?? entry["Favorite Quote"], seriesName: entry.seriesName ?? entry["Series Name"], seriesPosition: entry.seriesPosition ?? entry["Series Position"] });
}

async function findOpenLibraryCoverUrl(book) {
  const query = new URLSearchParams({ title: book.title, author: book.author, limit: "1", fields: "cover_i" });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`https://openlibrary.org/search.json?${query}`, { signal: controller.signal });
    const data = response.ok ? await response.json() : {};
    const coverId = Number(data.docs?.[0]?.cover_i);
    return Number.isInteger(coverId) && coverId > 0 ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg` : "";
  } catch { return ""; } finally { clearTimeout(timeout); }
}

async function findGoogleBooksCoverUrl(book) {
  const query = new URLSearchParams({ q: `intitle:${book.title} inauthor:${book.author || ""}`.trim(), maxResults: "1", fields: "items(volumeInfo(imageLinks))" });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch(`https://www.googleapis.com/books/v1/volumes?${query}`, { signal: controller.signal });
    const data = response.ok ? await response.json() : {};
    const imageLinks = data.items?.[0]?.volumeInfo?.imageLinks || {};
    const coverUrl = String(imageLinks.thumbnail || imageLinks.smallThumbnail || "");
    return coverUrl ? coverUrl.replace(/^http:/, "https:") : "";
  } catch { return ""; } finally { clearTimeout(timeout); }
}

async function findBookCoverUrl(book) {
  return (await findGoogleBooksCoverUrl(book)) || (await findOpenLibraryCoverUrl(book));
}

function genreFromSubjects(subjects) {
  const values = Array.isArray(subjects) ? subjects.map((subject) => String(subject || "").toLowerCase()) : [];
  const genres = [["Fantasy", "fantasy"], ["Science Fiction", "science fiction", "sci-fi"], ["Mystery", "mystery", "detective"], ["Thriller", "thriller", "suspense"], ["Romance", "romance"], ["Historical Fiction", "historical fiction"], ["Horror", "horror"], ["Adventure", "adventure"], ["Crime", "crime"], ["Dystopian", "dystopian"], ["Young Adult", "young adult"], ["Children's", "juvenile", "children"], ["Biography", "biography", "autobiography"], ["Memoir", "memoir"], ["Poetry", "poetry"]];
  const found = genres.find(([, ...keywords]) => keywords.some((keyword) => values.some((value) => value.includes(keyword))));
  return found ? found[0] : "";
}

async function findBookMetadata(book, selectedKey = "") {
  const titleTerm = String(book.title || "").trim().split(/\s+/)[0] || "";
  const query = new URLSearchParams({ title: titleTerm, author: book.author, limit: selectedKey ? "8" : "1", fields: "key,author_name,first_publish_year,cover_i,subject,number_of_pages_median" });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`https://openlibrary.org/search.json?${query}`, { signal: controller.signal });
    const result = response.ok ? await response.json() : {};
    const documents = Array.isArray(result.docs) ? result.docs : [];
    const match = selectedKey ? documents.find((document) => document.key === selectedKey) : documents[0];
    if (!match) return null;
    const author = String(match.author_name?.[0] || "").trim();
    const coverId = Number(match.cover_i);
    const year = Number(match.first_publish_year);
    const pageCount = Number(match.number_of_pages_median);
    return {
      author,
      genre: genreFromSubjects(match.subject),
      year: Number.isInteger(year) ? year : null,
      pageCount: Number.isInteger(pageCount) && pageCount > 0 ? pageCount : 0,
      coverUrl: Number.isInteger(coverId) && coverId > 0 ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg` : ""
    };
  } catch { return null; } finally { clearTimeout(timeout); }
}

async function findBookMetadataCandidates(book) {
  const titleTerm = String(book.title || "").trim().split(/\s+/)[0] || "";
  const query = new URLSearchParams({ title: titleTerm, author: book.author, limit: "8", fields: "key,title,author_name,first_publish_year,cover_i,subject,number_of_pages_median" });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`https://openlibrary.org/search.json?${query}`, { signal: controller.signal });
    const result = response.ok ? await response.json() : {};
    return (Array.isArray(result.docs) ? result.docs : []).map((match) => ({
      key: String(match.key || ""),
      title: String(match.title || book.title),
      author: String(match.author_name?.[0] || ""),
      genre: genreFromSubjects(match.subject),
      year: Number.isInteger(Number(match.first_publish_year)) ? Number(match.first_publish_year) : null,
      pageCount: Number.isInteger(Number(match.number_of_pages_median)) ? Number(match.number_of_pages_median) : 0,
      coverUrl: Number.isInteger(Number(match.cover_i)) && Number(match.cover_i) > 0 ? `https://covers.openlibrary.org/b/id/${Number(match.cover_i)}-M.jpg` : ""
    })).filter((candidate) => candidate.key);
  } catch { return null; } finally { clearTimeout(timeout); }
}

app.post("/api/auth/register", authLimit, async (req, res) => {
  const userEmail = email(req.body.email); const password = String(req.body.password || ""); const avatarUrl = clean(req.body.avatarUrl, 2000); const userId = crypto.randomUUID(); const nextUsername = username(req.body.username); const readingGoal = goal(req.body.readingGoal);
  if (!isEmail(userEmail) || password.length < 8 || password.length > 128 || !isUrl(avatarUrl)) return res.status(400).json({ message: "Provide a valid email, an 8-128 character password, and an HTTPS avatar URL." });
  if (!isUsername(nextUsername)) return res.status(400).json({ message: "Username must be 3-24 letters, numbers, or underscores." });
  if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(userEmail)) return res.status(409).json({ message: "Account already exists." });
  if (db.prepare("SELECT 1 FROM users WHERE username = ? COLLATE NOCASE").get(nextUsername)) return res.status(409).json({ message: "Username is already in use." });
  db.prepare("INSERT INTO users (id, email, username, password_hash, avatar_url, reading_goal, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(userId, userEmail, nextUsername, await bcrypt.hash(password, 12), avatarUrl, readingGoal, Date.now());
  const user = getUser(userId); return res.status(201).json({ token: tokenFor(user), user: userResponse(user) });
});
app.post("/api/auth/login", authLimit, async (req, res) => {
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email(req.body.email));
  if (!user) return res.status(401).json({ message: "Invalid email or password." });
  if (!user.password_hash) return res.status(401).json({ message: "This account uses Google sign-in. Sign in with Google once, then set a password in Profile Settings to use email sign-in." });
  if (!(await bcrypt.compare(String(req.body.password || ""), user.password_hash))) return res.status(401).json({ message: "Invalid email or password." });
  return res.json({ token: tokenFor(user), user: userResponse(user) });
});
app.post("/api/auth/password-reset/request", authLimit, async (req, res) => {
  if (!passwordResetReady()) return res.status(503).json({ message: "Password recovery is not configured yet." });
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email(req.body.email));
  if (user) {
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = Date.now() + 60 * 60 * 1000;
    db.prepare("DELETE FROM password_reset_tokens WHERE user_id = ? OR expires_at <= ?").run(user.id, Date.now());
    db.prepare("INSERT INTO password_reset_tokens (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)").run(hashToken(token), user.id, expiresAt, Date.now());
    try {
      await sendPasswordResetEmail(user.email, token, `${req.protocol}://${req.get("host")}`);
    } catch (error) {
      db.prepare("DELETE FROM password_reset_tokens WHERE token_hash = ?").run(hashToken(token));
      console.error("Password recovery email failed:", error instanceof Error ? error.message : error);
      return res.status(502).json({ message: "Unable to send a password recovery email right now." });
    }
  }
  return res.json({ message: "If an account exists for that email, a password reset link has been sent." });
});
app.post("/api/auth/password-reset/complete", authLimit, async (req, res) => {
  const token = clean(req.body.token, 256);
  const password = String(req.body.password || "");
  if (!token || password.length < 8 || password.length > 128) return res.status(400).json({ message: "Use a valid reset link and an 8-128 character password." });
  const record = db.prepare("SELECT * FROM password_reset_tokens WHERE token_hash = ? AND expires_at > ?").get(hashToken(token), Date.now());
  if (!record) return res.status(400).json({ message: "This password reset link is invalid or has expired." });
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?").run(await bcrypt.hash(password, 12), record.user_id);
    db.prepare("DELETE FROM password_reset_tokens WHERE user_id = ?").run(record.user_id);
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
  return res.json({ message: "Password reset. You can now sign in." });
});
app.get("/api/auth/google/config", (_req, res) => res.json({ clientId: GOOGLE_CLIENT_ID }));
app.post("/api/auth/google", authLimit, async (req, res) => {
  if (!googleClient) return res.status(503).json({ message: "Google sign-in is not configured." });
  try {
    const profile = (await googleClient.verifyIdToken({ idToken: clean(req.body.credential, 5000), audience: GOOGLE_CLIENT_ID })).getPayload(); const userEmail = email(profile?.email);
    if (!profile?.email_verified || !isEmail(userEmail)) throw new Error();
    let user = db.prepare("SELECT * FROM users WHERE google_id = ? OR email = ?").get(profile.sub, userEmail);
    if (user) db.prepare("UPDATE users SET google_id = ?, auth_provider = 'google', avatar_url = CASE WHEN avatar_url = '' THEN ? ELSE avatar_url END WHERE id = ?").run(profile.sub, clean(profile.picture, 2000), user.id);
    else { const id = crypto.randomUUID(); db.prepare("INSERT INTO users (id, email, avatar_url, google_id, auth_provider, created_at) VALUES (?, ?, ?, ?, 'google', ?)").run(id, userEmail, clean(profile.picture, 2000), profile.sub, Date.now()); user = { id }; }
    user = getUser(user.id); return res.json({ token: tokenFor(user), user: userResponse(user) });
  } catch { return res.status(401).json({ message: "Google sign-in failed. Please try again." }); }
});
app.get("/api/auth/me", authRequired, (req, res) => res.json({ user: userResponse(req.authUser) }));
app.post("/api/auth/me/avatar", authRequired, writeLimit, avatarUpload.single("avatar"), (req, res) => {
  if (!req.file) return res.status(400).json({ message: "Choose a JPG, PNG, WebP, or GIF image up to 5 MB." });
  const avatarUrl = `/uploads/${req.file.filename}`;
  db.prepare("UPDATE users SET avatar_url = ? WHERE id = ?").run(avatarUrl, req.authUser.id);
  const user = getUser(req.authUser.id);
  return res.json({ token: tokenFor(user), user: userResponse(user) });
});
app.put("/api/auth/me", authRequired, writeLimit, async (req, res) => {
  const current = req.authUser; const nextEmail = req.body.email === undefined ? current.email : email(req.body.email); const nextUsername = req.body.username === undefined ? (current.username || defaultUsername(current.email, current.id)) : username(req.body.username); const avatarUrl = req.body.avatarUrl === undefined ? current.avatar_url : clean(req.body.avatarUrl, 2000);
  if (!isEmail(nextEmail) || !isAvatarUrl(avatarUrl)) return res.status(400).json({ message: "Provide a valid email and a valid profile picture." });
  if (!isUsername(nextUsername)) return res.status(400).json({ message: "Username must be 3-24 letters, numbers, or underscores." });
  if (db.prepare("SELECT 1 FROM users WHERE email = ? AND id != ?").get(nextEmail, current.id)) return res.status(409).json({ message: "Email already in use." });
  if (db.prepare("SELECT 1 FROM users WHERE username = ? COLLATE NOCASE AND id != ?").get(nextUsername, current.id)) return res.status(409).json({ message: "Username is already in use." });
  let tokenVersion = current.token_version; let passwordHash = current.password_hash;
  if (req.body.password) { const password = String(req.body.password); if (password.length < 8 || password.length > 128) return res.status(400).json({ message: "Password must be 8-128 characters." }); passwordHash = await bcrypt.hash(password, 12); tokenVersion += 1; }
  db.prepare("UPDATE users SET email = ?, username = ?, avatar_url = ?, reading_goal = ?, weekly_summary_enabled = ?, reading_reminders_enabled = ?, profile_books_visible = ?, profile_activity_visible = ?, password_hash = ?, token_version = ? WHERE id = ?").run(nextEmail, nextUsername, avatarUrl, req.body.readingGoal === undefined ? current.reading_goal : goal(req.body.readingGoal), req.body.weeklySummaryEnabled === undefined ? current.weekly_summary_enabled : Number(Boolean(req.body.weeklySummaryEnabled)), req.body.readingRemindersEnabled === undefined ? current.reading_reminders_enabled : Number(Boolean(req.body.readingRemindersEnabled)), req.body.profileBooksVisible === undefined ? current.profile_books_visible : Number(Boolean(req.body.profileBooksVisible)), req.body.profileActivityVisible === undefined ? current.profile_activity_visible : Number(Boolean(req.body.profileActivityVisible)), passwordHash, tokenVersion, current.id);
  const user = getUser(current.id); return res.json({ token: tokenFor(user), user: userResponse(user) });
});

app.delete("/api/auth/me", authRequired, writeLimit, (req, res) => {
  db.prepare("DELETE FROM users WHERE id = ?").run(req.authUser.id);
  return res.status(204).send();
});

app.get("/api/books", authRequired, (req, res) => res.json({ books: db.prepare("SELECT * FROM books WHERE user_id = ?").all(req.authUser.id).map(bookResponse) }));
app.get("/api/books/:id", authRequired, (req, res) => { const book = db.prepare("SELECT * FROM books WHERE id = ? AND user_id = ?").get(clean(req.params.id, 64), req.authUser.id); return book ? res.json({ book: bookResponse(book) }) : res.status(404).json({ message: "Book not found." }); });
app.get("/api/recommendation-dismissals", authRequired, (req, res) => res.json({ keys: db.prepare("SELECT book_key AS key FROM recommendation_dismissals WHERE user_id = ?").all(req.authUser.id).map((entry) => entry.key) }));
app.post("/api/recommendation-dismissals", authRequired, writeLimit, (req, res) => {
  const title = clean(req.body.title, 200).toLowerCase();
  const author = clean(req.body.author, 160).toLowerCase();
  if (!title) return res.status(400).json({ message: "Book title is required." });
  const key = `${title}::${author}`;
  db.prepare("INSERT OR IGNORE INTO recommendation_dismissals (user_id, book_key, created_at) VALUES (?, ?, ?)").run(req.authUser.id, key, Date.now());
  return res.status(201).json({ key });
});
app.get("/api/library/export", authRequired, (req, res) => {
  const format = String(req.query.format || "json").toLowerCase();
  if (!["json", "csv"].includes(format)) return res.status(400).json({ message: "Export format must be json or csv." });
  const books = db.prepare("SELECT * FROM books WHERE user_id = ? ORDER BY created_at DESC").all(req.authUser.id).map(bookResponse);
  const dateStamp = new Date().toISOString().slice(0, 10);
  if (format === "json") {
    res.setHeader("Content-Disposition", `attachment; filename=readers-corner-library-${dateStamp}.json`);
    return res.type("application/json").send(JSON.stringify({ exportedAt: new Date().toISOString(), books }, null, 2));
  }
  const headers = ["Title", "Author", "Genre", "Tags", "Owned", "Rating", "Year", "Status", "Started On", "Finished On", "Current Page", "Total Pages", "Progress", "Notes", "Review", "Favorite Quote", "Cover URL", "Added At"];
  const lines = books.map((book) => [book.title, book.author, book.genre, book.tags.join(", "), book.isOwned, book.rating, book.year, book.isRead ? "Finished" : book.startedAt ? "Reading" : "Want to Read", book.startedAt, book.finishedAt, book.currentPage, book.pageCount, book.pageCount ? `${Math.round((book.currentPage / book.pageCount) * 100)}%` : "", book.notes, book.review, book.favoriteQuote, book.coverUrl, new Date(book.createdAt).toISOString()].map(csvCell).join(","));
  res.setHeader("Content-Disposition", `attachment; filename=readers-corner-library-${dateStamp}.csv`);
  return res.type("text/csv").send([headers.map(csvCell).join(","), ...lines].join("\r\n"));
});
app.post("/api/library/import", authRequired, writeLimit, libraryImport.single("library"), (req, res) => {
  if (!req.file) return res.status(400).json({ message: "Choose a JSON or CSV library backup up to 5 MB." });
  const filename = String(req.file.originalname || "").toLowerCase();
  let entries;
  try {
    const text = req.file.buffer.toString("utf8").replace(/^\uFEFF/, "");
    entries = filename.endsWith(".json") ? JSON.parse(text).books : filename.endsWith(".csv") ? parseCsv(text) : null;
  } catch { return res.status(400).json({ message: "The backup file could not be read." }); }
  if (!Array.isArray(entries)) return res.status(400).json({ message: "The backup must contain a books list." });
  if (entries.length > 5000) return res.status(400).json({ message: "A backup can contain up to 5,000 books." });
  const existing = new Set(db.prepare("SELECT lower(title) || '::' || lower(author) AS book_key FROM books WHERE user_id = ?").all(req.authUser.id).map((book) => book.book_key));
  const insert = db.prepare("INSERT INTO books (id,user_id,title,author,genre,rating,year,is_owned,started_at,finished_at,did_not_finish,cover_url,page_count,current_page,notes,favorite_quote,review,tags,series_name,series_position,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
  let imported = 0; let skipped = 0;
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const entry of entries) {
      const book = importBookData(entry || {}); const key = `${book.title.toLowerCase()}::${book.author.toLowerCase()}`;
      if (!book.title || existing.has(key)) { skipped += 1; continue; }
      insert.run(crypto.randomUUID(), req.authUser.id, book.title, book.author, book.genre, book.rating, book.year, Number(book.isOwned), book.startedAt, book.finishedAt, Number(book.didNotFinish), book.coverUrl, book.pageCount, book.currentPage, book.notes, book.favoriteQuote, book.review, JSON.stringify(book.tags), book.seriesName, Number(book.seriesPosition), Date.now());
      existing.add(key); imported += 1;
    }
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
  return res.json({ imported, skipped });
});
app.post("/api/books", authRequired, writeLimit, (req, res) => { const book = sanitizeBook(req.body); if (!book.title) return res.status(400).json({ message: "Book title is required." }); const id = crypto.randomUUID(); db.prepare("INSERT INTO books (id,user_id,title,author,genre,rating,year,is_owned,started_at,finished_at,did_not_finish,cover_url,page_count,current_page,notes,favorite_quote,review,tags,recommended_by,series_name,series_position,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(id, req.authUser.id, book.title, book.author, book.genre, book.rating, book.year, Number(book.isOwned), book.startedAt, book.finishedAt, Number(book.didNotFinish), book.coverUrl, book.pageCount, book.currentPage, book.notes, book.favoriteQuote, book.review, JSON.stringify(book.tags), book.recommendedBy, book.seriesName, book.seriesPosition, Date.now()); logActivity(req.authUser.id, "added", id, book.title); return res.status(201).json({ book: bookResponse(db.prepare("SELECT * FROM books WHERE id = ?").get(id)) }); });
app.post("/api/books/cover-upload", authRequired, writeLimit, avatarUpload.single("cover"), (req, res) => {
  if (!req.file) return res.status(400).json({ message: "Choose a JPG, PNG, WebP, or GIF image up to 5 MB." });
  return res.status(201).json({ coverUrl: `/uploads/${req.file.filename}` });
});
app.post("/api/books/:id/cover", authRequired, writeLimit, async (req, res) => { const book = db.prepare("SELECT * FROM books WHERE id = ? AND user_id = ?").get(req.params.id, req.authUser.id); if (!book) return res.status(404).json({ message: "Book not found." }); if (!book.cover_url || /(?:goodreads|gr-assets)\.com/i.test(book.cover_url)) { const coverUrl = await findBookCoverUrl(book); if (coverUrl) db.prepare("UPDATE books SET cover_url = ? WHERE id = ?").run(coverUrl, book.id); } return res.json({ book: bookResponse(db.prepare("SELECT * FROM books WHERE id = ?").get(book.id)) }); });
app.post("/api/books/:id/metadata", authRequired, writeLimit, async (req, res) => {
  const book = db.prepare("SELECT * FROM books WHERE id = ? AND user_id = ?").get(req.params.id, req.authUser.id);
  if (!book) return res.status(404).json({ message: "Book not found." });
  const metadata = await findBookMetadata(book, clean(req.query.key, 80));
  if (!metadata) return res.status(502).json({ message: "Book information is unavailable right now." });
  db.prepare("UPDATE books SET author = ?, genre = ?, year = ?, cover_url = ?, page_count = ?, current_page = ? WHERE id = ?").run(metadata.author || book.author, metadata.genre || book.genre, metadata.year || book.year, metadata.coverUrl || book.cover_url, metadata.pageCount || book.page_count, Math.min(book.current_page, metadata.pageCount || book.page_count), book.id);
  return res.json({ book: bookResponse(db.prepare("SELECT * FROM books WHERE id = ?").get(book.id)) });
});
app.get("/api/books/:id/metadata/candidates", authRequired, async (req, res) => {
  const book = db.prepare("SELECT * FROM books WHERE id = ? AND user_id = ?").get(req.params.id, req.authUser.id);
  if (!book) return res.status(404).json({ message: "Book not found." });
  const candidates = await findBookMetadataCandidates(book);
  if (!candidates) return res.status(502).json({ message: "Matching book information is unavailable right now." });
  return res.json({ candidates });
});
app.put("/api/books/:id", authRequired, writeLimit, (req, res) => { const current = db.prepare("SELECT * FROM books WHERE id = ? AND user_id = ?").get(req.params.id, req.authUser.id); if (!current) return res.status(404).json({ message: "Book not found." }); const book = sanitizeBook(req.body, current); if (!book.title) return res.status(400).json({ message: "Book title is required." }); db.prepare("UPDATE books SET title=?,author=?,genre=?,rating=?,year=?,is_owned=?,started_at=?,finished_at=?,did_not_finish=?,cover_url=?,page_count=?,current_page=?,notes=?,favorite_quote=?,review=?,tags=?,recommended_by=?,series_name=?,series_position=? WHERE id=?").run(book.title,book.author,book.genre,book.rating,book.year,Number(book.isOwned),book.startedAt,book.finishedAt,Number(book.didNotFinish),book.coverUrl,book.pageCount,book.currentPage,book.notes,book.favoriteQuote,book.review,JSON.stringify(book.tags),book.recommendedBy,book.seriesName,book.seriesPosition,current.id); if (!current.finished_at && book.finishedAt) logActivity(req.authUser.id, "finished", current.id, book.title); return res.json({ book: bookResponse(db.prepare("SELECT * FROM books WHERE id=?").get(current.id)) }); });
app.delete("/api/books/:id", authRequired, writeLimit, (req, res) => { const result = db.prepare("DELETE FROM books WHERE id = ? AND user_id = ?").run(req.params.id, req.authUser.id); return result.changes ? res.status(204).send() : res.status(404).json({ message: "Book not found." }); });
app.delete("/api/books", authRequired, writeLimit, (req, res) => { db.prepare("DELETE FROM books WHERE user_id = ?").run(req.authUser.id); return res.status(204).send(); });
app.put("/api/books/:id/position", authRequired, writeLimit, (req, res) => {
  const current = db.prepare("SELECT id FROM books WHERE id = ? AND user_id = ?").get(req.params.id, req.authUser.id);
  if (!current) return res.status(404).json({ message: "Book not found." });
  const x = Number(req.body.x); const y = Number(req.body.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return res.status(400).json({ message: "A valid shelf position is required." });
  const clampedX = Math.max(0, Math.min(1, x)); const clampedY = Math.max(0, Math.min(1, y));
  db.prepare("UPDATE books SET shelf_x = ?, shelf_y = ? WHERE id = ?").run(clampedX, clampedY, current.id);
  return res.json({ book: bookResponse(db.prepare("SELECT * FROM books WHERE id = ?").get(current.id)) });
});

const TRINKET_CATALOG = [
  { id: "bookmark", condition: (stats) => stats.finished >= 1 },
  { id: "sprout", condition: (stats) => stats.finished >= 3 },
  { id: "lantern", condition: (stats) => stats.finished >= 10 },
  { id: "trophy", condition: (stats) => stats.finished >= 25 },
  { id: "crown", condition: (stats) => stats.finished >= 50 },
  { id: "globe", condition: (stats) => stats.owned >= 15 },
  { id: "home-library", condition: (stats) => stats.owned >= 30 },
  { id: "wishing-candle", condition: (stats) => stats.wishlist >= 5 },
  { id: "shooting-star", condition: (stats) => stats.wishlist >= 15 },
  { id: "reading-cat", condition: (stats) => stats.friends >= 1 },
  { id: "reading-circle", condition: (stats) => stats.friends >= 5 }
];
function trinketResponse(row) { return { id: row.trinket_id, x: row.x, y: row.y, unlockedAt: row.unlocked_at }; }
function userTrinketStats(userId) {
  const finished = db.prepare("SELECT COUNT(*) AS count FROM books WHERE user_id = ? AND finished_at != ''").get(userId).count;
  const owned = db.prepare("SELECT COUNT(*) AS count FROM books WHERE user_id = ? AND is_owned = 1").get(userId).count;
  const wishlist = db.prepare("SELECT COUNT(*) AS count FROM books WHERE user_id = ? AND is_owned = 0").get(userId).count;
  const friends = db.prepare("SELECT COUNT(*) AS count FROM friendships WHERE user_id = ? OR friend_id = ?").get(userId, userId).count;
  return { finished, owned, wishlist, friends };
}
app.get("/api/trinkets", authRequired, (req, res) => {
  const unlocked = db.prepare("SELECT * FROM trinkets WHERE user_id = ?").all(req.authUser.id).map(trinketResponse);
  return res.json({ trinkets: unlocked, stats: userTrinketStats(req.authUser.id) });
});
app.post("/api/trinkets/:id/unlock", authRequired, writeLimit, (req, res) => {
  const trinketId = clean(req.params.id, 64);
  const entry = TRINKET_CATALOG.find((candidate) => candidate.id === trinketId);
  if (!entry) return res.status(404).json({ message: "Unknown trinket." });
  const existing = db.prepare("SELECT * FROM trinkets WHERE user_id = ? AND trinket_id = ?").get(req.authUser.id, trinketId);
  if (existing) return res.status(200).json({ trinket: trinketResponse(existing) });
  if (!entry.condition(userTrinketStats(req.authUser.id))) return res.status(403).json({ message: "This trinket has not been unlocked yet." });
  db.prepare("INSERT INTO trinkets (user_id, trinket_id, x, y, unlocked_at) VALUES (?, ?, -1, -1, ?)").run(req.authUser.id, trinketId, Date.now());
  return res.status(201).json({ trinket: trinketResponse(db.prepare("SELECT * FROM trinkets WHERE user_id = ? AND trinket_id = ?").get(req.authUser.id, trinketId)) });
});
app.put("/api/trinkets/:id/position", authRequired, writeLimit, (req, res) => {
  const trinketId = clean(req.params.id, 64);
  const current = db.prepare("SELECT * FROM trinkets WHERE user_id = ? AND trinket_id = ?").get(req.authUser.id, trinketId);
  if (!current) return res.status(404).json({ message: "Trinket not found." });
  const x = Number(req.body.x); const y = Number(req.body.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return res.status(400).json({ message: "A valid position is required." });
  const clampedX = Math.max(0, Math.min(1, x)); const clampedY = Math.max(0, Math.min(1, y));
  db.prepare("UPDATE trinkets SET x = ?, y = ? WHERE user_id = ? AND trinket_id = ?").run(clampedX, clampedY, req.authUser.id, trinketId);
  return res.json({ trinket: trinketResponse(db.prepare("SELECT * FROM trinkets WHERE user_id = ? AND trinket_id = ?").get(req.authUser.id, trinketId)) });
});

app.get("/api/friends/search", authRequired, (req, res) => { const query = clean(req.query.q, 80); if (query.length < 2) return res.json({ users: [] }); const users = db.prepare("SELECT * FROM users WHERE id != ? AND (username LIKE ? COLLATE NOCASE OR email LIKE ? COLLATE NOCASE) ORDER BY username, email LIMIT 20").all(req.authUser.id, `%${query}%`, `%${query}%`).map(publicFriend); return res.json({ users }); });
app.get("/api/friends", authRequired, (req, res) => {
  const friends = db.prepare("SELECT u.* FROM users u JOIN friendships sent ON sent.user_id = ? AND sent.friend_id = u.id JOIN friendships received ON received.user_id = u.id AND received.friend_id = ?").all(req.authUser.id, req.authUser.id).map(publicFriend);
  const incomingRequests = db.prepare("SELECT u.* FROM users u JOIN friendships f ON f.user_id = u.id AND f.friend_id = ? WHERE NOT EXISTS (SELECT 1 FROM friendships reverse WHERE reverse.user_id = ? AND reverse.friend_id = u.id)").all(req.authUser.id, req.authUser.id).map(publicFriend);
  const outgoingRequests = db.prepare("SELECT u.* FROM users u JOIN friendships f ON f.user_id = ? AND f.friend_id = u.id WHERE NOT EXISTS (SELECT 1 FROM friendships reverse WHERE reverse.user_id = u.id AND reverse.friend_id = ?)").all(req.authUser.id, req.authUser.id).map(publicFriend);
  const requestCount = incomingRequests.length;
  res.json({ friends, incomingRequests, outgoingRequests, requestCount });
});
app.post("/api/friends", authRequired, writeLimit, (req, res) => {
  const lookup = clean(req.body.email, 254);
  const friend = db.prepare("SELECT * FROM users WHERE email = ? COLLATE NOCASE OR username = ? COLLATE NOCASE").get(email(lookup), lookup);
  if (!friend) return res.status(404).json({ message: "No account found for that email." });
  if (friend.id === req.authUser.id) return res.status(400).json({ message: "You cannot add yourself as a friend." });
  if (isFriend(req.authUser.id, friend.id)) return res.status(409).json({ message: "That person is already your friend." });
  if (db.prepare("SELECT 1 FROM friendships WHERE user_id = ? AND friend_id = ?").get(friend.id, req.authUser.id)) return res.status(409).json({ message: "That person has already sent you a request. Add them back from your friend requests." });
  try { db.prepare("INSERT INTO friendships (user_id, friend_id, created_at) VALUES (?, ?, ?)").run(req.authUser.id, friend.id, Date.now()); return res.status(201).json({ friend: publicFriend(friend), pending: true }); } catch { return res.status(409).json({ message: "That friend request is already pending." }); }
});
app.post("/api/friends/:id/accept", authRequired, writeLimit, (req, res) => {
  const friendId = clean(req.params.id, 64);
  if (!db.prepare("SELECT 1 FROM friendships WHERE user_id = ? AND friend_id = ?").get(friendId, req.authUser.id)) return res.status(404).json({ message: "Friend request not found." });
  db.prepare("INSERT OR IGNORE INTO friendships (user_id, friend_id, created_at) VALUES (?, ?, ?)").run(req.authUser.id, friendId, Date.now());
  const friend = getUser(friendId);
  return res.json({ friend: publicFriend(friend) });
});
app.delete("/api/friends/:id", authRequired, writeLimit, (req, res) => { const friendId = clean(req.params.id, 64); const result = db.prepare("DELETE FROM friendships WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)").run(req.authUser.id, friendId, friendId, req.authUser.id); if (!result.changes) return res.status(404).json({ message: "Friendship or friend request not found." }); db.prepare("DELETE FROM recommendations WHERE (from_user_id = ? AND to_user_id = ?) OR (from_user_id = ? AND to_user_id = ?)").run(req.authUser.id, friendId, friendId, req.authUser.id); return res.status(204).send(); });
function isFriend(userId, friendId) { return Boolean(db.prepare("SELECT 1 FROM friendships first JOIN friendships second ON second.user_id = first.friend_id AND second.friend_id = first.user_id WHERE first.user_id = ? AND first.friend_id = ?").get(userId, friendId)); }
app.get("/api/book-clubs", authRequired, (req, res) => {
  const clubs = db.prepare("SELECT c.id, c.name, c.owner_id AS ownerId, c.created_at AS createdAt FROM book_clubs c JOIN book_club_members m ON m.club_id = c.id WHERE m.user_id = ? ORDER BY c.created_at DESC").all(req.authUser.id);
  const membersForClub = db.prepare("SELECT u.id, u.email, u.avatar_url AS avatarUrl FROM book_club_members m JOIN users u ON u.id = m.user_id WHERE m.club_id = ? ORDER BY u.email");
  return res.json({ clubs: clubs.map((club) => ({ ...club, members: membersForClub.all(club.id) })) });
});
app.post("/api/book-clubs", authRequired, writeLimit, (req, res) => {
  const name = clean(req.body.name, 80);
  const memberIds = [...new Set((Array.isArray(req.body.memberIds) ? req.body.memberIds : []).map((id) => clean(id, 64)).filter(Boolean))];
  if (!name) return res.status(400).json({ message: "Book club name is required." });
  if (!memberIds.length) return res.status(400).json({ message: "Choose at least one friend for your book club." });
  if (memberIds.length > 24 || memberIds.some((id) => id === req.authUser.id || !isFriend(req.authUser.id, id))) return res.status(400).json({ message: "Book club members must be friends on your list." });
  const club = { id: crypto.randomUUID(), name, ownerId: req.authUser.id, createdAt: Date.now() };
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("INSERT INTO book_clubs (id, owner_id, name, created_at) VALUES (?, ?, ?, ?)").run(club.id, club.ownerId, club.name, club.createdAt);
    const addMember = db.prepare("INSERT INTO book_club_members (club_id, user_id, joined_at) VALUES (?, ?, ?)");
    for (const memberId of [club.ownerId, ...memberIds]) addMember.run(club.id, memberId, club.createdAt);
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
  return res.status(201).json({ club });
});
app.delete("/api/book-clubs/:id", authRequired, writeLimit, (req, res) => {
  const result = db.prepare("DELETE FROM book_clubs WHERE id = ? AND owner_id = ?").run(clean(req.params.id, 64), req.authUser.id);
  return result.changes ? res.status(204).send() : res.status(404).json({ message: "Book club not found or you are not its owner." });
});
function isClubMember(clubId, userId) { return Boolean(db.prepare("SELECT 1 FROM book_club_members WHERE club_id = ? AND user_id = ?").get(clubId, userId)); }
function isClubOwner(clubId, userId) { return Boolean(db.prepare("SELECT 1 FROM book_clubs WHERE id = ? AND owner_id = ?").get(clubId, userId)); }
function clubRequired(req, res) { const clubId = clean(req.params.id, 64); if (!isClubMember(clubId, req.authUser.id)) { res.status(403).json({ message: "You are not a member of this book club." }); return null; } return clubId; }
app.get("/api/book-club-invitations", authRequired, (req, res) => { const invitations = db.prepare("SELECT i.club_id AS clubId, c.name, c.owner_id AS ownerId, u.username AS invitedByUsername, u.email AS invitedByEmail, i.created_at AS createdAt FROM book_club_invitations i JOIN book_clubs c ON c.id = i.club_id JOIN users u ON u.id = i.invited_by WHERE i.user_id = ? ORDER BY i.created_at DESC").all(req.authUser.id); return res.json({ invitations }); });
app.post("/api/book-clubs/:id/invitations", authRequired, writeLimit, (req, res) => { const clubId = clean(req.params.id, 64); if (!isClubOwner(clubId, req.authUser.id)) return res.status(403).json({ message: "Only the club owner can invite members." }); const userId = clean(req.body.userId, 64); if (!userId || userId === req.authUser.id || !isFriend(req.authUser.id, userId)) return res.status(400).json({ message: "You can only invite an accepted friend." }); if (isClubMember(clubId, userId)) return res.status(409).json({ message: "That person is already in the club." }); try { db.prepare("INSERT INTO book_club_invitations (club_id, user_id, invited_by, created_at) VALUES (?, ?, ?, ?)").run(clubId, userId, req.authUser.id, Date.now()); return res.status(201).json({ message: "Invitation sent." }); } catch { return res.status(409).json({ message: "That invitation is already pending." }); } });
app.post("/api/book-club-invitations/:id/accept", authRequired, writeLimit, (req, res) => { const clubId = clean(req.params.id, 64); const invitation = db.prepare("SELECT 1 FROM book_club_invitations WHERE club_id = ? AND user_id = ?").get(clubId, req.authUser.id); if (!invitation) return res.status(404).json({ message: "Club invitation not found." }); const now = Date.now(); db.exec("BEGIN IMMEDIATE"); try { db.prepare("INSERT OR IGNORE INTO book_club_members (club_id, user_id, joined_at) VALUES (?, ?, ?)").run(clubId, req.authUser.id, now); db.prepare("DELETE FROM book_club_invitations WHERE club_id = ? AND user_id = ?").run(clubId, req.authUser.id); db.exec("COMMIT"); } catch (error) { db.exec("ROLLBACK"); throw error; } return res.json({ message: "You joined the book club." }); });
app.delete("/api/book-club-invitations/:id", authRequired, writeLimit, (req, res) => { const result = db.prepare("DELETE FROM book_club_invitations WHERE club_id = ? AND user_id = ?").run(clean(req.params.id, 64), req.authUser.id); return result.changes ? res.status(204).send() : res.status(404).json({ message: "Club invitation not found." }); });
app.get("/api/book-clubs/:id/books", authRequired, (req, res) => { const clubId = clubRequired(req, res); if (!clubId) return; const books = db.prepare("SELECT cb.book_id AS id, cb.is_book_of_month AS isBookOfMonth, cb.added_at AS addedAt, b.title, b.author, b.cover_url AS coverUrl, b.page_count AS pageCount, COALESCE((SELECT percent FROM book_club_progress p WHERE p.club_id = cb.club_id AND p.book_id = cb.book_id AND p.user_id = ?), 0) AS progress FROM book_club_books cb JOIN books b ON b.id = cb.book_id WHERE cb.club_id = ? ORDER BY cb.is_book_of_month DESC, cb.added_at DESC").all(req.authUser.id, clubId); return res.json({ books }); });
app.post("/api/book-clubs/:id/books", authRequired, writeLimit, (req, res) => { const clubId = clubRequired(req, res); if (!clubId) return; const bookId = clean(req.body.bookId, 64); if (!db.prepare("SELECT 1 FROM books WHERE id = ? AND user_id = ?").get(bookId, req.authUser.id)) return res.status(404).json({ message: "Only your own books can be added to a club reading list." }); try { db.prepare("INSERT INTO book_club_books (club_id, book_id, added_by, added_at) VALUES (?, ?, ?, ?)").run(clubId, bookId, req.authUser.id, Date.now()); return res.status(201).json({ message: "Book added to the reading list." }); } catch { return res.status(409).json({ message: "That book is already on the reading list." }); } });
app.put("/api/book-clubs/:id/books/:bookId/book-of-month", authRequired, writeLimit, (req, res) => { const clubId = clean(req.params.id, 64); if (!isClubOwner(clubId, req.authUser.id)) return res.status(403).json({ message: "Only the club owner can choose the book of the month." }); const bookId = clean(req.params.bookId, 64); if (!db.prepare("SELECT 1 FROM book_club_books WHERE club_id = ? AND book_id = ?").get(clubId, bookId)) return res.status(404).json({ message: "Book is not on this reading list." }); db.prepare("UPDATE book_club_books SET is_book_of_month = 0 WHERE club_id = ?").run(clubId); db.prepare("UPDATE book_club_books SET is_book_of_month = 1 WHERE club_id = ? AND book_id = ?").run(clubId, bookId); return res.json({ message: "Book of the month updated." }); });
app.put("/api/book-clubs/:id/books/:bookId/progress", authRequired, writeLimit, (req, res) => { const clubId = clubRequired(req, res); if (!clubId) return; const bookId = clean(req.params.bookId, 64); if (!db.prepare("SELECT 1 FROM book_club_books WHERE club_id = ? AND book_id = ?").get(clubId, bookId)) return res.status(404).json({ message: "Book is not on this reading list." }); const percent = Number(req.body.percent); if (!Number.isInteger(percent) || percent < 0 || percent > 100) return res.status(400).json({ message: "Progress must be a whole number from 0 to 100." }); db.prepare("INSERT INTO book_club_progress (club_id, book_id, user_id, percent, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(club_id, book_id, user_id) DO UPDATE SET percent = excluded.percent, updated_at = excluded.updated_at").run(clubId, bookId, req.authUser.id, percent, Date.now()); return res.json({ percent }); });
app.get("/api/book-clubs/:id/discussions", authRequired, (req, res) => { const clubId = clubRequired(req, res); if (!clubId) return; const discussions = db.prepare("SELECT d.id, d.parent_id AS parentId, d.text, d.created_at AS createdAt, d.user_id AS userId, u.username, u.email FROM book_club_discussions d JOIN users u ON u.id = d.user_id WHERE d.club_id = ? ORDER BY d.created_at").all(clubId); return res.json({ discussions }); });
app.post("/api/book-clubs/:id/discussions", authRequired, writeLimit, (req, res) => { const clubId = clubRequired(req, res); if (!clubId) return; const text = clean(req.body.text, 2000); const parentId = clean(req.body.parentId, 64) || null; if (!text) return res.status(400).json({ message: "Discussion text is required." }); if (parentId && !db.prepare("SELECT 1 FROM book_club_discussions WHERE id = ? AND club_id = ?").get(parentId, clubId)) return res.status(400).json({ message: "Reply target not found." }); const discussion = { id: crypto.randomUUID(), parentId, text, userId: req.authUser.id, createdAt: Date.now() }; db.prepare("INSERT INTO book_club_discussions (id, club_id, user_id, parent_id, text, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(discussion.id, clubId, discussion.userId, discussion.parentId, discussion.text, discussion.createdAt); return res.status(201).json({ discussion }); });
app.delete("/api/book-clubs/:id/members/:userId", authRequired, writeLimit, (req, res) => { const clubId = clean(req.params.id, 64); if (!isClubOwner(clubId, req.authUser.id)) return res.status(403).json({ message: "Only the club owner can remove members." }); const userId = clean(req.params.userId, 64); if (userId === req.authUser.id) return res.status(400).json({ message: "The owner cannot be removed from the club." }); const result = db.prepare("DELETE FROM book_club_members WHERE club_id = ? AND user_id = ?").run(clubId, userId); return result.changes ? res.status(204).send() : res.status(404).json({ message: "Club member not found." }); });
app.delete("/api/book-clubs/:id/membership", authRequired, writeLimit, (req, res) => { const clubId = clean(req.params.id, 64); if (isClubOwner(clubId, req.authUser.id)) return res.status(400).json({ message: "The club owner must delete the club instead of leaving." }); const result = db.prepare("DELETE FROM book_club_members WHERE club_id = ? AND user_id = ?").run(clubId, req.authUser.id); return result.changes ? res.status(204).send() : res.status(404).json({ message: "You are not a member of this club." }); });
app.get("/api/book-clubs/:id/messages", authRequired, (req, res) => {
  const clubId = clean(req.params.id, 64);
  if (!isClubMember(clubId, req.authUser.id)) return res.status(403).json({ message: "You are not a member of this book club." });
  const messages = db.prepare("SELECT m.id, m.user_id AS fromUserId, u.email AS fromEmail, m.text, m.created_at AS createdAt FROM book_club_messages m JOIN users u ON u.id = m.user_id WHERE m.club_id = ? ORDER BY m.created_at").all(clubId);
  return res.json({ messages });
});
app.post("/api/book-clubs/:id/messages", authRequired, writeLimit, (req, res) => {
  const clubId = clean(req.params.id, 64); const text = clean(req.body.text, 2000);
  if (!text) return res.status(400).json({ message: "Message text is required." });
  if (!isClubMember(clubId, req.authUser.id)) return res.status(403).json({ message: "You are not a member of this book club." });
  const message = { id: crypto.randomUUID(), fromUserId: req.authUser.id, text, createdAt: Date.now() };
  db.prepare("INSERT INTO book_club_messages (id, club_id, user_id, text, created_at) VALUES (?, ?, ?, ?, ?)").run(message.id, clubId, message.fromUserId, message.text, message.createdAt);
  return res.status(201).json({ message });
});
app.get("/api/friends/:id/profile", authRequired, (req, res) => {
  const friendId = clean(req.params.id, 64);
  if (!isFriend(req.authUser.id, friendId)) return res.status(403).json({ message: "Add this person as a friend first." });
  const friend = getUser(friendId);
  if (!friend) return res.status(404).json({ message: "Friend not found." });
  const likeColumns = "(SELECT COUNT(*) FROM book_likes WHERE book_id = books.id) AS likeCount, EXISTS(SELECT 1 FROM book_likes WHERE book_id = books.id AND user_id = ?) AS likedByMe";
  const currentBookRow = db.prepare(`SELECT id, title, author, cover_url AS coverUrl, current_page AS currentPage, page_count AS pageCount, ${likeColumns} FROM books WHERE user_id = ? AND finished_at = '' AND started_at != '' ORDER BY started_at DESC LIMIT 1`).get(req.authUser.id, friendId) || null;
  const currentBook = currentBookRow ? { ...currentBookRow, likedByMe: Boolean(currentBookRow.likedByMe) } : null;
  const recentFinishes = db.prepare(`SELECT id, title, author, cover_url AS coverUrl, finished_at AS finishedAt, review, ${likeColumns} FROM books WHERE user_id = ? AND finished_at != '' ORDER BY finished_at DESC LIMIT 3`).all(req.authUser.id, friendId).map((book) => ({ ...book, likedByMe: Boolean(book.likedByMe) }));
  const currentYear = `${new Date().getFullYear()}-%`;
  const completed = db.prepare("SELECT COUNT(*) AS count FROM books WHERE user_id = ? AND finished_at LIKE ?").get(friendId, currentYear).count;
  return res.json({ profile: { username: friend.username || defaultUsername(friend.email, friend.id), email: friend.email, avatarUrl: friend.avatar_url, readingGoal: friend.reading_goal, completed, currentBook, recentFinishes } });
});
app.get("/api/friends/:id/reader-profile", authRequired, (req, res) => {
  const friendId = clean(req.params.id, 64);
  if (friendId !== req.authUser.id && !isFriend(req.authUser.id, friendId)) return res.status(403).json({ message: "Add this person as a friend first." });
  const friend = getUser(friendId);
  if (!friend) return res.status(404).json({ message: "Friend not found." });
  const likeColumns = "(SELECT COUNT(*) FROM book_likes WHERE book_id = books.id) AS likeCount, EXISTS(SELECT 1 FROM book_likes WHERE book_id = books.id AND user_id = ?) AS likedByMe";
  const books = friend.profile_books_visible ? db.prepare(`SELECT id, title, author, genre, year, cover_url AS coverUrl, started_at AS startedAt, finished_at AS finishedAt, current_page AS currentPage, page_count AS pageCount, review, ${likeColumns} FROM books WHERE user_id = ? AND is_owned = 1 ORDER BY CASE WHEN finished_at = '' AND started_at != '' THEN 0 ELSE 1 END, created_at DESC`).all(req.authUser.id, friendId).map((book) => ({ ...book, likedByMe: Boolean(book.likedByMe) })) : [];
  const currentBook = books.find((book) => !book.finishedAt && book.startedAt) || null;
  const recentFinishes = books.filter((book) => book.finishedAt).sort((left, right) => String(right.finishedAt).localeCompare(String(left.finishedAt))).slice(0, 5);
  const finishedCount = books.filter((book) => book.finishedAt).length;
  return res.json({ profile: { username: friend.username || defaultUsername(friend.email, friend.id), email: friend.email, avatarUrl: friend.avatar_url, readingGoal: friend.reading_goal, finishedCount, bookCount: books.length, currentBook, recentFinishes, books, booksVisible: Boolean(friend.profile_books_visible), isSelf: friendId === req.authUser.id } });
});
app.post("/api/books/:id/like", authRequired, writeLimit, (req, res) => {
  const book = db.prepare("SELECT id, user_id, is_owned FROM books WHERE id = ?").get(req.params.id);
  if (!book) return res.status(404).json({ message: "Book not found." });
  if (book.user_id === req.authUser.id) return res.status(400).json({ message: "You cannot like your own book." });
  if (!isFriend(req.authUser.id, book.user_id)) return res.status(403).json({ message: "Add this person as a friend first." });
  const owner = getUser(book.user_id);
  if (!owner?.profile_books_visible || !book.is_owned) return res.status(403).json({ message: "This book is not visible." });
  const existingLike = db.prepare("SELECT 1 FROM book_likes WHERE book_id = ? AND user_id = ?").get(book.id, req.authUser.id);
  if (existingLike) db.prepare("DELETE FROM book_likes WHERE book_id = ? AND user_id = ?").run(book.id, req.authUser.id);
  else db.prepare("INSERT INTO book_likes (book_id, user_id, created_at) VALUES (?, ?, ?)").run(book.id, req.authUser.id, Date.now());
  const likeCount = db.prepare("SELECT COUNT(*) AS count FROM book_likes WHERE book_id = ?").get(book.id).count;
  return res.json({ liked: !existingLike, likeCount });
});
app.get("/api/friends/activity", authRequired, (req, res) => { const activities = db.prepare("SELECT a.id, a.activity_type AS type, a.title, a.created_at AS createdAt, u.username, u.email FROM reading_activity a JOIN users u ON u.id = a.user_id WHERE EXISTS (SELECT 1 FROM friendships first JOIN friendships second ON second.user_id = first.friend_id AND second.friend_id = first.user_id WHERE first.user_id = ? AND first.friend_id = a.user_id) AND u.profile_activity_visible = 1 ORDER BY a.created_at DESC LIMIT 50").all(req.authUser.id); return res.json({ activities }); });
app.get("/api/recommendations", authRequired, (req, res) => { const recommendations = db.prepare("SELECT r.id, r.note, r.created_at AS createdAt, u.email AS fromEmail, b.title, b.author, b.genre, b.cover_url AS coverUrl FROM recommendations r JOIN users u ON u.id = r.from_user_id JOIN books b ON b.id = r.book_id WHERE r.to_user_id = ? ORDER BY r.created_at DESC").all(req.authUser.id); res.json({ recommendations }); });
app.delete("/api/recommendations/:id", authRequired, writeLimit, (req, res) => { const result = db.prepare("DELETE FROM recommendations WHERE id = ? AND to_user_id = ?").run(clean(req.params.id, 64), req.authUser.id); return result.changes ? res.status(204).send() : res.status(404).json({ message: "Recommendation not found." }); });
app.post("/api/recommendations", authRequired, writeLimit, (req, res) => { const friendId = clean(req.body.friendId, 64); const book = db.prepare("SELECT * FROM books WHERE id = ? AND user_id = ?").get(clean(req.body.bookId, 64), req.authUser.id); if (!book) return res.status(404).json({ message: "Book not found." }); if (!isFriend(req.authUser.id, friendId)) return res.status(403).json({ message: "Add this person as a friend first." }); try { db.prepare("INSERT INTO recommendations (id,from_user_id,to_user_id,book_id,note,created_at) VALUES (?,?,?,?,?,?)").run(crypto.randomUUID(),req.authUser.id,friendId,book.id,clean(req.body.note,500),Date.now()); return res.status(201).json({ message: "Recommendation sent." }); } catch { return res.status(409).json({ message: "You have already recommended this book to that friend." }); } });
app.get("/api/chat/messages", authRequired, (req, res) => { const friendId = clean(req.query.friendId, 64); if (!isFriend(req.authUser.id, friendId)) return res.status(403).json({ message: "Add this person as a friend first." }); const messages = db.prepare("SELECT id, from_user_id AS fromUserId, to_user_id AS toUserId, text, created_at AS createdAt FROM messages WHERE (from_user_id=? AND to_user_id=?) OR (from_user_id=? AND to_user_id=?) ORDER BY created_at").all(req.authUser.id,friendId,friendId,req.authUser.id); res.json({ messages }); });
app.post("/api/chat/messages", authRequired, writeLimit, (req, res) => { const friendId = clean(req.body.friendId, 64); const text = clean(req.body.text, 2000); if (!text) return res.status(400).json({ message: "Message text is required." }); if (!isFriend(req.authUser.id, friendId)) return res.status(403).json({ message: "Add this person as a friend first." }); const message = { id: crypto.randomUUID(), fromUserId:req.authUser.id, toUserId:friendId, text, createdAt:Date.now() }; db.prepare("INSERT INTO messages VALUES (?, ?, ?, ?, ?)").run(message.id,message.fromUserId,message.toUserId,message.text,message.createdAt); res.status(201).json({ message }); });
app.get("/api/chat/notifications", authRequired, (req, res) => {
  const since = Math.max(0, Number(req.query.since) || 0);
  const directCount = db.prepare("SELECT COUNT(*) AS count FROM messages WHERE to_user_id = ? AND created_at > ?").get(req.authUser.id, since).count;
  const clubCount = db.prepare("SELECT COUNT(*) AS count FROM book_club_messages m JOIN book_club_members members ON members.club_id = m.club_id WHERE members.user_id = ? AND m.user_id != ? AND m.created_at > ?").get(req.authUser.id, req.authUser.id, since).count;
  return res.json({ count: directCount + clubCount });
});

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use((error, _req, res, next) => {
  if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({ message: "Profile pictures must be 5 MB or smaller." });
  }
  if (error) {
    return res.status(400).json({ message: "Unable to upload that profile picture. Choose a JPG, PNG, WebP, or GIF image." });
  }
  return next();
});
app.use("/uploads", express.static(UPLOADS_DIR));
app.use(express.static(__dirname)); app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "index.html")));
if (require.main === module) app.listen(PORT, () => console.log(`The Readers Collective server running on http://localhost:${PORT}`));
module.exports = app;
