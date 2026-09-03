const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const test = require("node:test");
const request = require("supertest");

process.env.NODE_ENV = "test";
process.env.CORS_ORIGIN = "https://www.thereaderscollective.com,https://thereaderscollective.com";
process.env.READERS_CORNER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "readers-corner-test-"));
process.env.JWT_SECRET = "test-secret-not-for-production";
const app = require("../server");
const db = require("../database");

async function register(email) {
	const username = email.split("@")[0].replace(/[^a-z0-9_]/gi, "_").slice(0, 24);
  const response = await request(app)
    .post("/api/auth/register")
    .send({ email, username, password: "secure-test-password" })
    .expect(201);
  return response.body;
}

async function addFriend(first, second) {
  await request(app).post("/api/friends").set("Authorization", `Bearer ${first.token}`).send({ email: second.user.email }).expect(201);
  await request(app).post(`/api/friends/${first.user.id}/accept`).set("Authorization", `Bearer ${second.token}`).expect(200);
}

test("account creation requires a username", async () => {
  await request(app).post("/api/auth/register").send({ email: "missing-username@example.com", password: "secure-test-password" }).expect(400);
});

test("account creation saves the selected yearly reading goal", async () => {
  const response = await request(app)
    .post("/api/auth/register")
    .send({ email: "goal-reader@example.com", username: "goal_reader", password: "secure-test-password", readingGoal: 24 })
    .expect(201);
  assert.equal(response.body.user.readingGoal, 24);
  assert.equal(db.prepare("SELECT reading_goal FROM users WHERE id = ?").get(response.body.user.id).reading_goal, 24);
});

test("api allows both production site origins", async () => {
  for (const origin of ["https://www.thereaderscollective.com", "https://thereaderscollective.com"]) {
    const response = await request(app)
      .get("/api/auth/google/config")
      .set("Origin", origin)
      .expect(200);
    assert.equal(response.headers["access-control-allow-origin"], origin);
  }
});

test("books are only visible to their owner", async () => {
  const first = await register("first@example.com");
  const second = await register("second@example.com");
  await request(app)
    .post("/api/books")
    .set("Authorization", `Bearer ${first.token}`)
    .send({ title: "Private book", rating: 2.5 })
    .expect(201);
  const response = await request(app)
    .get("/api/books")
    .set("Authorization", `Bearer ${second.token}`)
    .expect(200);
  assert.deepEqual(response.body.books, []);
});

test("users can permanently delete their account and books", async () => {
  const account = await register("delete-account@example.com");
  await request(app).post("/api/books").set("Authorization", `Bearer ${account.token}`).send({ title: "Deleted book" }).expect(201);
  await request(app).delete("/api/auth/me").set("Authorization", `Bearer ${account.token}`).expect(204);
  await request(app).get("/api/auth/me").set("Authorization", `Bearer ${account.token}`).expect(401);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM books WHERE user_id = ?").get(account.user.id).count, 0);
});

test("password changes invalidate previously issued tokens", async () => {
  const account = await register("password-change@example.com");
  const response = await request(app)
    .put("/api/auth/me")
    .set("Authorization", `Bearer ${account.token}`)
    .send({ password: "updated-secure-password" })
    .expect(200);
  assert.notEqual(response.body.token, account.token);
  await request(app)
    .get("/api/auth/me")
    .set("Authorization", `Bearer ${account.token}`)
    .expect(401);
});

test("future completion dates are normalized to today", async () => {
  const account = await register("date@example.com");
  const response = await request(app)
    .post("/api/books")
    .set("Authorization", `Bearer ${account.token}`)
    .send({ title: "Date safe", isRead: true, finishedAt: "2099-01-01" })
    .expect(201);
  assert.equal(response.body.book.finishedAt, new Date().toLocaleDateString("en-CA"));
});

test("books preserve reading progress and personal reflections", async () => {
  const account = await register("progress@example.com");
  const response = await request(app)
    .post("/api/books")
    .set("Authorization", `Bearer ${account.token}`)
    .send({ title: "Reading journal", startedAt: "2026-08-01", pageCount: 320, currentPage: 120, notes: "Strong opening.", favoriteQuote: "A reader lives a thousand lives." })
    .expect(201);
  assert.equal(response.body.book.pageCount, 320);
  assert.equal(response.body.book.currentPage, 120);
  assert.equal(response.body.book.notes, "Strong opening.");
  assert.equal(response.body.book.favoriteQuote, "A reader lives a thousand lives.");
});

