import {
	GENRE_OPTIONS,
	createId,
	state,
	refs,
	capitalizeGenreLabel,
	escapeHtml,
	friendLabel,
	formatChatTime,
	getAvatarUrl,
	getUploadedAssetUrl,
	avatarPlaceholder,
	SITE_BASE,
	LOGIN_PAGE
} from "./shared.js";

function renderGenreOptions(selectedGenre) {
	return GENRE_OPTIONS.map((genre) => {
		const selected = capitalizeGenreLabel(selectedGenre) === genre ? "selected" : "";
		return `<option value="${escapeHtml(genre)}" ${selected}>${escapeHtml(genre)}</option>`;
	}).join("");
}

function averageRating(books) {
	if (!books.length) {
		return 0;
	}
	const total = books.reduce((sum, book) => sum + Number(book.rating || 0), 0);
	return total / books.length;
}

function filteredBooks() {
	const books = state.filter === "all"
		? state.books.filter((book) => book.isOwned)
		: state.books.filter((book) => book.isOwned && readingStatus(book) === state.filter);
	const query = state.shelfQuery.toLowerCase();
	return books
		.filter((book) => state.genreFilter === "all" || book.genre === state.genreFilter)
		.filter((book) => state.tagFilter === "all" || (book.tags || []).includes(state.tagFilter))
		.filter((book) => !query || `${book.title} ${book.author} ${book.genre}`.toLowerCase().includes(query))
		.slice()
		.sort(sortBooks);
}

function readingStatus(book) {
	if (book.isRead || book.finishedAt) {
		return "finished";
	}
	if (book.didNotFinish) {
		return "dnf";
	}
	return book.startedAt ? "reading" : "want";
}

function sortBooks(left, right) {
	if (state.sort === "finished") {
		if (!left.finishedAt || !right.finishedAt) {
			return (right.finishedAt ? 1 : 0) - (left.finishedAt ? 1 : 0);
		}
		return String(right.finishedAt).localeCompare(String(left.finishedAt)) || Number(right.createdAt) - Number(left.createdAt);
	}
	if (state.sort === "finished-asc") {
		if (!left.finishedAt || !right.finishedAt) {
			return (right.finishedAt ? 1 : 0) - (left.finishedAt ? 1 : 0);
		}
		return String(left.finishedAt).localeCompare(String(right.finishedAt)) || Number(left.createdAt) - Number(right.createdAt);
	}
	if (state.sort === "title") {
		return String(left.title || "").localeCompare(String(right.title || ""));
	}
	if (state.sort === "rating") {
		return Number(right.rating) - Number(left.rating) || String(left.title || "").localeCompare(String(right.title || ""));
	}
	return Number(right.createdAt) - Number(left.createdAt);
}

