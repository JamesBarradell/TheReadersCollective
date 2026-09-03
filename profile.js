import { API_BASE, getAvatarUrl, getUploadedAssetUrl, loadAuthToken, state, escapeHtml, capitalizeGenreLabel } from "./app/shared.js";

const content = document.getElementById("reader-profile-content");

function formatDate(value) {
	if (!value) return "";
	const parsed = new Date(`${value}T12:00:00`);
	return Number.isNaN(parsed.getTime()) ? "" : new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(parsed);
}

function likeButton(book, readOnly) {
	const count = Number(book.likeCount || 0);
	const liked = Boolean(book.likedByMe);
	if (readOnly) {
		return `<span class="like-btn like-btn-static" aria-label="${count} like${count === 1 ? "" : "s"}"><i data-lucide="heart" aria-hidden="true"></i><span>${count}</span></span>`;
	}
	return `<button type="button" class="like-btn ${liked ? "liked" : ""}" data-book-id="${book.id}" aria-pressed="${liked}" aria-label="${liked ? "Unlike" : "Like"} ${escapeHtml(book.title)}"><i data-lucide="heart" aria-hidden="true"></i><span>${count}</span></button>`;
}

function renderBook(book, isSelf) {
	const progress = Number(book.pageCount) > 0 ? Math.round((Number(book.currentPage || 0) / Number(book.pageCount)) * 100) : null;
	const status = book.finishedAt ? "Finished" : book.startedAt ? "Reading" : "On shelf";
	return `
		<article class="reader-profile-book">
			${book.coverUrl ? `<img src="${escapeHtml(getUploadedAssetUrl(book.coverUrl))}" alt="Cover of ${escapeHtml(book.title)}">` : '<div class="reader-profile-cover placeholder" aria-hidden="true">Book</div>'}
			<div>
				<h3>${escapeHtml(book.title)}</h3>
				<p>${escapeHtml(book.author || "Unknown author")}</p>
				<div class="meta"><span class="pill">${status}</span>${book.genre ? `<span class="pill">${escapeHtml(capitalizeGenreLabel(book.genre))}</span>` : ""}${book.year ? `<span class="pill">${escapeHtml(String(book.year))}</span>` : ""}</div>
				${progress !== null && !book.finishedAt ? `<div class="reader-profile-progress" aria-label="${progress}% read"><div style="width:${progress}%"></div></div>` : ""}
				${book.review ? `<p class="reader-profile-review">${escapeHtml(book.review)}</p>` : ""}
			</div>
			${likeButton(book, isSelf)}
		</article>`;
}

function renderProfile(profile) {
	const goal = Math.max(1, Number(profile.readingGoal) || 12);
	const progress = Math.min(100, Math.round((Number(profile.finishedCount) / goal) * 100));
	const isSelf = Boolean(profile.isSelf);
	content.innerHTML = `
		${isSelf ? '<p class="reader-profile-preview-banner">This is a preview of your public profile, exactly as friends see it.</p>' : ""}
		<section class="reader-profile-hero">
			<img src="${escapeHtml(getAvatarUrl(profile))}" alt="${escapeHtml(profile.email)}'s profile picture">
			<div>
				<p class="reader-profile-eyebrow">Reader profile</p>
				<h1>${escapeHtml(profile.username || profile.email)}</h1>
				<p class="reader-profile-email">${escapeHtml(profile.email)}</p>
				<p>${profile.finishedCount} of ${goal} books finished this year</p>
			</div>
		</section>
		<section class="reader-profile-stats" aria-label="Reading statistics">
			<div><strong>${profile.bookCount}</strong><span>Books on shelf</span></div>
			<div><strong>${profile.finishedCount}</strong><span>Books finished</span></div>
			<div><strong>${progress}%</strong><span>Reading goal</span></div>
		</section>
		<section class="reader-profile-goal" aria-label="${progress}% of annual reading goal"><div style="width:${progress}%"></div></section>
		${profile.currentBook ? `<section class="reader-profile-section"><h2>Currently Reading</h2>${renderBook(profile.currentBook, isSelf)}</section>` : ""}
		<section class="reader-profile-section"><h2>Bookshelf</h2><div class="reader-profile-books">${profile.booksVisible === false ? '<p class="profile-empty">This reader keeps their bookshelf private.</p>' : profile.books.length ? profile.books.map((book) => renderBook(book, isSelf)).join("") : '<p class="profile-empty">No books shared yet.</p>'}</div></section>
		${profile.recentFinishes.length ? `<section class="reader-profile-section"><h2>Recently Finished</h2><ul class="reader-profile-finishes">${profile.recentFinishes.map((book) => `<li class="reader-profile-finish-card"><strong>${escapeHtml(book.title)}</strong>${book.author ? ` by ${escapeHtml(book.author)}` : ""}${book.finishedAt ? ` <span>${escapeHtml(formatDate(book.finishedAt))}</span>` : ""}${book.review ? `<p class="reader-profile-review">${escapeHtml(book.review)}</p>` : ""}${likeButton(book, isSelf)}</li>`).join("")}</ul></section>` : ""}`;
	if (window.lucide) window.lucide.createIcons();
}

async function loadProfile() {
	loadAuthToken();
	const friendId = new URLSearchParams(window.location.search).get("friendId");
	if (!state.authToken || !friendId) {
		content.innerHTML = '<p class="profile-empty">Sign in through The Readers Collective and open a friend profile from Community.</p>';
		return;
	}
	try {
		const response = await fetch(`${API_BASE}/friends/${encodeURIComponent(friendId)}/reader-profile`, { headers: { Authorization: `Bearer ${state.authToken}` } });
		const payload = await response.json().catch(() => null);
		if (!response.ok) throw new Error(payload?.message || "Unable to load this reader profile.");
		renderProfile(payload.profile);
	} catch (error) {
		content.innerHTML = `<p class="profile-empty">${escapeHtml(error instanceof Error ? error.message : "Unable to load this reader profile.")}</p>`;
	}
}

if (window.lucide) window.lucide.createIcons();
loadProfile();

content.addEventListener("click", (event) => {
	const button = event.target.closest("button[data-book-id]");
	if (!button) return;
	const bookId = button.dataset.bookId;
	button.disabled = true;
	(async () => {
		try {
			const response = await fetch(`${API_BASE}/books/${encodeURIComponent(bookId)}/like`, {
				method: "POST",
				headers: { Authorization: `Bearer ${state.authToken}` }
			});
			if (!response.ok) throw new Error();
			await loadProfile();
		} catch {
			button.disabled = false;
		}
	})();
});