test("unfinished books cannot set or expose a rating", async () => {
  const account = await register("rating-state@example.com");
  const created = await request(app).post("/api/books").set("Authorization", `Bearer ${account.token}`).send({ title: "Not finished", rating: 5 }).expect(201);
  assert.equal(created.body.book.rating, 2.5);
  const finished = await request(app).put(`/api/books/${created.body.book.id}`).set("Authorization", `Bearer ${account.token}`).send({ ...created.body.book, isRead: true, rating: 4.5 }).expect(200);
  assert.equal(finished.body.book.rating, 4.5);
});

test("recommendations require an established friendship", async () => {
  const sender = await register("sender@example.com");
  const receiver = await register("receiver@example.com");
  const book = await request(app).post("/api/books").set("Authorization", `Bearer ${sender.token}`).send({ title: "Recommend me" }).expect(201);
  await request(app).post("/api/recommendations").set("Authorization", `Bearer ${sender.token}`).send({ friendId: receiver.user.id, bookId: book.body.book.id }).expect(403);
  await addFriend(sender, receiver);
  await request(app).post("/api/recommendations").set("Authorization", `Bearer ${sender.token}`).send({ friendId: receiver.user.id, bookId: book.body.book.id, note: "Worth your time." }).expect(201);
  const inbox = await request(app).get("/api/recommendations").set("Authorization", `Bearer ${receiver.token}`).expect(200);
  assert.equal(inbox.body.recommendations[0].title, "Recommend me");
});

test("friend requests cannot access profiles or messages until accepted", async () => {
  const requester = await register("requester@example.com");
  const recipient = await register("recipient@example.com");
  await request(app).post("/api/friends").set("Authorization", `Bearer ${requester.token}`).send({ email: recipient.user.email }).expect(201);
  const requesterFriends = await request(app).get("/api/friends").set("Authorization", `Bearer ${requester.token}`).expect(200);
  const recipientFriends = await request(app).get("/api/friends").set("Authorization", `Bearer ${recipient.token}`).expect(200);
  assert.deepEqual(requesterFriends.body.friends, []);
  assert.equal(requesterFriends.body.outgoingRequests[0].id, recipient.user.id);
  assert.equal(recipientFriends.body.incomingRequests[0].id, requester.user.id);
  await request(app).get(`/api/friends/${recipient.user.id}/profile`).set("Authorization", `Bearer ${requester.token}`).expect(403);
  await request(app).get("/api/chat/messages").query({ friendId: recipient.user.id }).set("Authorization", `Bearer ${requester.token}`).expect(403);
  await request(app).post(`/api/friends/${requester.user.id}/accept`).set("Authorization", `Bearer ${recipient.token}`).expect(200);
  const accepted = await request(app).get("/api/friends").set("Authorization", `Bearer ${requester.token}`).expect(200);
  assert.equal(accepted.body.friends[0].id, recipient.user.id);
});

test("users can find friends by username and control shared profile data", async () => {
  const viewer = await register("privacy-viewer@example.com");
  const friend = await register("privacy-friend@example.com");
  const search = await request(app).get(`/api/friends/search?q=${encodeURIComponent(friend.user.username)}`).set("Authorization", `Bearer ${viewer.token}`).expect(200);
  assert.equal(search.body.users[0].id, friend.user.id);
  await addFriend(viewer, friend);
  await request(app).put("/api/auth/me").set("Authorization", `Bearer ${friend.token}`).send({ profileBooksVisible: false, profileActivityVisible: false }).expect(200);
  const profile = await request(app).get(`/api/friends/${friend.user.id}/reader-profile`).set("Authorization", `Bearer ${viewer.token}`).expect(200);
  assert.equal(profile.body.profile.booksVisible, false);
  const activity = await request(app).get("/api/friends/activity").set("Authorization", `Bearer ${viewer.token}`).expect(200);
  assert.equal(activity.body.activities.some((entry) => entry.email === friend.user.email), false);
});