function bookEditor(book) {
	const editorId = `book-editor-${book.id}`;
	const titleId = `edit-title-${book.id}`;
	const authorId = `edit-author-${book.id}`;
	const genreId = `edit-genre-${book.id}`;
	const ratingId = `edit-rating-${book.id}`;
	const yearId = `edit-year-${book.id}`;
	const startedAtId = `edit-started-at-${book.id}`;
	const finishedAtId = `edit-finished-at-${book.id}`;
	const pageCountId = `edit-page-count-${book.id}`;
	const currentPageId = `edit-current-page-${book.id}`;
	const notesId = `edit-notes-${book.id}`;
	const quoteId = `edit-quote-${book.id}`;
	const reviewId = `edit-review-${book.id}`;
	const tagsId = `edit-tags-${book.id}`;
	const seriesNameId = `edit-series-name-${book.id}`;
	const seriesPositionId = `edit-series-position-${book.id}`;
	const today = new Date().toLocaleDateString("en-CA");
	const checked = book.isRead ? "checked" : "";
	const ratingValue = Number.isFinite(Number(book.rating)) ? Number(book.rating).toFixed(2) : "1.00";

	return `
		<dialog id="${editorId}" class="app-dialog book-edit-dialog" data-book-edit-dialog="true">
			<div class="dialog-heading">
				<h2>Edit Book</h2>
				<button class="icon-btn" type="button" data-action="cancel-edit" data-id="${book.id}" aria-label="Close book editor" title="Close"><i data-lucide="x" aria-hidden="true"></i></button>
			</div>
			<form class="book-edit-form" data-book-edit-form="true" data-book-id="${book.id}" aria-labelledby="${editorId}">
				<p class="hint">Adjust the saved details below, then choose Save Changes.</p>
				<div class="form-grid">
					<div class="field full">
						<label for="${titleId}">Book title</label>
						<input id="${titleId}" name="title" required value="${escapeHtml(book.title || "")}" placeholder="Example: The Hobbit">
					</div>
					<div class="field">
						<label for="${authorId}">Author</label>
						<input id="${authorId}" name="author" value="${escapeHtml(book.author || "")}" placeholder="Example: J.R.R. Tolkien">
					</div>
					<div class="field">
						<label for="${genreId}">Genre</label>
						<select id="${genreId}" name="genre">
							${renderGenreOptions(book.genre)}
						</select>
					</div>
					${book.isRead ? `<div class="field">
						<label for="${ratingId}">Rating (1-5)</label>
						<input id="${ratingId}" name="rating" type="number" step="0.25" min="1" max="5" value="${ratingValue}" required>
					</div>` : '<input name="rating" type="hidden">'}
					<div class="field">
						<label for="${yearId}">Year (optional)</label>
						<input id="${yearId}" name="year" type="number" min="0" max="3000" value="${escapeHtml(String(book.year || ""))}" placeholder="2026">
					</div>
					<div class="field">
						<label for="${startedAtId}">Started on</label>
						<input id="${startedAtId}" name="startedAt" type="date" max="${today}" value="${escapeHtml(book.startedAt || "")}">
					</div>
					<div class="field">
						<label for="${finishedAtId}">Finished on</label>
						<input id="${finishedAtId}" name="finishedAt" type="date" max="${today}" value="${escapeHtml(book.finishedAt || "")}">
					</div>
					<div class="field">
						<label for="${pageCountId}">Total pages</label>
						<input id="${pageCountId}" name="pageCount" type="number" min="0" max="100000" value="${Number(book.pageCount) || ""}">
					</div>
					<div class="field">
						<label for="${currentPageId}">Current page</label>
						<input id="${currentPageId}" name="currentPage" type="number" min="0" max="100000" value="${Number(book.currentPage) || ""}">
					</div>
					<div class="field">
						<label for="${seriesNameId}">Series name (optional)</label>
						<input id="${seriesNameId}" name="seriesName" value="${escapeHtml(book.seriesName || "")}" placeholder="Example: Lord of the Rings">
					</div>
					<div class="field">
						<label for="${seriesPositionId}">Book number in series</label>
						<input id="${seriesPositionId}" name="seriesPosition" type="number" min="0" max="9999" value="${Number(book.seriesPosition) || ""}">
					</div>
					<div class="field full">
						<label for="${notesId}">Notes (private)</label>
						<textarea id="${notesId}" name="notes" rows="3" maxlength="4000">${escapeHtml(book.notes || "")}</textarea>
					</div>
					${book.isRead ? `<div class="field full">
						<label for="${reviewId}">Your review (visible to friends)</label>
						<textarea id="${reviewId}" name="review" rows="3" maxlength="4000">${escapeHtml(book.review || "")}</textarea>
					</div>` : ""}
					<div class="field full">
						<label for="${quoteId}">Favorite quote</label>
						<textarea id="${quoteId}" name="favoriteQuote" rows="2" maxlength="1000">${escapeHtml(book.favoriteQuote || "")}</textarea>
					</div>
					<div class="field full"><label for="${tagsId}">Tags</label><input id="${tagsId}" name="tags" value="${escapeHtml((book.tags || []).join(", "))}" placeholder="Book club, owned, comfort read"></div>
					<input name="coverUrl" type="hidden" value="${escapeHtml(book.coverUrl || "")}">
					<div class="field full">
						<div class="checkbox-row">
							<input id="${book.id}-read" name="isRead" type="checkbox" ${checked}>
							<label for="${book.id}-read">I have read this book</label>
						</div>
					</div>
				</div>
				<div class="btn-row">
					<button class="btn-main" type="submit">Save Changes</button>
					<button class="btn-sub" type="button" data-action="cancel-edit" data-id="${book.id}">Close</button>
				</div>
			</form>
		</dialog>
	`;
}

function bookCard(book) {
	const status = readingStatus(book);
	const statusLabels = { want: "Want to read", reading: "Reading", dnf: "Did not finish", finished: "Finished" };
	const author = book.author ? `by ${book.author}` : "No author added";
	const genre = book.genre ? `Genre: ${capitalizeGenreLabel(book.genre)}` : "Genre: Not set";
	const year = book.year ? `Year: ${book.year}` : "Year: -";
	const started = book.startedAt ? `Started: ${formatFinishedDate(book.startedAt)}` : "";
	const finished = book.isRead && book.finishedAt ? `Finished: ${formatFinishedDate(book.finishedAt)}` : "";
	const progress = Number(book.pageCount) > 0 ? Math.min(100, Math.round((Number(book.currentPage || 0) / Number(book.pageCount)) * 100)) : null;
	const series = book.seriesName && book.seriesPosition ? `Book ${book.seriesPosition} in ${book.seriesName}` : book.seriesName ? book.seriesName : "";

	return `
		<article class="book" data-id="${book.id}">
			${book.coverUrl ? `<img class="book-cover" src="${escapeHtml(getUploadedAssetUrl(book.coverUrl))}" alt="Cover of ${escapeHtml(book.title)}">` : '<div class="book-cover placeholder" aria-hidden="true">Book</div>'}
			<div>
				<h3>${escapeHtml(book.title)}</h3>
				<p>${escapeHtml(author)}</p>
				<div class="meta">
					<span class="pill status-${status}">${statusLabels[status]}</span>
					${book.isRead ? `<span class="pill">Rating: ${Number(book.rating).toFixed(2)} / 5</span>` : ""}
					<span class="pill">${escapeHtml(genre)}</span>
					<span class="pill">${escapeHtml(year)}</span>
					${series ? `<span class="pill series">${escapeHtml(series)}</span>` : ""}
					${started ? `<span class="pill">${escapeHtml(started)}</span>` : ""}
					${finished ? `<span class="pill finished">${escapeHtml(finished)}</span>` : ""}
					${(book.tags || []).map((tag) => `<span class="pill tag">${escapeHtml(tag)}</span>`).join("")}
					${book.recommendedBy ? `<span class="pill recommended-by">Recommended by: ${escapeHtml(book.recommendedBy)}</span>` : ""}
				</div>
				${status === "reading" && progress !== null ? `<div class="book-progress" aria-label="${progress}% read"><div style="width: ${progress}%"></div></div><p class="progress-label">${Number(book.currentPage || 0)} of ${Number(book.pageCount)} pages (${progress}%)</p>` : ""}
				${book.favoriteQuote ? `<blockquote class="book-quote">${escapeHtml(book.favoriteQuote)}</blockquote>` : ""}
			</div>
			<div class="book-actions">
				<details class="book-settings-menu">
					<summary class="icon-btn" aria-label="Book settings" title="Book settings"><i data-lucide="settings-2" aria-hidden="true"></i></summary>
					<button type="button" data-action="find-replacement" data-id="${book.id}">Find replacement</button>
				</details>
				<button class="btn-sub" data-action="details" data-id="${book.id}" type="button">Details</button>
				<button class="edit" data-action="edit" data-id="${book.id}" type="button">Edit</button>
				${status === "want" ? `<button class="toggle-read" data-action="start" data-id="${book.id}" type="button">Start reading</button>` : ""}
				${status === "reading" ? `<button class="toggle-read" data-action="finish" data-id="${book.id}" type="button">Finish book</button>` : ""}
				${status === "reading" ? `<button class="dnf" data-action="dnf" data-id="${book.id}" type="button">DNF</button>` : ""}
				${status === "dnf" ? `<button class="toggle-read" data-action="resume" data-id="${book.id}" type="button">Resume reading</button>` : ""}
				${status === "finished" ? `<button class="toggle-read" data-action="resume" data-id="${book.id}" type="button">Read again</button>` : ""}
				${state.friends.length ? `<button class="recommend" data-action="recommend" data-id="${book.id}" type="button">Recommend</button>` : ""}
				<button class="remove" data-action="delete" data-id="${book.id}" type="button">Delete</button>
			</div>
			${state.editingBookId === book.id ? bookEditor(book) : ""}
		</article>
	`;
}

export function renderAccountSummary() {
	if (!state.currentUser) {
		window.location.replace(LOGIN_PAGE);
		return;
	}

	refs.accountEmail.textContent = state.currentUser.username || state.currentUser.email;
	refs.accountNote.textContent = `${state.currentUser.email} · Your shelf is synced to your account.`;
	refs.profileAvatar.src = getAvatarUrl(state.currentUser);
	refs.profileAvatar.onerror = () => {
		refs.profileAvatar.onerror = null;
		refs.profileAvatar.src = avatarPlaceholder(state.currentUser ? state.currentUser.email : "Reader");
	};
	refs.logoutBtn.disabled = false;
	refs.logoutBtn.className = "icon-btn";
	refs.logoutBtn.innerHTML = '<i data-lucide="log-out" aria-hidden="true"></i>';
	refs.logoutBtn.setAttribute("aria-label", "Log out");
	refs.logoutBtn.title = "Log out";
	if (window.lucide) {
		window.lucide.createIcons({ nodes: [refs.logoutBtn] });
	}
	refs.settingsUsername.value = state.currentUser.username || "";
	refs.settingsEmail.value = state.currentUser.email;
	refs.settingsAvatar.value = "";
	refs.settingsAvatarName.textContent = "No image selected";
	refs.settingsPassword.value = "";
	refs.weeklySummaryEnabled.checked = Boolean(state.currentUser.weeklySummaryEnabled);
	refs.readingRemindersEnabled.checked = Boolean(state.currentUser.readingRemindersEnabled);
	refs.profileBooksVisible.checked = state.currentUser.profileBooksVisible !== false;
	refs.profileActivityVisible.checked = state.currentUser.profileActivityVisible !== false;
	refs.settingsStatus.textContent = "Update your email, password, or profile picture.";
	for (const element of refs.settingsForm.querySelectorAll("input, button")) {
		element.disabled = false;
	}
}