test("friend profiles expose selected reading activity but not private reflections", async () => {
  const viewer = await register("viewer@example.com");
  const friend = await register("profile-friend@example.com");
  assert.match(friend.user.username, /^[a-z0-9_]{3,24}$/i);
  await addFriend(viewer, friend);
  await request(app).post("/api/books").set("Authorization", `Bearer ${friend.token}`).send({ title: "Public current", author: "Reader", startedAt: "2026-08-02", pageCount: 300, currentPage: 75, notes: "Private note", favoriteQuote: "Private quote" }).expect(201);
  await request(app).post("/api/books").set("Authorization", `Bearer ${friend.token}`).send({ title: "Recent finish", finishedAt: "2026-08-03", isRead: true }).expect(201);
  const response = await request(app).get(`/api/friends/${friend.user.id}/profile`).set("Authorization", `Bearer ${viewer.token}`).expect(200);
  assert.equal(response.body.profile.currentBook.title, "Public current");
  assert.equal(response.body.profile.username, friend.user.username);
  assert.equal(response.body.profile.recentFinishes[0].title, "Recent finish");
  assert.equal("notes" in response.body.profile.currentBook, false);
  assert.equal("favoriteQuote" in response.body.profile.currentBook, false);
  assert.equal("books" in response.body.profile, false);
  const fullProfile = await request(app).get(`/api/friends/${friend.user.id}/reader-profile`).set("Authorization", `Bearer ${viewer.token}`).expect(200);
  assert.equal(fullProfile.body.profile.bookCount, 2);
  assert.equal(fullProfile.body.profile.books[0].title, "Public current");
  assert.equal("notes" in fullProfile.body.profile.books[0], false);
  assert.equal("rating" in fullProfile.body.profile.books[0], false);
});

test("library exports include private book data in JSON and CSV", async () => {
  const account = await register("export@example.com");
  await request(app)
    .post("/api/books")
    .set("Authorization", `Bearer ${account.token}`)
    .send({ title: "Export book", author: "Backup Author", rating: 4, startedAt: "2026-08-01", pageCount: 200, currentPage: 80, notes: "Keep this note.", favoriteQuote: "Keep this quote." })
    .expect(201);
  const json = await request(app).get("/api/library/export?format=json").set("Authorization", `Bearer ${account.token}`).expect("Content-Type", /json/).expect(200);
  assert.equal(json.body.books[0].notes, "Keep this note.");
  assert.equal(json.body.books[0].favoriteQuote, "Keep this quote.");
  assert.equal(json.body.books[0].currentPage, 80);
  const csv = await request(app).get("/api/library/export?format=csv").set("Authorization", `Bearer ${account.token}`).expect("Content-Type", /csv/).expect(200);
  assert.match(csv.text, /Favorite Quote/);
  assert.match(csv.text, /Keep this note/);
});

test("library imports restore book data and skip duplicates", async () => {
  const account = await register("import@example.com");
  const backup = {
    books: [{ title: "Restored book", author: "Archive Author", genre: "Fantasy", rating: 4.5, startedAt: "2026-08-01", pageCount: 450, currentPage: 225, notes: "Restored note.", favoriteQuote: "Restored quote." }]
  };
  const first = await request(app)
    .post("/api/library/import")
    .set("Authorization", `Bearer ${account.token}`)
    .attach("library", Buffer.from(JSON.stringify(backup)), "library.json")
    .expect(200);
  assert.deepEqual(first.body, { imported: 1, skipped: 0 });
  const books = await request(app).get("/api/books").set("Authorization", `Bearer ${account.token}`).expect(200);
  assert.equal(books.body.books[0].currentPage, 225);
  assert.equal(books.body.books[0].favoriteQuote, "Restored quote.");
  const second = await request(app)
    .post("/api/library/import")
    .set("Authorization", `Bearer ${account.token}`)
    .attach("library", Buffer.from(JSON.stringify(backup)), "library.json")
    .expect(200);
  assert.deepEqual(second.body, { imported: 0, skipped: 1 });
});

test("Goodreads CSV imports preserve reader details", async () => {
  const account = await register("goodreads-import@example.com");
  const csv = "Title,Author,My Rating,Number of Pages,Year Published,Date Read,Bookshelves,My Review,Owned Copies,Exclusive Shelf\r\nGoodreads import,Example Author,4,320,2021,2026-08-15,adventure,Great read,1,read";
  await request(app)
    .post("/api/library/import")
    .set("Authorization", `Bearer ${account.token}`)
    .attach("library", Buffer.from(csv), "goodreads_library_export.csv")
    .expect(200);
  const books = await request(app).get("/api/books").set("Authorization", `Bearer ${account.token}`).expect(200);
  assert.equal(books.body.books[0].rating, 4);
  assert.equal(books.body.books[0].pageCount, 320);
  assert.equal(books.body.books[0].year, 2021);
  assert.equal(books.body.books[0].finishedAt, "2026-08-15");
  assert.equal(books.body.books[0].notes, "Great read");
  assert.deepEqual(books.body.books[0].tags, ["adventure"]);
  assert.equal(books.body.books[0].isOwned, true);
});