export function renderFriends() {
	if (!state.currentUser) {
		refs.friendsList.innerHTML = '<div class="chat-empty">Sign in to add friends and open a chat.</div>';
		refs.friendStatus.textContent = "Sign in to add friends.";
		return;
	}

	if (!state.friends.length && !state.incomingFriendRequests.length && !state.outgoingFriendRequests.length) {
		refs.friendsList.innerHTML = '<div class="chat-empty">No friends added yet. Add one by email above.</div>';
		refs.friendStatus.textContent = "No friends added yet.";
		return;
	}

	const incoming = state.incomingFriendRequests.map((friend) => `
		<div class="friend-item friend-request">
			<div class="friend-select"><span><span class="name">${escapeHtml(friendLabel(friend))}</span><span class="meta">Wants to be your friend</span></span></div>
			<button class="btn-sub" type="button" data-action="accept-friend" data-id="${friend.id}">Add back</button>
			<button class="icon-btn remove-friend" type="button" data-action="remove-friend" data-id="${friend.id}" aria-label="Decline ${escapeHtml(friendLabel(friend))}'s friend request" title="Decline request"><i data-lucide="user-x" aria-hidden="true"></i></button>
		</div>
	`).join("");
	const outgoing = state.outgoingFriendRequests.map((friend) => `
		<div class="friend-item friend-request">
			<div class="friend-select"><span><span class="name">${escapeHtml(friendLabel(friend))}</span><span class="meta">Waiting for them to add you back</span></span></div>
			<button class="icon-btn remove-friend" type="button" data-action="remove-friend" data-id="${friend.id}" aria-label="Cancel friend request to ${escapeHtml(friendLabel(friend))}" title="Cancel request"><i data-lucide="user-minus" aria-hidden="true"></i></button>
		</div>
	`).join("");
	refs.friendsList.innerHTML = incoming + outgoing + state.friends.map((friend) => `
		<div class="friend-item ${friend.id === state.activeFriendId ? "active" : ""}">
			<button class="friend-select" type="button" data-action="select-friend" data-id="${friend.id}">
			<span>
				<span class="name">${escapeHtml(friendLabel(friend))}</span>
				<span class="meta">${escapeHtml(friend.email)}</span>
			</span>
		</button>
			<button class="icon-btn view-friend-profile" type="button" data-action="view-friend-profile" data-id="${friend.id}" aria-label="View ${escapeHtml(friendLabel(friend))}'s profile" title="View profile"><i data-lucide="circle-user-round" aria-hidden="true"></i></button>
			<button class="icon-btn remove-friend" type="button" data-action="remove-friend" data-id="${friend.id}" aria-label="Remove ${escapeHtml(friendLabel(friend))} as a friend" title="Remove friend"><i data-lucide="user-minus" aria-hidden="true"></i></button>
		</div>
	`).join("");
	if (window.lucide) {
		window.lucide.createIcons({ nodes: [refs.friendsList] });
	}
	refs.friendStatus.textContent = `${state.friends.length} friend${state.friends.length === 1 ? "" : "s"} ready to chat${incoming || outgoing ? "; pending requests below." : "."}`;
}

export function renderChatMessages() {
	if (!state.currentUser) {
		refs.chatRoomTitle.textContent = "Choose a friend to start chatting.";
		refs.chatMessages.innerHTML = '<div class="chat-empty">Sign in to use chat.</div>';
		refs.chatStatus.textContent = "Sign in to send messages.";
		refs.chatText.disabled = true;
		return;
	}

	if (state.chatMode === "club") {
		const activeClub = state.bookClubs.find((club) => club.id === state.activeClubId);
		if (!activeClub) {
			refs.chatRoomTitle.textContent = "Choose a club to open its group chat.";
			refs.chatMessages.innerHTML = '<div class="chat-empty">Pick a book club from the list on the left.</div>';
			refs.chatStatus.textContent = "Choose a club before sending a message.";
			refs.chatText.disabled = true;
			return;
		}
		const activeRoom = (activeClub.rooms || []).find((room) => room.id === state.activeClubRoomId) || (activeClub.rooms || []).find((room) => room.slug === "lobby");
		refs.chatRoomTitle.textContent = `${activeClub.name}${activeRoom ? ` · ${activeRoom.name}` : " group chat"}`;
		refs.chatText.disabled = false;
		if (!state.chatMessages.length) {
			refs.chatMessages.innerHTML = '<div class="chat-empty">No messages in this room yet. Start the conversation.</div>';
			refs.chatStatus.textContent = state.chatLoadError || "This room is empty.";
			return;
		}
		refs.chatMessages.innerHTML = state.chatMessages.map((message) => {
			const mine = message.fromUserId === state.currentUser.id;
			return `<div class="chat-bubble ${mine ? "me" : "them"}"><div class="who">${escapeHtml(mine ? "You" : message.fromEmail || "Club member")}</div><div>${escapeHtml(message.text || "")}</div><div class="when">${escapeHtml(formatChatTime(message.createdAt))}</div></div>`;
		}).join("");
		refs.chatStatus.textContent = "Messages are visible to club members in this room.";
		return;
	}

	const activeFriend = state.friends.find((friend) => friend.id === state.activeFriendId);
	if (!activeFriend) {
		refs.chatRoomTitle.textContent = "Choose a friend to start chatting.";
		refs.chatMessages.innerHTML = '<div class="chat-empty">Pick a friend from the list on the left.</div>';
		refs.chatStatus.textContent = state.friends.length ? "Pick a friend to continue." : "Add a friend to begin chatting.";
		refs.chatText.disabled = true;
		return;
	}

	refs.chatRoomTitle.textContent = `Chatting with ${friendLabel(activeFriend)}`;
	refs.chatText.disabled = false;
	if (!state.chatMessages.length) {
		refs.chatMessages.innerHTML = '<div class="chat-empty">No messages yet. Say hello to start the thread.</div>';
		refs.chatStatus.textContent = state.chatLoadError || "Your conversation is empty.";
		return;
	}

	refs.chatMessages.innerHTML = state.chatMessages.map((message) => {
		const mine = message.fromUserId === state.currentUser.id;
		const sender = mine ? "You" : friendLabel(activeFriend);
		return `
			<div class="chat-bubble ${mine ? "me" : "them"}">
				<div class="who">${escapeHtml(sender)}</div>
				<div>${escapeHtml(message.text || "")}</div>
				<div class="when">${escapeHtml(formatChatTime(message.createdAt))}</div>
			</div>
		`;
	}).join("");
	refs.chatStatus.textContent = "Messages update when you send or switch friends.";
}

export function renderFriendsAndChat() {
	renderFriends();
	renderChatMessages();
}

export function renderBookClubs() {
	if (!state.currentUser) {
		refs.bookClubsList.innerHTML = '<div class="chat-empty">Sign in to create a book club.</div>';
		return;
	}
	if (!state.bookClubs.length) {
		refs.bookClubsList.innerHTML = '<div class="book-club-empty"><i data-lucide="book-open-check" aria-hidden="true"></i><strong>No club rooms yet</strong><span>Create a club with friends to open group chat and chapter discussion rooms.</span></div>';
	} else {
		refs.bookClubsList.innerHTML = state.bookClubs.map((club) => `
			<article class="book-club-card ${club.id === state.activeClubId ? "active" : ""}">
				<div class="book-club-heading"><div><span class="section-kicker">Book club</span><h3>${escapeHtml(club.name)}</h3><p>${club.members.length} member${club.members.length === 1 ? "" : "s"} in this room</p></div>${club.ownerId === state.currentUser.id ? `<button class="icon-btn remove-club" type="button" data-action="delete-club" data-id="${club.id}" aria-label="Delete ${escapeHtml(club.name)}" title="Delete club"><i data-lucide="trash-2" aria-hidden="true"></i></button>` : ""}</div>
				<div class="club-room-preview">${(club.rooms || []).slice(0, 4).map((room) => `<button type="button" data-action="open-club-chat" data-id="${club.id}" data-room-id="${room.id}"><span><i data-lucide="${escapeHtml(room.icon || "messages-square")}" aria-hidden="true"></i>${escapeHtml(room.name)}</span>${room.messageCount ? `<span class="club-room-count">${Number(room.messageCount) > 999 ? "999+" : Number(room.messageCount)}</span>` : ""}</button>`).join("")}</div>
				<div class="club-room-actions">
					<button class="club-chat-btn" type="button" data-action="open-club-chat" data-id="${club.id}" data-room-id="${club.id}:lobby"><i data-lucide="messages-square" aria-hidden="true"></i><span>Lobby chat</span></button>
					<button class="club-chat-btn chapter-room-btn" type="button" data-action="open-club-workspace" data-id="${club.id}"><i data-lucide="book-marked" aria-hidden="true"></i><span>Chapter rooms</span></button>
				</div>
				<div class="club-members" aria-label="${escapeHtml(club.name)} members">${club.members.map((member) => `<span>${escapeHtml(member.email)}</span>`).join("")}</div>
			</article>
		`).join("");
	}
	refs.clubInvitations.innerHTML = state.clubInvitations.map((invitation) => `<div class="club-invitation"><strong>${escapeHtml(invitation.name)}</strong><span>Invitation from ${escapeHtml(invitation.invitedByUsername || invitation.invitedByEmail)}</span><button class="btn-sub" type="button" data-action="accept-club-invitation" data-id="${invitation.clubId}">Join</button><button class="icon-btn" type="button" data-action="decline-club-invitation" data-id="${invitation.clubId}" aria-label="Decline ${escapeHtml(invitation.name)} invitation" title="Decline invitation"><i data-lucide="x" aria-hidden="true"></i></button></div>`).join("");
	if (window.lucide) {
		window.lucide.createIcons({ nodes: [refs.bookClubsList, refs.clubInvitations] });
	}
}

export function bookLikeButton(book) {
	const count = Number(book.likeCount || 0);
	const liked = Boolean(book.likedByMe);
	return `<button type="button" class="like-btn ${liked ? "liked" : ""}" data-action="toggle-book-like" data-book-id="${book.id}" aria-pressed="${liked}" aria-label="${liked ? "Unlike" : "Like"} ${escapeHtml(book.title)}"><i data-lucide="heart" aria-hidden="true"></i><span>${count}</span></button>`;
}