test("password reset tokens are one-time and invalidate previous sessions", async () => {
  const account = await register("reset@example.com");
  const token = crypto.randomBytes(32).toString("hex");
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  db.prepare("INSERT INTO password_reset_tokens (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)").run(hash, account.user.id, Date.now() + 60000, Date.now());
  await request(app)
    .post("/api/auth/password-reset/complete")
    .send({ token, password: "new-secure-password" })
    .expect(200);
  await request(app).get("/api/auth/me").set("Authorization", `Bearer ${account.token}`).expect(401);
  await request(app).post("/api/auth/login").send({ email: account.user.email, password: "new-secure-password" }).expect(200);
  await request(app).post("/api/auth/password-reset/complete").send({ token, password: "another-secure-password" }).expect(400);
});

test("books preserve normalized tags and users save opt-in notification preferences", async () => {
  const account = await register("preferences@example.com");
  const book = await request(app).post("/api/books").set("Authorization", `Bearer ${account.token}`).send({ title: "Tagged book", tags: ["Book Club", "owned", "book club"] }).expect(201);
  assert.deepEqual(book.body.book.tags, ["book club", "owned"]);
  const profile = await request(app).put("/api/auth/me").set("Authorization", `Bearer ${account.token}`).send({ weeklySummaryEnabled: true, readingRemindersEnabled: true }).expect(200);
  assert.equal(profile.body.user.weeklySummaryEnabled, true);
  assert.equal(profile.body.user.readingRemindersEnabled, true);
});

test("books preserve did-not-finish state until explicitly resumed", async () => {
  const account = await register("dnf@example.com");
  const created = await request(app).post("/api/books").set("Authorization", `Bearer ${account.token}`).send({ title: "Paused book", startedAt: "2026-08-01", didNotFinish: true }).expect(201);
  assert.equal(created.body.book.didNotFinish, true);
  const edited = await request(app).put(`/api/books/${created.body.book.id}`).set("Authorization", `Bearer ${account.token}`).send({ ...created.body.book, notes: "Still paused." }).expect(200);
  assert.equal(edited.body.book.didNotFinish, true);
  const resumed = await request(app).put(`/api/books/${created.body.book.id}`).set("Authorization", `Bearer ${account.token}`).send({ ...edited.body.book, didNotFinish: false }).expect(200);
  assert.equal(resumed.body.book.didNotFinish, false);
});

test("wishlist books remain separate until marked as owned", async () => {
  const account = await register("wishlist@example.com");
  const wishlistBook = await request(app).post("/api/books").set("Authorization", `Bearer ${account.token}`).send({ title: "Wishlist title", isOwned: false }).expect(201);
  assert.equal(wishlistBook.body.book.isOwned, false);
  const ownedBook = await request(app).put(`/api/books/${wishlistBook.body.book.id}`).set("Authorization", `Bearer ${account.token}`).send({ ...wishlistBook.body.book, isOwned: true }).expect(200);
  assert.equal(ownedBook.body.book.isOwned, true);
});

test("removing a friend revokes friendship access for both accounts", async () => {
  const first = await register("remove-first@example.com");
  const second = await register("remove-second@example.com");
  await addFriend(first, second);
  await request(app).delete(`/api/friends/${second.user.id}`).set("Authorization", `Bearer ${first.token}`).expect(204);
  const firstList = await request(app).get("/api/friends").set("Authorization", `Bearer ${first.token}`).expect(200);
  const secondList = await request(app).get("/api/friends").set("Authorization", `Bearer ${second.token}`).expect(200);
  assert.deepEqual(firstList.body.friends, []);
  assert.deepEqual(secondList.body.friends, []);
  await request(app).get(`/api/friends/${second.user.id}/profile`).set("Authorization", `Bearer ${first.token}`).expect(403);
});

test("book clubs support multiple friends and restrict membership and deletion", async () => {
  const owner = await register("club-owner@example.com");
  const firstFriend = await register("club-first@example.com");
  const secondFriend = await register("club-second@example.com");
  const outsider = await register("club-outsider@example.com");
  await addFriend(owner, firstFriend);
  await addFriend(owner, secondFriend);
  await request(app).post("/api/book-clubs").set("Authorization", `Bearer ${owner.token}`).send({ name: "Invalid club", memberIds: [outsider.user.id] }).expect(400);
  const club = await request(app).post("/api/book-clubs").set("Authorization", `Bearer ${owner.token}`).send({ name: "Weekend Readers", memberIds: [firstFriend.user.id, secondFriend.user.id] }).expect(201);
  const clubs = await request(app).get("/api/book-clubs").set("Authorization", `Bearer ${firstFriend.token}`).expect(200);
  assert.equal(clubs.body.clubs[0].members.length, 3);
  await request(app).delete(`/api/book-clubs/${club.body.club.id}`).set("Authorization", `Bearer ${firstFriend.token}`).expect(404);
  await request(app).delete(`/api/book-clubs/${club.body.club.id}`).set("Authorization", `Bearer ${owner.token}`).expect(204);
});