export function renderFriendProfile(profile) {
	if (!state.currentUser || !profile) {
		refs.friendProfile.innerHTML = "";
		return;
	}

	const completed = Number(profile.completed || 0);
	const goal = Number(profile.readingGoal || 12);
	const percentage = Math.min(100, Math.round((completed / goal) * 100));
	const currentBook = profile.currentBook;
	const finishes = Array.isArray(profile.recentFinishes) ? profile.recentFinishes : [];
	refs.friendProfile.innerHTML = `
		<div class="friend-profile-heading">
			<img src="${escapeHtml(getAvatarUrl(profile))}" alt="${escapeHtml(profile.email)}'s profile picture">
			<div><h2>${escapeHtml(profile.username || profile.email)}</h2><p>${escapeHtml(profile.email)} · ${completed} of ${goal} books finished this year</p></div>
		</div>
		<div class="friend-goal-bar" aria-label="${percentage}% of annual reading goal"><div style="width: ${percentage}%"></div></div>
		${currentBook ? `<section class="friend-reading"><h3>Currently Reading</h3><div class="friend-book-card">${currentBook.coverUrl ? `<img src="${escapeHtml(getUploadedAssetUrl(currentBook.coverUrl))}" alt="Cover of ${escapeHtml(currentBook.title)}">` : ""}<p><strong>${escapeHtml(currentBook.title)}</strong>${currentBook.author ? `<span>by ${escapeHtml(currentBook.author)}</span>` : ""}${Number(currentBook.pageCount) ? `<span>${Number(currentBook.currentPage || 0)} of ${Number(currentBook.pageCount)} pages</span>` : ""}</p>${bookLikeButton(currentBook)}</div></section>` : ""}
		${finishes.length ? `<section class="friend-finishes"><h3>Recently Finished</h3><ul>${finishes.map((book) => `<li class="friend-book-card"><strong>${escapeHtml(book.title)}</strong>${book.author ? ` by ${escapeHtml(book.author)}` : ""}${book.review ? `<p class="friend-review">${escapeHtml(book.review)}</p>` : ""}${bookLikeButton(book)}</li>`).join("")}</ul></section>` : ""}
	`;
	if (window.lucide) {
		window.lucide.createIcons({ nodes: [refs.friendProfile] });
	}
}

export function renderStats() {
	if (!state.currentUser) {
		refs.statOwned.textContent = "0";
		refs.statRead.textContent = "0";
		refs.statAverage.textContent = "0.00";
		refs.statTop.textContent = "-";
		refs.readProgress.style.width = "0%";
		refs.progressCopy.textContent = "Sign in to view your reading statistics.";
		refs.readingGoal.value = "12";
		refs.readingGoal.disabled = true;
		refs.readingGoalForm.querySelector("button").disabled = true;
		refs.readingGoalStatus.textContent = "Sign in to set a reading goal.";
		refs.goalProgress.style.width = "0%";
		refs.goalProgressCopy.textContent = "Sign in to track your annual goal.";
		refs.monthlyHistory.innerHTML = '<div class="history-empty">Sign in to view your reading history.</div>';
		return;
	}

	const ownedBooks = state.books.filter((book) => book.isOwned);
	const owned = ownedBooks.length;
	const allRead = ownedBooks.filter((book) => book.isRead);
	const currentYear = new Date().getFullYear();
	const read = allRead.filter((book) => String(book.finishedAt || "").startsWith(`${currentYear}-`));
	const top = read.slice().sort((left, right) => Number(right.rating) - Number(left.rating))[0];
	const avg = averageRating(read);
	const percent = owned ? Math.round((allRead.length / owned) * 100) : 0;
	const goal = Number.isInteger(Number(state.currentUser.readingGoal)) && Number(state.currentUser.readingGoal) > 0
		? Number(state.currentUser.readingGoal)
		: 12;
	const goalPercent = Math.min(100, Math.round((read.length / goal) * 100));

	refs.statOwned.textContent = owned;
	refs.statRead.textContent = read.length;
	refs.statAverage.textContent = avg.toFixed(2);
	refs.statTop.textContent = top ? `${top.title} (${Number(top.rating).toFixed(2)})` : "-";
	refs.readProgress.style.width = `${percent}%`;
	refs.progressCopy.textContent = `Shelf completion: ${percent}% of owned books are finished.`;
	refs.readingGoal.value = String(goal);
	refs.readingGoal.disabled = false;
	refs.readingGoalForm.querySelector("button").disabled = false;
	refs.readingGoalStatus.textContent = "Set the number of books you want to finish this year.";
	refs.goalProgress.style.width = `${goalPercent}%`;
	refs.goalProgressCopy.textContent = `${read.length} of ${goal} books completed (${goalPercent}%).`;
	renderMonthlyHistory(read, currentYear);
	renderInsights(read, currentYear);
}

function renderInsights(yearReadBooks, currentYear) {
	const scope = state.selectedInsightMonth && state.selectedInsightMonth.year === currentYear ? state.selectedInsightMonth : null;
	const scopedBooks = scope
		? yearReadBooks.filter((book) => Number(String(book.finishedAt).slice(5, 7)) - 1 === scope.month)
		: yearReadBooks;

	const completedGenres = new Map();
	let pagesRead = 0;
	for (const book of scopedBooks) {
		const genre = book.genre || "Uncategorized";
		completedGenres.set(genre, (completedGenres.get(genre) || 0) + 1);
		pagesRead += Number(book.pageCount || 0);
	}
	const booksWithPages = scopedBooks.filter((book) => Number(book.pageCount) > 0);
	const averageRating = scopedBooks.length
		? scopedBooks.reduce((total, book) => total + Number(book.rating || 0), 0) / scopedBooks.length
		: 0;
	const averagePages = booksWithPages.length
		? Math.round(booksWithPages.reduce((total, book) => total + Number(book.pageCount), 0) / booksWithPages.length)
		: 0;
	const topGenre = [...completedGenres.entries()].sort((left, right) => right[1] - left[1])[0];
	refs.insightsList.innerHTML = `<div><span>Most read genre</span><strong>${escapeHtml(topGenre ? topGenre[0] : "-")}</strong></div><div><span>Average rating</span><strong>${averageRating ? averageRating.toFixed(2) : "-"}</strong></div><div><span>Pages read</span><strong>${pagesRead}</strong></div><div><span>Average pages per finished book</span><strong>${averagePages || "-"}</strong></div>`;

	if (refs.insightsScope) {
		if (scope) {
			const monthLabel = new Intl.DateTimeFormat(undefined, { month: "long" }).format(new Date(scope.year, scope.month, 1));
			refs.insightsScope.firstChild.textContent = `Showing ${monthLabel} ${scope.year}. `;
			refs.clearInsightsMonth.hidden = false;
		} else {
			refs.insightsScope.firstChild.textContent = "Showing the full year. ";
			refs.clearInsightsMonth.hidden = true;
		}
	}
}

export function formatFinishedDate(value) {
	const [year, month, day] = String(value || "").split("-").map(Number);
	if (!year || !month || !day) {
		return "";
	}
	return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(year, month - 1, day));
}

function renderMonthlyHistory(readBooks, currentYear) {
	const monthCounts = Array.from({ length: 12 }, () => 0);
	for (const book of readBooks) {
		const month = Number(String(book.finishedAt).slice(5, 7)) - 1;
		if (month >= 0 && month < 12) {
			monthCounts[month] += 1;
		}
	}

	if (!readBooks.length) {
		refs.monthlyHistory.innerHTML = `<div class="history-empty">No books finished in ${currentYear} yet.</div>`;
		return;
	}

	const monthNames = Array.from({ length: 12 }, (_, month) => new Intl.DateTimeFormat(undefined, { month: "short" }).format(new Date(currentYear, month, 1)));
	refs.monthlyHistory.innerHTML = monthNames.map((month, index) => `
		<button type="button" class="month-count ${monthCounts[index] ? "has-books" : ""} ${state.selectedInsightMonth?.year === currentYear && state.selectedInsightMonth?.month === index ? "selected" : ""}" data-month="${index}" data-year="${currentYear}" aria-pressed="${state.selectedInsightMonth?.year === currentYear && state.selectedInsightMonth?.month === index}" ${monthCounts[index] ? "" : "disabled"}>
			<span>${escapeHtml(month)}</span>
			<strong>${monthCounts[index]}</strong>
		</button>
	`).join("");
}

export function renderBooks() {
	const ownedBooks = state.books.filter((book) => book.isOwned);
	const genres = [...new Set(ownedBooks.map((book) => book.genre).filter(Boolean))].sort();
	const tags = [...new Set(ownedBooks.flatMap((book) => book.tags || []))].sort();
	if (state.genreFilter !== "all" && !genres.includes(state.genreFilter)) {
		state.genreFilter = "all";
	}
	if (state.tagFilter !== "all" && !tags.includes(state.tagFilter)) {
		state.tagFilter = "all";
	}
	refs.genreFilter.innerHTML = `<option value="all">All genres</option>${genres.map((genre) => `<option value="${escapeHtml(genre)}" ${genre === state.genreFilter ? "selected" : ""}>${escapeHtml(genre)}</option>`).join("")}`;
	refs.tagFilter.innerHTML = `<option value="all">All tags</option>${tags.map((tag) => `<option value="${escapeHtml(tag)}" ${tag === state.tagFilter ? "selected" : ""}>${escapeHtml(tag)}</option>`).join("")}`;
	if (!state.currentUser) {
		refs.books.innerHTML = '<div class="empty">Sign in to view and manage your shelf.</div>';
		return;
	}

	const books = filteredBooks();
	if (!books.length) {
		refs.books.innerHTML = '<div class="empty">No books to show yet. Add your first one above.</div>';
		return;
	}

	refs.books.innerHTML = books
		.map(bookCard)
		.join("");
	if (window.lucide) {
		window.lucide.createIcons({ nodes: [refs.books] });
	}
}