test("book club members can use group chat while outsiders are denied", async () => {
  const owner = await register("group-owner@example.com");
  const member = await register("group-member@example.com");
  const outsider = await register("group-outsider@example.com");
  await addFriend(owner, member);
  const club = await request(app).post("/api/book-clubs").set("Authorization", `Bearer ${owner.token}`).send({ name: "Group chat club", memberIds: [member.user.id] }).expect(201);
  await request(app).post(`/api/book-clubs/${club.body.club.id}/messages`).set("Authorization", `Bearer ${member.token}`).send({ text: "Ready for chapter one?" }).expect(201);
  const messages = await request(app).get(`/api/book-clubs/${club.body.club.id}/messages`).set("Authorization", `Bearer ${owner.token}`).expect(200);
  assert.equal(messages.body.messages[0].fromEmail, member.user.email);
  await request(app).get(`/api/book-clubs/${club.body.club.id}/messages`).set("Authorization", `Bearer ${outsider.token}`).expect(403);
  await request(app).post(`/api/book-clubs/${club.body.club.id}/messages`).set("Authorization", `Bearer ${outsider.token}`).send({ text: "Let me in." }).expect(403);
});

test("book clubs support invitations, reading lists, discussions, progress, and leaving", async () => {
  const owner = await register("club-upgrade-owner@example.com");
  const member = await register("club-upgrade-member@example.com");
  await addFriend(owner, member);
  const club = await request(app).post("/api/book-clubs").set("Authorization", `Bearer ${owner.token}`).send({ name: "Reading Lab", memberIds: [] }).expect(400);
  assert.equal(club.status, 400);
  const created = await request(app).post("/api/book-clubs").set("Authorization", `Bearer ${owner.token}`).send({ name: "Reading Lab", memberIds: [member.user.id] }).expect(201);
  const book = await request(app).post("/api/books").set("Authorization", `Bearer ${owner.token}`).send({ title: "Club Pick" }).expect(201);
  await request(app).post(`/api/book-clubs/${created.body.club.id}/books`).set("Authorization", `Bearer ${owner.token}`).send({ bookId: book.body.book.id }).expect(201);
  await request(app).put(`/api/book-clubs/${created.body.club.id}/books/${book.body.book.id}/book-of-month`).set("Authorization", `Bearer ${owner.token}`).expect(200);
    await request(app).put(`/api/book-clubs/${created.body.club.id}/books/${book.body.book.id}/progress`).set("Authorization", `Bearer ${owner.token}`).send({ percent: 40 }).expect(200);
  await request(app).post(`/api/book-clubs/${created.body.club.id}/discussions`).set("Authorization", `Bearer ${owner.token}`).send({ text: "What did you think?" }).expect(201);
  await request(app).delete(`/api/book-clubs/${created.body.club.id}/membership`).set("Authorization", `Bearer ${member.token}`).expect(204);
});

test("message notifications include incoming direct and book-club messages", async () => {
  const owner = await register("notification-owner@example.com");
  const friend = await register("notification-friend@example.com");
  await addFriend(owner, friend);
  const club = await request(app).post("/api/book-clubs").set("Authorization", `Bearer ${owner.token}`).send({ name: "Notification club", memberIds: [friend.user.id] }).expect(201);
  const since = Date.now() - 1000;
  await request(app).post("/api/chat/messages").set("Authorization", `Bearer ${friend.token}`).send({ friendId: owner.user.id, text: "Direct hello" }).expect(201);
  await request(app).post(`/api/book-clubs/${club.body.club.id}/messages`).set("Authorization", `Bearer ${friend.token}`).send({ text: "Group hello" }).expect(201);
  const notifications = await request(app).get(`/api/chat/notifications?since=${since}`).set("Authorization", `Bearer ${owner.token}`).expect(200);
  assert.equal(notifications.body.count, 2);
});

test("recommendation dismissals are private and persist for the reader", async () => {
  const first = await register("dismiss-first@example.com");
  const second = await register("dismiss-second@example.com");
  await request(app).post("/api/recommendation-dismissals").set("Authorization", `Bearer ${first.token}`).send({ title: "Not for me", author: "Example Author" }).expect(201);
  const firstDismissals = await request(app).get("/api/recommendation-dismissals").set("Authorization", `Bearer ${first.token}`).expect(200);
  const secondDismissals = await request(app).get("/api/recommendation-dismissals").set("Authorization", `Bearer ${second.token}`).expect(200);
  assert.deepEqual(firstDismissals.body.keys, ["not for me::example author"]);
  assert.deepEqual(secondDismissals.body.keys, []);
});