export function renderNowReading() {
	if (!state.currentUser) {
		refs.nowReadingList.innerHTML = '<div class="empty">Sign in to see your current books.</div>';
		return;
	}

	const activeBooks = state.books
		.filter((book) => book.isOwned && !book.isRead && book.startedAt)
		.sort((left, right) => String(right.startedAt).localeCompare(String(left.startedAt)));
	if (!activeBooks.length) {
		refs.nowReadingList.innerHTML = '<div class="empty">Start a book from your shelf to see it here.</div>';
		return;
	}

	refs.nowReadingList.innerHTML = activeBooks.map((book) => {
		const pageCount = Number(book.pageCount || 0);
		const currentPage = Math.min(pageCount, Number(book.currentPage || 0));
		const progress = pageCount ? Math.round((currentPage / pageCount) * 100) : 0;
		return `
			<article class="now-reading-card" data-id="${book.id}">
				${book.coverUrl ? `<img class="now-reading-cover" src="${escapeHtml(getUploadedAssetUrl(book.coverUrl))}" alt="Cover of ${escapeHtml(book.title)}">` : '<div class="now-reading-cover placeholder" aria-hidden="true">Book</div>'}
				<div>
					<h3>${escapeHtml(book.title)}</h3>
					<p>${escapeHtml(book.author ? `by ${book.author}` : "No author added")}</p>
					${pageCount ? `<div class="book-progress" aria-label="${progress}% read"><div style="width: ${progress}%"></div></div><p class="progress-label">${currentPage} of ${pageCount} pages (${progress}%)</p>` : '<p class="progress-label">Add a page total in Edit Book to track progress.</p>'}
					<div class="now-reading-actions">
						${pageCount ? `<button class="toggle-read" type="button" data-action="add-pages" data-id="${book.id}">+10 pages</button>` : ""}
						<button class="btn-main" type="button" data-action="finish-book" data-id="${book.id}">Finish book</button>
					</div>
				</div>
			</article>
		`;
	}).join("");
}

export function renderWishlist() {
	if (!state.currentUser) {
		refs.wishlistList.innerHTML = '<div class="empty">Sign in to see your wishlist.</div>';
		return;
	}

	const wishlistBooks = state.books
		.filter((book) => !book.isOwned)
		.sort((left, right) => Number(right.createdAt) - Number(left.createdAt));
	if (!wishlistBooks.length) {
		refs.wishlistList.innerHTML = '<div class="empty">Search for a book and uncheck “I own this book” to add it here.</div>';
		return;
	}

	refs.wishlistList.innerHTML = wishlistBooks.map((book) => `
		<article class="wishlist-card" data-id="${book.id}">
			${book.coverUrl ? `<img src="${escapeHtml(getUploadedAssetUrl(book.coverUrl))}" alt="Cover of ${escapeHtml(book.title)}">` : '<div class="wishlist-cover placeholder" aria-hidden="true">Book</div>'}
			<div>
				<h3>${escapeHtml(book.title)}</h3>
				<p>${escapeHtml(book.author ? `by ${book.author}` : "No author added")}</p>
				${book.recommendedBy ? `<p class="pill recommended-by">Recommended by: ${escapeHtml(book.recommendedBy)}</p>` : ""}
				<div class="wishlist-actions">
					<button class="toggle-read" type="button" data-action="own" data-id="${book.id}">I own this now</button>
					<button class="remove" type="button" data-action="delete" data-id="${book.id}">Remove</button>
				</div>
			</div>
		</article>
	`).join("");
}

export function rerender() {
	renderStats();
	renderNowReading();
	renderWishlist();
	renderBooks();
	renderBookClubs();
	renderFriendsAndChat();
}

export function resetBookForm() {
	refs.form.reset();
	refs.rating.value = "2.5";
	refs.genre.value = "Fantasy";
	refs.finishedAt.value = "";
	refs.startedAt.value = "";
	refs.coverUrl.value = "";
	refs.bookCoverUpload.value = "";
	refs.bookCoverUploadName.textContent = "No image selected";
}

export function toBook(formData, existingBook) {
	const rawRating = Number(formData.get("rating"));
	const rating = Number.isFinite(rawRating) ? Math.min(5, Math.max(1, rawRating)) : 2.5;
	const rawYear = Number(formData.get("year"));
	const isRead = Boolean(formData.get("isRead"));
	const rawSeriesPosition = Number(formData.get("seriesPosition"));
	const pageCount = Number(formData.get("pageCount") || 0);
	const enteredCurrentPage = Number(formData.get("currentPage") || 0);
	// Finishing a book should fill the progress bar even if the current page wasn't updated by hand.
	const currentPage = isRead && pageCount > 0 ? pageCount : enteredCurrentPage;

	return {
		id: existingBook ? existingBook.id : createId(),
		title: String(formData.get("title") || "").trim(),
		author: String(formData.get("author") || "").trim(),
		genre: capitalizeGenreLabel(formData.get("genre")),
		rating,
		year: Number.isFinite(rawYear) && rawYear > 0 ? rawYear : "",
		isRead,
		didNotFinish: existingBook ? Boolean(existingBook.didNotFinish) : false,
		startedAt: String(formData.get("startedAt") || ""),
		finishedAt: isRead ? String(formData.get("finishedAt") || new Date().toLocaleDateString("en-CA")) : "",
		pageCount,
		currentPage,
		notes: String(formData.get("notes") || "").trim(),
		favoriteQuote: String(formData.get("favoriteQuote") || "").trim(),
		review: formData.has("review") ? String(formData.get("review") || "").trim() : existingBook?.review || "",
		tags: String(formData.get("tags") || "").split(",").map((tag) => tag.trim()).filter(Boolean),
		coverUrl: String(formData.get("coverUrl") || "").trim(),
		seriesName: String(formData.get("seriesName") || "").trim(),
		seriesPosition: Number.isFinite(rawSeriesPosition) && rawSeriesPosition > 0 ? rawSeriesPosition : 0,
		createdAt: existingBook ? existingBook.createdAt : Date.now(),
		userId: existingBook ? existingBook.userId : state.currentUser?.id || ""
	};
}
