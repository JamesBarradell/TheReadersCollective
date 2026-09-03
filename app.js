import {
	AUTH_MESSAGE_STORAGE_KEY,
	API_BASE,
	SITE_BASE,
	LOGIN_PAGE,
	state,
	refs,
	normalizeEmail,
	validEmail,
	saveAuthToken,
	loadAuthToken,
	apiRequest,
	showNotice,
	escapeHtml
} from "./app/shared.js";
import {
	renderAccountSummary,
	renderBookClubs,
	renderFriendsAndChat,
	renderFriendProfile,
	rerender,
	resetBookForm,
	toBook
} from "./app/renderers.js";
import {
	runSearch,
	scheduleTypeaheadSearch,
	applySearchResult,
	applyShelfRecommendation,
	removeShelfRecommendation,
	showShelfRecommendationInfo,
	refreshShelfRecommendations,
	clearSearchUi
} from "./app/search.js";
import {
	renderBookshelf,
	renderTrinketTray,
	loadBookshelfExtras,
	resetBookshelfLayout,
	initBookcaseColorPicker,
	setBookcaseColor,
	toggleTrinketVisibility
} from "./app/bookshelf.js";

const CHAT_REFRESH_INTERVAL_MS = 5000;
const ACTIVE_VIEW_STORAGE_KEY = "readers-corner-active-view";
let chatRefreshTimerId = null;
let isRefreshingChat = false;
let messageNotificationCursor = Date.now();

function setAppLockState(isLocked) {
	for (const element of refs.form.querySelectorAll("input, button")) {
		element.disabled = isLocked;
	}
	for (const element of refs.friendForm.querySelectorAll("input, button, textarea")) {
		element.disabled = isLocked;
	}
	for (const element of refs.chatForm.querySelectorAll("input, button, textarea")) {
		element.disabled = isLocked;
	}
	for (const element of refs.readingGoalForm.querySelectorAll("input, button")) {
		element.disabled = isLocked;
	}
	refs.searchInput.disabled = isLocked;
	refs.statusTabs.querySelectorAll("button").forEach((button) => {
		button.disabled = isLocked;
	});
	refs.sortView.disabled = isLocked;
	refs.shelfMenuBtn.disabled = isLocked;
	refs.settingsBtn.disabled = isLocked;
	refs.viewMyProfileBtn.disabled = isLocked;
	refs.openFriendDialog.disabled = isLocked;
	refs.downloadJson.disabled = isLocked;
	refs.downloadCsv.disabled = isLocked;
	refs.libraryImportFile.disabled = isLocked;
	refs.importLibrary.disabled = isLocked || !refs.libraryImportFile.files?.length;
	refs.tagFilter.disabled = isLocked;
	refs.downloadShareCard.disabled = isLocked;
	refs.refreshRecommendations.disabled = isLocked;
	if (isLocked) {
		clearSearchUi("Sign in to search and add books.");
	}
}

function setCurrentUser(user) {
	state.currentUser = user;
	setAppLockState(!state.currentUser);
	renderAccountSummary();
	rerender();
}

function setSession(token, user) {
	state.authToken = token;
	saveAuthToken();
	setCurrentUser(user);
}

function todayIsoDate() {
	return new Date().toLocaleDateString("en-CA");
}

function refreshActiveChat() {
	if (document.hidden || isRefreshingChat || !state.currentUser) {
		return;
	}

	isRefreshingChat = true;
	const refresh = state.chatMode === "club"
		? state.activeClubId && loadClubMessages(state.activeClubId)
		: state.activeFriendId && loadChatMessages(state.activeFriendId);
	Promise.resolve(refresh).finally(() => {
		isRefreshingChat = false;
	});
}

function renderMessageNotification() {
	const count = state.unreadMessageCount;
	refs.communityMessageCount.hidden = count === 0;
	refs.communityMessageCount.textContent = count > 99 ? "99+" : String(count);
	refs.communityMessageCount.setAttribute("aria-label", `${count} new message${count === 1 ? "" : "s"}`);
}

function renderFriendRequestNotification() {
	const count = state.incomingFriendRequests.length;
	refs.communityRequestCount.hidden = count === 0;
	refs.communityRequestCount.textContent = count > 99 ? "99+" : String(count);
	refs.communityRequestCount.setAttribute("aria-label", `${count} friend request${count === 1 ? "" : "s"}`);
}

async function refreshMessageNotifications() {
	if (document.hidden || !state.currentUser) {
		return;
	}

	const cursor = messageNotificationCursor;
	try {
		const response = await apiRequest(`/chat/notifications?since=${encodeURIComponent(cursor)}`, { method: "GET" });
		messageNotificationCursor = Date.now();
		state.unreadMessageCount += Number(response && response.count) || 0;
		renderMessageNotification();
	} catch {
		// A notification failure should not disrupt chat or other app activity.
	}
}

function startChatRefresh() {
	if (chatRefreshTimerId === null) {
		chatRefreshTimerId = window.setInterval(() => {
			refreshActiveChat();
			refreshMessageNotifications();
		}, CHAT_REFRESH_INTERVAL_MS);
	}
}

function stopChatRefresh() {
	if (chatRefreshTimerId !== null) {
		window.clearInterval(chatRefreshTimerId);
		chatRefreshTimerId = null;
	}
}

document.addEventListener("visibilitychange", () => {
	if (!document.hidden) {
		refreshActiveChat();
		refreshMessageNotifications();
	}
});

function openFinishRatingDialog(bookId) {
	const book = state.books.find((entry) => entry.id === bookId);
	if (!book) return;
	state.finishRatingBookId = bookId;
	refs.finishRatingTitle.textContent = `${book.title}${book.author ? ` by ${book.author}` : ""}`;
	refs.finishRating.value = "2.5";
	refs.finishRatingReview.value = book.review || "";
	refs.finishRatingStatus.textContent = "";
	refs.finishRatingDialog.showModal();
}

function renderMetadataCandidates() {
	refs.metadataPickerResults.innerHTML = "";
	for (const candidate of state.metadataCandidates) {
		const button = document.createElement("button");
		button.type = "button";
		button.className = "metadata-picker-option";
		button.dataset.metadataKey = candidate.key;
		if (candidate.coverUrl) {
			const cover = document.createElement("img");
			cover.src = candidate.coverUrl;
			cover.alt = "";
			button.append(cover);
		} else {
			const cover = document.createElement("div");
			cover.className = "metadata-picker-cover";
			cover.setAttribute("aria-hidden", "true");
			button.append(cover);
		}
		const copy = document.createElement("span");
		const title = document.createElement("strong");
		title.textContent = candidate.title;
		const details = document.createElement("small");
		details.textContent = [candidate.author || "Unknown author", candidate.year || "Unknown year", candidate.genre || "Unknown genre", candidate.pageCount ? `${candidate.pageCount} pages` : ""].filter(Boolean).join(" | ");
		copy.append(title, details);
		button.append(copy);
		refs.metadataPickerResults.append(button);
	}
}

async function openMetadataPicker(book) {
	state.metadataPickerBookId = book.id;
	state.metadataCandidates = [];
	refs.metadataPickerTitle.textContent = `Find replacement for ${book.title}`;
	refs.metadataPickerStatus.textContent = "Finding matching records...";
	renderMetadataCandidates();
	refs.metadataPickerDialog.showModal();
	try {
		const response = await apiRequest(`/books/${encodeURIComponent(book.id)}/metadata/candidates`, { method: "GET" });
		if (state.metadataPickerBookId !== book.id) return;
		state.metadataCandidates = response && Array.isArray(response.candidates) ? response.candidates : [];
		renderMetadataCandidates();
		refs.metadataPickerStatus.textContent = state.metadataCandidates.length ? "Choose the record that matches your book." : "No matching records were found.";
	} catch (error) {
		refs.metadataPickerStatus.textContent = error instanceof Error ? error.message : "Unable to find matching records right now.";
	}
}

refs.finishedAt.max = todayIsoDate();
refs.startedAt.max = todayIsoDate();
refs.searchBookStartedAt.max = todayIsoDate();
refs.searchBookFinishedAt.max = todayIsoDate();

if (window.lucide) {
	window.lucide.createIcons();
}

async function loadChatMessages(friendId) {
	const activeFriendId = String(friendId || state.activeFriendId || "").trim();
	if (!state.currentUser || !activeFriendId) {
		state.chatMessages = [];
		state.chatLoadError = "";
		renderFriendsAndChat();
		return;
	}

	try {
		const response = await apiRequest(`/chat/messages?friendId=${encodeURIComponent(activeFriendId)}`, { method: "GET" });
		if (state.chatMode !== "direct" || state.activeFriendId !== activeFriendId) {
			return;
		}
		state.chatMessages = response && Array.isArray(response.messages) ? response.messages : [];
		state.chatLoadError = "";
	} catch (error) {
		state.chatMessages = [];
		state.chatLoadError = error instanceof Error ? error.message : "Unable to load this conversation.";
	}
	renderFriendsAndChat();
}

async function loadClubMessages(clubId) {
	if (!state.currentUser || !clubId) {
		state.chatMessages = [];
		state.chatLoadError = "";
		renderFriendsAndChat();
		return;
	}
	try {
		const response = await apiRequest(`/book-clubs/${encodeURIComponent(clubId)}/messages`, { method: "GET" });
		if (state.chatMode !== "club" || state.activeClubId !== clubId) {
			return;
		}
		state.chatMessages = response && Array.isArray(response.messages) ? response.messages : [];
		state.chatLoadError = "";
	} catch (error) {
		state.chatMessages = [];
		state.chatLoadError = error instanceof Error ? error.message : "Unable to load this group chat.";
	}
	renderFriendsAndChat();
}

async function loadFriendProfile(friendId) {
	if (!state.currentUser || !friendId) {
		renderFriendProfile(null);
		return;
	}

	try {
		const response = await apiRequest(`/friends/${encodeURIComponent(friendId)}/profile`, { method: "GET" });
		renderFriendProfile(response ? response.profile : null);
	} catch {
		renderFriendProfile(null);
	}
}

refs.friendProfile.addEventListener("click", (event) => {
	const button = event.target.closest("button[data-action='toggle-book-like']");
	if (!button || !state.currentUser) {
		return;
	}
	const bookId = button.dataset.bookId;
	if (!bookId) {
		return;
	}
	button.disabled = true;
	(async () => {
		try {
			await apiRequest(`/books/${encodeURIComponent(bookId)}/like`, { method: "POST" });
			await loadFriendProfile(state.activeFriendId);
		} catch (error) {
			showNotice(error instanceof Error ? error.message : "Unable to like this book right now.");
		} finally {
			button.disabled = false;
		}
	})();
});

function setActiveFriend(friendId) {
	state.chatMode = "direct";
	state.activeFriendId = friendId || "";
	state.activeClubId = "";
	state.chatMessages = [];
	state.chatLoadError = "";
	state.unreadMessageCount = 0;
	renderFriendsAndChat();
	if (state.activeFriendId) {
		loadChatMessages(state.activeFriendId);
		loadFriendProfile(state.activeFriendId);
		startChatRefresh();
	} else {
		renderFriendProfile(null);
		stopChatRefresh();
	}
}

function setActiveClub(clubId) {
	state.chatMode = "club";
	state.activeClubId = clubId || "";
	state.activeFriendId = "";
	state.chatMessages = [];
	state.chatLoadError = "";
	renderFriendProfile(null);
	renderFriendsAndChat();
	if (state.activeClubId) {
		loadClubMessages(state.activeClubId);
		startChatRefresh();
	} else {
		stopChatRefresh();
	}
}

async function loadBooksFromApi() {
	if (!state.currentUser) {
		state.books = [];
		rerender();
		return;
	}

	const response = await apiRequest("/books", { method: "GET" });
	state.books = response && Array.isArray(response.books) ? response.books : [];
	const dismissals = await apiRequest("/recommendation-dismissals", { method: "GET" });
	state.dismissedRecommendationKeys = dismissals && Array.isArray(dismissals.keys) ? dismissals.keys : [];
	rerender();
	await addMissingBookCovers();
	await refreshShelfRecommendations();
}

async function addMissingBookCovers() {
	const booksWithoutCovers = state.books.filter((book) => (!book.coverUrl || /(?:goodreads|gr-assets)\.com/i.test(book.coverUrl)) && book.title);
	if (!booksWithoutCovers.length) {
		return;
	}

	const updatedBooks = [];
	for (let index = 0; index < booksWithoutCovers.length; index += 3) {
		const batch = booksWithoutCovers.slice(index, index + 3);
		const updatedBatch = await Promise.all(batch.map(async (book) => {
		try {
			const response = await apiRequest(`/books/${encodeURIComponent(book.id)}/cover`, { method: "POST" });
			return response && response.book ? response.book : null;
		} catch (error) {
			return null;
		}
		}));
		updatedBooks.push(...updatedBatch);

	}

	for (const updatedBook of updatedBooks) {

refs.openDeleteAccountDialog.addEventListener("click", () => {
	refs.deleteAccountConfirmation.value = "";
	refs.confirmDeleteAccount.disabled = true;
	refs.deleteAccountDialog.showModal();
});

refs.deleteAccountConfirmation.addEventListener("input", () => {
	refs.confirmDeleteAccount.disabled = refs.deleteAccountConfirmation.value.trim() !== "DELETE";
});

refs.confirmDeleteAccount.addEventListener("click", async () => {
	if (!state.currentUser || refs.deleteAccountConfirmation.value.trim() !== "DELETE") return;
	refs.confirmDeleteAccount.disabled = true;
	try {
		await apiRequest("/auth/me", { method: "DELETE" });
		refs.deleteAccountDialog.close();
		clearSession("Your account has been deleted.");
	} catch (error) {
		refs.confirmDeleteAccount.disabled = false;
		refs.deleteAccountConfirmation.value = "";
		refs.settingsStatus.textContent = error instanceof Error ? error.message : "Unable to delete your account right now.";
	}
});
		if (!updatedBook) {
			continue;
		}
		const index = state.books.findIndex((book) => book.id === updatedBook.id);
		if (index >= 0) {
			state.books[index] = updatedBook;
		}
	}
	rerender();
}

refs.finishRatingForm.addEventListener("submit", (event) => {
	event.preventDefault();
	const index = state.books.findIndex((book) => book.id === state.finishRatingBookId);
	if (index < 0) return;
	const book = state.books[index];
	const rating = Number(refs.finishRating.value);
	if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
		refs.finishRatingStatus.textContent = "Choose a rating between 1 and 5.";
		return;
	}
	(async () => {
		try {
			const response = await apiRequest(`/books/${book.id}`, {
				method: "PUT",
				body: JSON.stringify({ ...book, isRead: true, didNotFinish: false, finishedAt: todayIsoDate(), currentPage: Number(book.pageCount || 0) || Number(book.currentPage || 0), rating, review: refs.finishRatingReview.value.trim() })
			});
			state.books[index] = response.book;
			state.finishRatingBookId = "";
			refs.finishRatingDialog.close();
			showNotice("Book finished and rating saved.");
			rerender();
		} catch (error) {
			refs.finishRatingStatus.textContent = error instanceof Error ? error.message : "Unable to finish this book right now.";
		}
	})();
});

async function loadFriendsFromApi() {
	if (!state.currentUser) {
		state.friends = [];
		state.incomingFriendRequests = [];
		state.outgoingFriendRequests = [];
		state.activeFriendId = "";
		state.chatMessages = [];
		renderFriendsAndChat();
		return;
	}

	const response = await apiRequest("/friends", { method: "GET" });
	state.friends = response && Array.isArray(response.friends) ? response.friends : [];
	state.incomingFriendRequests = response && Array.isArray(response.incomingRequests) ? response.incomingRequests : [];
	state.outgoingFriendRequests = response && Array.isArray(response.outgoingRequests) ? response.outgoingRequests : [];
	renderFriendRequestNotification();
	if (state.activeFriendId && !state.friends.some((friend) => friend.id === state.activeFriendId)) {
		state.activeFriendId = "";
		state.chatMessages = [];
	}
	if (!state.activeFriendId && state.friends.length) {
		state.activeFriendId = state.friends[0].id;
	}
	renderFriendsAndChat();
	if (state.activeFriendId) {
		await loadChatMessages(state.activeFriendId);
		startChatRefresh();
	}
	await loadRecommendationsFromApi();
	await loadBookClubsFromApi();
	await loadActivityFromApi();
}

async function loadActivityFromApi() {
	if (!state.currentUser) {
		refs.activityList.textContent = "Sign in to see friends activity.";
		return;
	}
	try {
		const response = await apiRequest("/friends/activity", { method: "GET" });
		const activities = response && Array.isArray(response.activities) ? response.activities : [];
		refs.activityList.innerHTML = activities.length ? activities.map((activity) => `<p><strong>${escapeHtml(activity.username || activity.email)}</strong> ${escapeHtml(activity.type === "finished" ? "finished" : "added")} <span>${escapeHtml(activity.title)}</span></p>`).join("") : "No recent activity from friends.";
	} catch {
		refs.activityList.textContent = "Unable to load friends activity right now.";
	}
}

async function loadBookClubsFromApi() {
	if (!state.currentUser) {
		state.bookClubs = [];
		state.clubInvitations = [];
		renderBookClubs();
		return;
	}
	const response = await apiRequest("/book-clubs", { method: "GET" });
	state.bookClubs = response && Array.isArray(response.clubs) ? response.clubs : [];
	const invitationResponse = await apiRequest("/book-club-invitations", { method: "GET" });
	state.clubInvitations = invitationResponse && Array.isArray(invitationResponse.invitations) ? invitationResponse.invitations : [];
	renderBookClubs();
}

async function openClubWorkspace(clubId) {
	const club = state.bookClubs.find((entry) => entry.id === clubId);
	if (!club) return;
	state.activeClubId = clubId;
	const [bookResponse, discussionResponse] = await Promise.all([
		apiRequest(`/book-clubs/${encodeURIComponent(clubId)}/books`, { method: "GET" }),
		apiRequest(`/book-clubs/${encodeURIComponent(clubId)}/discussions`, { method: "GET" })
	]);
	const books = bookResponse && Array.isArray(bookResponse.books) ? bookResponse.books : [];
	const discussions = discussionResponse && Array.isArray(discussionResponse.discussions) ? discussionResponse.discussions : [];
	const isOwner = club.ownerId === state.currentUser.id;
	const availableFriends = state.friends.filter((friend) => !club.members.some((member) => member.id === friend.id));
	refs.clubWorkspaceTitle.textContent = club.name;
	refs.clubWorkspaceContent.innerHTML = `<section class="club-workspace-section"><h3>Invite members</h3>${isOwner ? `<form data-club-action="invite" class="club-inline-form"><select name="userId" required><option value="">Choose a friend</option>${availableFriends.map((friend) => `<option value="${friend.id}">${escapeHtml(friend.email)}</option>`).join("")}</select><button class="btn-sub" type="submit">Invite</button></form>` : '<p class="hint">Only the club owner can invite members.</p>'}</section><section class="club-workspace-section"><h3>Reading list</h3>${isOwner || state.currentUser ? `<form data-club-action="add-book" class="club-inline-form"><select name="bookId" required><option value="">Add one of your books</option>${state.books.map((book) => `<option value="${book.id}">${escapeHtml(book.title)}</option>`).join("")}</select><button class="btn-sub" type="submit">Add book</button></form>` : ""}<div class="club-reading-list">${books.length ? books.map((book) => `<div class="club-reading-item"><div><strong>${escapeHtml(book.title)}</strong>${book.isBookOfMonth ? `<span class="pill">Book of the month</span>` : ""}<span class="meta">Your progress: ${book.progress}%</span></div><label>Progress <input type="number" min="0" max="100" value="${book.progress}" data-club-progress="${book.id}"></label>${isOwner ? `<button class="btn-sub" type="button" data-club-book-month="${book.id}">Choose month</button>` : ""}</div>`).join("") : '<p class="hint">No books on the reading list yet.</p>'}</div></section><section class="club-workspace-section"><h3>Members</h3><div class="club-workspace-members">${club.members.map((member) => `<span>${escapeHtml(member.email)}${isOwner && member.id !== state.currentUser.id ? ` <button type="button" data-club-remove-member="${member.id}" aria-label="Remove ${escapeHtml(member.email)}">Remove</button>` : ""}</span>`).join("")}</div>${!isOwner ? `<button class="btn-sub" type="button" data-club-leave="true">Leave club</button>` : ""}</section><section class="club-workspace-section"><h3>Discussion</h3><div class="club-discussions">${discussions.length ? discussions.map((discussion) => `<article class="club-discussion" style="margin-left:${discussion.parentId ? "1rem" : "0"}"><strong>${escapeHtml(discussion.username || discussion.email)}</strong><p>${escapeHtml(discussion.text)}</p><button class="btn-sub" type="button" data-club-reply="${discussion.id}">Reply</button></article>`).join("") : '<p class="hint">Start the discussion.</p>'}</div><form data-club-action="discussion" class="club-discussion-form"><input type="hidden" name="parentId"><textarea name="text" rows="3" maxlength="2000" required placeholder="Start a discussion..."></textarea><button class="btn-main" type="submit">Post</button></form></section>`;
	refs.clubWorkspaceDialog.showModal();
}

async function loadRecommendationsFromApi() {
	if (!state.currentUser) {
		refs.recommendationsList.innerHTML = "";
		state.friendRecommendations = [];
		return;
	}
	const response = await apiRequest("/recommendations", { method: "GET" });
	const recommendations = response && Array.isArray(response.recommendations) ? response.recommendations : [];
	state.friendRecommendations = recommendations;
	refs.recommendationsList.innerHTML = "";
	if (!recommendations.length) {
		refs.recommendationsList.textContent = "No recommendations yet.";
		return;
	}
	recommendations.forEach((recommendation, index) => {
		const item = document.createElement("article");
		item.className = "recommendation-item";
		const title = document.createElement("strong");
		title.textContent = recommendation.title;
		const detail = document.createElement("p");
		detail.textContent = `From ${recommendation.fromEmail}${recommendation.author ? ` - ${recommendation.author}` : ""}`;
		item.append(title, detail);
		if (recommendation.note) {
			const note = document.createElement("p");
			note.textContent = recommendation.note;
			item.append(note);
		}
		const alreadySaved = isBookAlreadySaved(recommendation.title, recommendation.author);
		const actions = document.createElement("div");
		actions.className = "recommendation-item-actions";
		if (alreadySaved) {
			const savedNote = document.createElement("p");
			savedNote.className = "hint";
			savedNote.textContent = "Already on your shelf.";
			item.append(savedNote);
		} else {
			const addToLibraryBtn = document.createElement("button");
			addToLibraryBtn.type = "button";
			addToLibraryBtn.textContent = "Add to Library";
			addToLibraryBtn.dataset.friendRecommendationIndex = String(index);
			addToLibraryBtn.dataset.friendRecommendationOwned = "true";
			const addToWishlistBtn = document.createElement("button");
			addToWishlistBtn.type = "button";
			addToWishlistBtn.textContent = "Add to Wishlist";
			addToWishlistBtn.dataset.friendRecommendationIndex = String(index);
			addToWishlistBtn.dataset.friendRecommendationOwned = "false";
			actions.append(addToLibraryBtn, addToWishlistBtn);
		}
		const deleteBtn = document.createElement("button");
		deleteBtn.type = "button";
		deleteBtn.textContent = "Delete";
		deleteBtn.className = "recommendation-delete";
		deleteBtn.dataset.friendRecommendationDeleteId = recommendation.id;
		actions.append(deleteBtn);
		item.append(actions);
		refs.recommendationsList.append(item);
	});
}

function isBookAlreadySaved(title, author) {
	const normalized = (value) => String(value || "").trim().toLocaleLowerCase().replace(/\s+/g, " ");
	return state.books.some((book) => normalized(book.title) === normalized(title) && normalized(book.author) === normalized(author));
}

function clearSession(message) {
	stopChatRefresh();
	state.authToken = "";
	saveAuthToken();
	state.books = [];
	state.searchResults = [];
	state.friends = [];
	state.incomingFriendRequests = [];
	state.outgoingFriendRequests = [];
	renderFriendRequestNotification();
	state.activeFriendId = "";
	state.chatMessages = [];
	state.chatLoadError = "";
	state.editingBookId = "";
	state.trinkets = [];
	if (refs.friendEmail) {
		refs.friendEmail.value = "";
	}
	if (refs.chatText) {
		refs.chatText.value = "";
	}
	clearSearchUi("");
	setCurrentUser(null);
	if (message) {
		localStorage.setItem(AUTH_MESSAGE_STORAGE_KEY, message);
	}
	window.location.href = LOGIN_PAGE;
}

async function refreshSession() {
	if (!state.authToken) {
		window.location.replace(LOGIN_PAGE);
		return;
	}

	try {
		const response = await apiRequest("/auth/me", { method: "GET" });
		setCurrentUser(response.user);
	} catch (error) {
		clearSession(error instanceof Error && error.status === 401 ? "Session expired. Please sign in again." : "Unable to verify your sign-in. Please sign in again.");
		return;
	}

	try {
		await loadBooksFromApi();
		await loadFriendsFromApi();
	} catch (error) {
		refs.accountNote.textContent = error instanceof Error
			? `Your session is active, but some shelf data could not load: ${error.message}`
			: "Your session is active, but some shelf data could not load.";
	}
}

refs.settingsForm.addEventListener("submit", (event) => {
	event.preventDefault();
	if (!state.currentUser) {
		return;
	}

	const nextEmail = normalizeEmail(refs.settingsEmail.value);
	const nextUsername = String(refs.settingsUsername.value || "").trim();
	const nextPassword = refs.settingsPassword.value;
	let nextAvatar = state.currentUser.avatarUrl || "";

	if (!validEmail(nextEmail)) {
		refs.settingsStatus.textContent = "Please enter a valid email address.";
		return;
	}
	if (!/^[a-z0-9_]{3,24}$/i.test(nextUsername)) {
		refs.settingsStatus.textContent = "Username must be 3-24 letters, numbers, or underscores.";
		return;
	}

	if (nextPassword && nextPassword.length < 6) {
		refs.settingsStatus.textContent = "New password must be at least 6 characters.";
		return;
	}

	(async () => {
		try {
			const avatarFile = refs.settingsAvatar.files && refs.settingsAvatar.files[0];
			if (avatarFile) {
				const upload = new FormData();
				upload.append("avatar", avatarFile);
				const uploadResponse = await apiRequest("/auth/me/avatar", {
					method: "POST",
					body: upload
				});
				state.authToken = uploadResponse.token;
				saveAuthToken();
				state.currentUser = uploadResponse.user;
				nextAvatar = uploadResponse.user.avatarUrl;
			}
			const response = await apiRequest("/auth/me", {
				method: "PUT",
				body: JSON.stringify({
					email: nextEmail,
					username: nextUsername,
					password: nextPassword,
					avatarUrl: nextAvatar,
					weeklySummaryEnabled: refs.weeklySummaryEnabled.checked,
					readingRemindersEnabled: refs.readingRemindersEnabled.checked,
					profileBooksVisible: refs.profileBooksVisible.checked,
					profileActivityVisible: refs.profileActivityVisible.checked
				})
			});
			setSession(response.token, response.user);
			renderAccountSummary();
			refs.settingsStatus.textContent = "Settings saved.";
			refs.settingsDialog.close();
			showNotice("Profile settings saved.");
		} catch (error) {
			refs.settingsStatus.textContent = error instanceof Error ? error.message : "Unable to update settings right now.";
		}
	})();
});

refs.settingsBtn.addEventListener("click", () => {
	if (state.currentUser) {
		refs.settingsDialog.showModal();
	}
});

refs.openClubDialog.addEventListener("click", () => {
	refs.clubName.value = "";
	refs.bookClubStatus.textContent = "";
	refs.clubMemberOptions.innerHTML = state.friends.map((friend) => `<label class="checkbox-row"><input type="checkbox" name="memberId" value="${friend.id}">${friend.email}</label>`).join("");
	refs.bookClubDialog.showModal();
});

refs.bookClubForm.addEventListener("submit", (event) => {
	event.preventDefault();
	const memberIds = [...refs.bookClubForm.querySelectorAll("input[name='memberId']:checked")].map((input) => input.value);
	if (!memberIds.length) {
		refs.bookClubStatus.textContent = "Choose at least one friend.";
		return;
	}
	(async () => {
		try {
			const response = await apiRequest("/book-clubs", { method: "POST", body: JSON.stringify({ name: refs.clubName.value, memberIds }) });
		state.bookClubs.unshift({ ...response.club, members: [state.currentUser, ...state.friends.filter((friend) => memberIds.includes(friend.id))] });
		refs.bookClubDialog.close();
		renderBookClubs();
		showNotice("Book club created.");
		} catch (error) {
			refs.bookClubStatus.textContent = error instanceof Error ? error.message : "Unable to create this book club.";
		}
	})();
});

refs.bookClubsList.addEventListener("click", (event) => {
	const button = event.target instanceof HTMLElement ? event.target.closest("button[data-action]") : null;
	if (!(button instanceof HTMLButtonElement)) return;
	if (button.dataset.action === "open-club-workspace") {
		openClubWorkspace(button.dataset.id || "").catch((error) => showNotice(error instanceof Error ? error.message : "Unable to open this club right now."));
		return;
	}
	if (button.dataset.action === "open-club-chat") {
		setActiveClub(button.dataset.id || "");
		return;
	}
	if (button.dataset.action !== "delete-club" || !window.confirm("Delete this book club?")) return;
	(async () => {
		try {
			await apiRequest(`/book-clubs/${button.dataset.id}`, { method: "DELETE" });
			state.bookClubs = state.bookClubs.filter((club) => club.id !== button.dataset.id);
			renderBookClubs();
			showNotice("Book club deleted.");
		} catch (error) {
			showNotice(error instanceof Error ? error.message : "Unable to delete this book club.");
		}
	})();
});

refs.clubInvitations.addEventListener("click", (event) => {
	const button = event.target instanceof HTMLElement ? event.target.closest("button[data-action]") : null;
	if (!(button instanceof HTMLButtonElement) || !button.dataset.id) return;
	const action = button.dataset.action === "accept-club-invitation" ? "POST" : "DELETE";
	const endpoint = action === "POST" ? `/book-club-invitations/${encodeURIComponent(button.dataset.id)}/accept` : `/book-club-invitations/${encodeURIComponent(button.dataset.id)}`;
	apiRequest(endpoint, { method: action }).then(() => loadBookClubsFromApi()).then(() => showNotice(action === "POST" ? "Joined book club." : "Invitation declined.")).catch((error) => showNotice(error instanceof Error ? error.message : "Unable to update this invitation."));
});

refs.clubWorkspaceContent.addEventListener("click", (event) => {
	const target = event.target instanceof HTMLElement ? event.target : null;
	if (!target) return;
	const reply = target.closest("[data-club-reply]");
	if (reply) {
		const parent = refs.clubWorkspaceContent.querySelector("[name='parentId']");
		if (parent instanceof HTMLInputElement) parent.value = reply.dataset.clubReply || "";
		const text = refs.clubWorkspaceContent.querySelector("[name='text']");
		if (text instanceof HTMLTextAreaElement) text.focus();
		return;
	}
	const month = target.closest("[data-club-book-month]");
	if (month) apiRequest(`/book-clubs/${encodeURIComponent(state.activeClubId || "")}/books/${encodeURIComponent(month.dataset.clubBookMonth || "")}/book-of-month`, { method: "PUT" }).then(() => openClubWorkspace(state.activeClubId)).catch((error) => showNotice(error instanceof Error ? error.message : "Unable to choose the book of the month."));
	const remove = target.closest("[data-club-remove-member]");
	if (remove && state.activeClubId) apiRequest(`/book-clubs/${state.activeClubId}/members/${remove.dataset.clubRemoveMember}`, { method: "DELETE" }).then(() => openClubWorkspace(state.activeClubId)).catch((error) => showNotice(error instanceof Error ? error.message : "Unable to remove that member."));
	const leave = target.closest("[data-club-leave]");
	if (leave && state.activeClubId && window.confirm("Leave this book club?")) apiRequest(`/book-clubs/${state.activeClubId}/membership`, { method: "DELETE" }).then(() => { refs.clubWorkspaceDialog.close(); return loadBookClubsFromApi(); }).catch((error) => showNotice(error instanceof Error ? error.message : "Unable to leave this club."));
});

refs.clubWorkspaceContent.addEventListener("submit", (event) => {
	const form = event.target instanceof HTMLFormElement ? event.target : null;
	if (!form || !form.dataset.clubAction) return;
	event.preventDefault();
	const clubId = state.activeClubId;
	if (!clubId) return;
	const data = new FormData(form);
	const action = form.dataset.clubAction;
	const endpoint = action === "discussion" ? `/book-clubs/${clubId}/discussions` : action === "invite" ? `/book-clubs/${clubId}/invitations` : `/book-clubs/${clubId}/books`;
	apiRequest(endpoint, { method: "POST", body: JSON.stringify(Object.fromEntries(data)) }).then(() => openClubWorkspace(clubId)).catch((error) => showNotice(error instanceof Error ? error.message : "Unable to update this club right now."));
});

refs.clubWorkspaceContent.addEventListener("change", (event) => {
	const input = event.target instanceof HTMLInputElement ? event.target : null;
	if (!input?.dataset.clubProgress) return;
	const clubId = state.activeClubId;
	if (clubId) apiRequest(`/book-clubs/${clubId}/books/${input.dataset.clubProgress}/progress`, { method: "PUT", body: JSON.stringify({ percent: Number(input.value) }) }).catch((error) => showNotice(error instanceof Error ? error.message : "Unable to save progress."));
});

async function downloadLibrary(format) {
	if (!state.authToken) {
		return;
	}
	const buttons = [refs.downloadJson, refs.downloadCsv];
	buttons.forEach((button) => {
		button.disabled = true;
	});
	refs.settingsStatus.textContent = `Preparing ${format.toUpperCase()} backup...`;
	try {
		const response = await fetch(`${API_BASE}/library/export?format=${encodeURIComponent(format)}`, {
			headers: { Authorization: `Bearer ${state.authToken}` }
		});
		if (!response.ok) {
			const payload = await response.json().catch(() => null);
			throw new Error(payload && payload.message ? payload.message : "Unable to create your backup.");
		}
		const downloadUrl = URL.createObjectURL(await response.blob());
		const link = document.createElement("a");
		link.href = downloadUrl;
		link.download = `readers-corner-library-${new Date().toISOString().slice(0, 10)}.${format}`;
		document.body.append(link);
		link.click();
		link.remove();
		URL.revokeObjectURL(downloadUrl);
		refs.settingsStatus.textContent = "Your library backup is downloading.";
	} catch (error) {
		refs.settingsStatus.textContent = error instanceof Error ? error.message : "Unable to create your backup.";
	} finally {
		buttons.forEach((button) => {
			button.disabled = false;
		});
	}
}

refs.downloadJson.addEventListener("click", () => downloadLibrary("json"));
refs.downloadCsv.addEventListener("click", () => downloadLibrary("csv"));

refs.settingsAvatar.addEventListener("change", () => {
	refs.settingsAvatarName.textContent = refs.settingsAvatar.files?.[0]?.name || "No image selected";
});

refs.libraryImportFile.addEventListener("change", () => {
	refs.importLibrary.disabled = !refs.libraryImportFile.files?.length;
	refs.libraryImportFileName.textContent = refs.libraryImportFile.files?.[0]?.name || "No backup selected";
	refs.settingsStatus.textContent = refs.libraryImportFile.files?.[0]
		? `Ready to import ${refs.libraryImportFile.files[0].name}.`
		: "Update your account details here.";
});

refs.importLibrary.addEventListener("click", async () => {
	const file = refs.libraryImportFile.files?.[0];
	if (!file) {
		return;
	}
	refs.importLibrary.disabled = true;
	refs.settingsStatus.textContent = "Importing your library...";
	try {
		const formData = new FormData();
		formData.append("library", file);
		const response = await apiRequest("/library/import", {
			method: "POST",
			body: formData
		});
		refs.libraryImportFile.value = "";
		refs.libraryImportFileName.textContent = "No backup selected";
		await loadBooksFromApi();
		refs.settingsStatus.textContent = `${response.imported} book${response.imported === 1 ? "" : "s"} imported${response.skipped ? `; ${response.skipped} duplicate${response.skipped === 1 ? "" : "s"} skipped` : ""}.`;
		showNotice("Library import complete.");
	} catch (error) {
		refs.settingsStatus.textContent = error instanceof Error ? error.message : "Unable to import your library.";
	} finally {
		refs.importLibrary.disabled = !refs.libraryImportFile.files?.length;
	}
});

refs.openClearDialog.addEventListener("click", () => {
	refs.shelfMenuDialog.close();
	refs.clearShelfConfirmation.value = "";
	refs.clearAll.disabled = true;
	refs.clearShelfDialog.showModal();
});

refs.clearShelfConfirmation.addEventListener("input", () => {
	refs.clearAll.disabled = refs.clearShelfConfirmation.value.trim() !== "CLEAR";
});

refs.viewNav.addEventListener("click", (event) => {
	const target = event.target;
	if (!(target instanceof HTMLButtonElement) || !target.dataset.view) {
		return;
	}
	const activeView = target.dataset.view;
	localStorage.setItem(ACTIVE_VIEW_STORAGE_KEY, activeView);
	if (activeView === "community") {
		state.unreadMessageCount = 0;
		messageNotificationCursor = Date.now();
		renderMessageNotification();
	}
	refs.libraryView.hidden = activeView !== "library";
	refs.wishlistView.hidden = activeView !== "wishlist";
	refs.shelfView.hidden = activeView !== "shelf";
	refs.communityView.hidden = activeView !== "community";
	for (const button of refs.viewNav.querySelectorAll("button")) {
		const selected = button === target;
		button.classList.toggle("active", selected);
		button.toggleAttribute("aria-current", selected);
	}
	if (activeView === "shelf" && state.currentUser) {
		renderBookshelf();
		renderTrinketTray();
		loadBookshelfExtras().then(() => {
			renderBookshelf();
			renderTrinketTray();
		});
	}
});

const savedView = localStorage.getItem(ACTIVE_VIEW_STORAGE_KEY);
const savedViewButton = savedView && refs.viewNav.querySelector(`button[data-view="${CSS.escape(savedView)}"]`);
if (savedViewButton) {
	savedViewButton.click();
}

refs.resetBookshelfLayout.addEventListener("click", () => {
	if (!state.currentUser) return;
	refs.resetBookshelfDialog.showModal();
});

refs.confirmResetBookshelf.addEventListener("click", () => {
	refs.resetBookshelfDialog.close();
	resetBookshelfLayout();
});

initBookcaseColorPicker();

refs.trinketTrayList.addEventListener("click", (event) => {
	const target = event.target instanceof Element ? event.target.closest("[data-action='toggle-trinket-visibility']") : null;
	if (!(target instanceof HTMLButtonElement) || !target.dataset.id) return;
	toggleTrinketVisibility(target.dataset.id);
});

refs.bookcaseColorBtn.addEventListener("click", () => {
	const isHidden = refs.bookcaseColorMenu.hidden;
	refs.bookcaseColorMenu.hidden = !isHidden;
	refs.bookcaseColorBtn.setAttribute("aria-expanded", isHidden ? "true" : "false");
});

refs.bookcaseColorMenu.addEventListener("click", (event) => {
	const target = event.target;
	if (!(target instanceof HTMLButtonElement) || !target.dataset.presetId) return;
	setBookcaseColor(target.dataset.presetId);
	refs.bookcaseColorMenu.hidden = true;
	refs.bookcaseColorBtn.setAttribute("aria-expanded", "false");
});

document.addEventListener("click", (event) => {
	if (refs.bookcaseColorMenu.hidden) return;
	if (event.target === refs.bookcaseColorBtn || refs.bookcaseColorBtn.contains(event.target) || refs.bookcaseColorMenu.contains(event.target)) return;
	refs.bookcaseColorMenu.hidden = true;
	refs.bookcaseColorBtn.setAttribute("aria-expanded", "false");
});

for (const button of document.querySelectorAll("[data-close-dialog]")) {
	button.addEventListener("click", () => {
		const dialog = document.getElementById(button.dataset.closeDialog || "");
		if (dialog instanceof HTMLDialogElement) {
			dialog.close();
		}
	});
}

refs.readingGoalForm.addEventListener("submit", (event) => {
	event.preventDefault();
	if (!state.currentUser) {
		return;
	}

	const readingGoal = Number(refs.readingGoal.value);
	if (!Number.isInteger(readingGoal) || readingGoal < 1 || readingGoal > 1000) {
		refs.readingGoalStatus.textContent = "Choose a whole number between 1 and 1,000.";
		return;
	}

	(async () => {
		try {
			const response = await apiRequest("/auth/me", {
				method: "PUT",
				body: JSON.stringify({
					email: state.currentUser.email,
					avatarUrl: state.currentUser.avatarUrl || "",
					readingGoal
				})
			});
			setSession(response.token, response.user);
			refs.readingGoalStatus.textContent = "Reading goal saved.";
		} catch (error) {
			refs.readingGoalStatus.textContent = error instanceof Error ? error.message : "Unable to save your reading goal right now.";
		}
	})();
});

refs.logoutBtn.addEventListener("click", () => {
	if (!state.currentUser) {
		window.location.href = LOGIN_PAGE;
		return;
	}
	clearSession("You have been logged out.");
});

refs.viewMyProfileBtn.addEventListener("click", () => {
	if (!state.currentUser) {
		return;
	}
	window.open(`${SITE_BASE}/profile.html?friendId=${encodeURIComponent(state.currentUser.id)}`, "_blank", "noopener");
});

refs.form.addEventListener("submit", (event) => {
	event.preventDefault();
	if (!state.currentUser) {
		refs.searchStatus.textContent = "Sign in to save books to your shelf.";
		return;
	}

	const formData = new FormData(refs.form);
	const book = toBook(formData);
	if (!book.title) {
		return;
	}

	(async () => {
		try {
			const coverFile = refs.bookCoverUpload.files?.[0];
			if (coverFile) {
				const upload = new FormData();
				upload.append("cover", coverFile);
				const uploadResponse = await apiRequest("/books/cover-upload", {
					method: "POST",
					body: upload
				});
				book.coverUrl = uploadResponse.coverUrl;
			}
			const response = await apiRequest("/books", {
				method: "POST",
				body: JSON.stringify(book)
			});
			state.books.push(response.book);
			resetBookForm();
			rerender();
			refreshShelfRecommendations();
		} catch (error) {
			refs.searchStatus.textContent = error instanceof Error ? error.message : "Unable to save book right now.";
		}
	})();
});

refs.bookCoverUpload.addEventListener("change", () => {
	refs.bookCoverUploadName.textContent = refs.bookCoverUpload.files?.[0]?.name || "No image selected";
});

refs.isRead.addEventListener("change", () => {
	if (refs.isRead.checked && !refs.finishedAt.value) {
		refs.finishedAt.value = todayIsoDate();
	}
	if (!refs.isRead.checked) {
		refs.finishedAt.value = "";
	}
});

refs.searchBtn.addEventListener("click", () => {
	runSearch();
});

refs.searchInput.addEventListener("keydown", (event) => {
	if (event.key !== "Enter") {
		return;
	}
	event.preventDefault();
	if (state.typeaheadTimerId !== null) {
		clearTimeout(state.typeaheadTimerId);
		state.typeaheadTimerId = null;
	}
	runSearch();
});

refs.searchInput.addEventListener("input", () => {
	scheduleTypeaheadSearch();
});

function updateSearchBookFieldsVisibility() {
	const status = new FormData(refs.searchBookForm).get("shelfStatus") || "want";
	const isReading = status === "own" || status === "finished";
	const isFinished = status === "finished";
	refs.searchBookReadingFields.hidden = !isReading;
	refs.searchBookFinishedAtField.hidden = !isFinished;
	refs.searchBookRatingField.hidden = !isFinished;
	refs.searchBookRating.required = isFinished;
	if (isFinished && !refs.searchBookFinishedAt.value) {
		refs.searchBookFinishedAt.value = todayIsoDate();
	}
	if (!isFinished) {
		refs.searchBookFinishedAt.value = "";
		refs.searchBookRating.value = "2.5";
	}
}

for (const radio of refs.searchBookForm.querySelectorAll("input[name='shelfStatus']")) {
	radio.addEventListener("change", updateSearchBookFieldsVisibility);
}

refs.searchResults.addEventListener("click", (event) => {
	const target = event.target;
	if (!(target instanceof HTMLButtonElement)) {
		return;
	}
	const index = Number(target.dataset.searchIndex);
	if (!Number.isInteger(index) || index < 0) {
		return;
	}
	applySearchResult(index);
});

refs.refreshRecommendations.addEventListener("click", () => {
	refreshShelfRecommendations();
});

refs.shelfRecommendationsList.addEventListener("click", (event) => {
	const button = event.target instanceof HTMLElement ? event.target.closest("button[data-recommendation-index], button[data-recommendation-info-index], button[data-recommendation-dismiss-index]") : null;
	if (!(button instanceof HTMLButtonElement)) return;
	const index = Number(button.dataset.recommendationIndex ?? button.dataset.recommendationInfoIndex ?? button.dataset.recommendationDismissIndex);
	if (!Number.isInteger(index) || index < 0) return;
	if (button.dataset.recommendationInfoIndex !== undefined) {
		showShelfRecommendationInfo(index);
		return;
	}
	if (button.dataset.recommendationDismissIndex !== undefined) {
		const book = state.recommendedBooks[index];
		if (!book) return;
		(async () => {
			try {
				const response = await apiRequest("/recommendation-dismissals", { method: "POST", body: JSON.stringify({ title: book.title, author: book.author }) });
				state.dismissedRecommendationKeys.push(response.key);
				removeShelfRecommendation(index);
				showNotice("Recommendation hidden.");
			} catch (error) {
				showNotice(error instanceof Error ? error.message : "Unable to hide this recommendation.");
			}
		})();
		return;
	}
	applyShelfRecommendation(index);
});

refs.recommendationsList.addEventListener("click", (event) => {
	const deleteButton = event.target instanceof HTMLElement ? event.target.closest("button[data-friend-recommendation-delete-id]") : null;
	if (deleteButton instanceof HTMLButtonElement) {
		const recommendationId = deleteButton.dataset.friendRecommendationDeleteId;
		if (!recommendationId) return;
		deleteButton.disabled = true;
		(async () => {
			try {
				await apiRequest(`/recommendations/${recommendationId}`, { method: "DELETE" });
				showNotice("Recommendation deleted.");
				await loadRecommendationsFromApi();
			} catch (error) {
				deleteButton.disabled = false;
				showNotice(error instanceof Error ? error.message : "Unable to delete this recommendation.");
			}
		})();
		return;
	}

	const button = event.target instanceof HTMLElement ? event.target.closest("button[data-friend-recommendation-index]") : null;
	if (!(button instanceof HTMLButtonElement)) return;
	const index = Number(button.dataset.friendRecommendationIndex);
	const recommendation = state.friendRecommendations[index];
	if (!recommendation) return;
	const isOwned = button.dataset.friendRecommendationOwned === "true";
	button.disabled = true;
	(async () => {
		try {
			const response = await apiRequest("/books", {
				method: "POST",
				body: JSON.stringify({
					title: recommendation.title,
					author: recommendation.author || "",
					genre: recommendation.genre || "",
					coverUrl: recommendation.coverUrl || "",
					isOwned,
					recommendedBy: recommendation.fromEmail || ""
				})
			});
			state.books.push(response.book);
			rerender();
			showNotice(isOwned ? "Added to your library." : "Added to your wishlist.");
			await loadRecommendationsFromApi();
		} catch (error) {
			button.disabled = false;
			showNotice(error instanceof Error ? error.message : "Unable to add this book right now.");
		}
	})();
});

refs.searchBookForm.addEventListener("submit", (event) => {
	event.preventDefault();
	const selectedBook = state.selectedSearchBook;
	if (!state.currentUser || !selectedBook) {
		return;
	}

	const formData = new FormData(refs.searchBookForm);
	const shelfStatus = String(formData.get("shelfStatus") || "want");
	const startedAt = shelfStatus === "want" ? "" : String(formData.get("startedAt") || "");
	const finishedAt = shelfStatus === "finished" ? String(formData.get("finishedAt") || "") : "";
	if (startedAt && finishedAt && startedAt > finishedAt) {
		refs.searchBookStatus.textContent = "The finish date cannot be before the start date.";
		return;
	}

	const rating = Number(formData.get("rating"));
	const seriesPosition = Number(formData.get("seriesPosition"));
	const isRead = shelfStatus === "finished";
	const pageCount = shelfStatus === "want" ? 0 : Number(formData.get("pageCount") || 0);
	const enteredCurrentPage = Number(formData.get("currentPage") || 0);
	const currentPage = isRead && pageCount > 0 ? pageCount : enteredCurrentPage;
	const matchingBook = state.duplicateBookId
		? state.books.find((entry) => entry.id === state.duplicateBookId)
		: null;
	const book = {
		...(matchingBook || {}),
		title: selectedBook.title || "",
		author: selectedBook.author || "",
		genre: selectedBook.genre || "Other",
		year: selectedBook.year || "",
		rating: Number.isFinite(rating) ? Math.min(5, Math.max(1, rating)) : 2.5,
		startedAt,
		finishedAt,
		isRead,
		isOwned: shelfStatus !== "want",
		coverUrl: selectedBook.coverUrl || "",
		pageCount,
		currentPage,
		seriesName: String(formData.get("seriesName") || "").trim(),
		seriesPosition: Number.isFinite(seriesPosition) && seriesPosition > 0 ? seriesPosition : 0
	};

	(async () => {
		try {
			const response = await apiRequest(matchingBook ? `/books/${matchingBook.id}` : "/books", {
				method: matchingBook ? "PUT" : "POST",
				body: JSON.stringify(book)
			});
			if (matchingBook) {
				state.books[state.books.findIndex((entry) => entry.id === matchingBook.id)] = response.book;
			} else {
				state.books.push(response.book);
			}
			state.selectedSearchBook = null;
			state.duplicateBookId = "";
			refs.searchBookDialog.close();
			clearSearchUi(matchingBook ? "Existing book updated." : "Book added to your shelf.");
			rerender();
			refreshShelfRecommendations();
		} catch (error) {
			refs.searchBookStatus.textContent = error instanceof Error ? error.message : "Unable to add this book right now.";
		}
	})();
});

refs.addDuplicateBook.addEventListener("click", () => {
	state.duplicateBookId = "";
	refs.duplicateBookNotice.hidden = true;
	refs.saveSearchBook.textContent = "Add To Shelf";
	refs.addDuplicateBook.hidden = true;
	refs.searchBookStatus.textContent = "A separate copy will be added to your shelf.";
});

refs.friendForm.addEventListener("submit", (event) => {
	event.preventDefault();
	if (!state.currentUser) {
		refs.friendStatus.textContent = "Sign in to add friends.";
		return;
	}

	const email = String(refs.friendEmail.value || "").trim();
	if (!email) {
		refs.friendStatus.textContent = "Type a friend's email address first.";
		return;
	}

	(async () => {
		try {
			const response = await apiRequest("/friends", {
				method: "POST",
				body: JSON.stringify({ email })
			});
			refs.friendEmail.value = "";
			refs.friendStatus.textContent = `Friend request sent to ${response.friend.email}.`;
			refs.friendDialog.close();
			await loadFriendsFromApi();
		} catch (error) {
			refs.friendStatus.textContent = error instanceof Error ? error.message : "Unable to add friend right now.";
		}
	})();
});

refs.openFriendDialog.addEventListener("click", () => {
	if (!state.currentUser) {
		refs.friendStatus.textContent = "Sign in to add friends.";
		return;
	}
	refs.friendStatus.textContent = "Enter their email to send a friend request.";
	refs.friendDialog.showModal();
	refs.friendEmail.focus();
});

refs.friendsList.addEventListener("click", (event) => {
	const target = event.target;
	if (!(target instanceof HTMLElement)) {
		return;
	}

	const button = target.closest("button[data-action]");
	if (!(button instanceof HTMLButtonElement)) {
		return;
	}

	const id = button.dataset.id;
	if (!id) {
		return;
	}

	if (button.dataset.action === "remove-friend") {
		const friend = [...state.friends, ...state.incomingFriendRequests, ...state.outgoingFriendRequests].find((entry) => entry.id === id);
		if (!friend || !window.confirm(`Remove ${friend.email} from your friends?`)) {
			return;
		}
		(async () => {
			try {
				await apiRequest(`/friends/${id}`, { method: "DELETE" });
				state.friends = state.friends.filter((entry) => entry.id !== id);
				if (state.activeFriendId === id) {
					state.activeFriendId = "";
					state.chatMessages = [];
					state.chatLoadError = "";
					renderFriendProfile(null);
				}
				renderFriendsAndChat();
				showNotice("Friend removed.");
			} catch (error) {
				showNotice(error instanceof Error ? error.message : "Unable to remove this friend right now.");
			}
		})();
		return;
	}

	if (button.dataset.action === "accept-friend") {
		(async () => {
			try {
				await apiRequest(`/friends/${id}/accept`, { method: "POST" });
				await loadFriendsFromApi();
				showNotice("Friend request accepted.");
			} catch (error) {
				showNotice(error instanceof Error ? error.message : "Unable to accept this friend request right now.");
			}
		})();
		return;
	}

	if (button.dataset.action === "view-friend-profile") {
		window.location.href = `${SITE_BASE}/profile.html?friendId=${encodeURIComponent(id)}`;
		return;
	}

	if (button.dataset.action !== "select-friend") {
		return;
	}
	setActiveFriend(id);
});

refs.chatForm.addEventListener("submit", (event) => {
	event.preventDefault();
	if (!state.currentUser) {
		refs.chatStatus.textContent = "Sign in to send messages.";
		return;
	}
	if (state.chatMode === "club" && !state.activeClubId) {
		refs.chatStatus.textContent = "Choose a book club before sending a message.";
		return;
	}
	if (state.chatMode !== "club" && !state.activeFriendId) {
		refs.chatStatus.textContent = "Choose a friend before sending a message.";
		return;
	}

	const text = String(refs.chatText.value || "").trim();
	if (!text) {
		refs.chatStatus.textContent = "Write a message first.";
		return;
	}

	(async () => {
		try {
			await apiRequest(state.chatMode === "club" ? `/book-clubs/${encodeURIComponent(state.activeClubId)}/messages` : "/chat/messages", {
				method: "POST",
				body: JSON.stringify(state.chatMode === "club" ? { text } : { friendId: state.activeFriendId, text })
			});
			refs.chatText.value = "";
			if (state.chatMode === "club") {
				await loadClubMessages(state.activeClubId);
			} else {
				await loadChatMessages(state.activeFriendId);
			}
		} catch (error) {
			refs.chatStatus.textContent = error instanceof Error ? error.message : "Unable to send message right now.";
		}
	})();
});

refs.clearAll.addEventListener("click", () => {
	if (!state.currentUser || !state.books.length || refs.clearShelfConfirmation.value.trim() !== "CLEAR") {
		return;
	}

	(async () => {
		try {
			await apiRequest("/books", { method: "DELETE" });
			state.books = [];
			refs.clearShelfDialog.close();
			showNotice("Your shelf has been cleared.");
			rerender();
		} catch (error) {
			refs.progressCopy.textContent = error instanceof Error ? error.message : "Unable to clear shelf right now.";
		}
	})();
});

refs.statusTabs.addEventListener("click", (event) => {
	const target = event.target;
	if (!(target instanceof HTMLButtonElement) || !target.dataset.filter) {
		return;
	}
	state.filter = target.dataset.filter;
	for (const button of refs.statusTabs.querySelectorAll("button")) {
		const selected = button === target;
		button.classList.toggle("active", selected);
		button.setAttribute("aria-selected", String(selected));
	}
	rerender();
});

refs.sortView.addEventListener("change", (event) => {
	state.sort = event.target.value;
	rerender();
});

refs.shelfSearch.addEventListener("input", () => {
	state.shelfQuery = refs.shelfSearch.value.trim();
	rerender();
});

refs.genreFilter.addEventListener("change", () => {
	state.genreFilter = refs.genreFilter.value;
	rerender();
});

refs.tagFilter.addEventListener("change", () => {
	state.tagFilter = refs.tagFilter.value;
	rerender();
});

refs.monthlyHistory.addEventListener("click", (event) => {
	const button = event.target.closest("button[data-month]");
	if (!button) {
		return;
	}
	const month = Number(button.dataset.month);
	const year = Number(button.dataset.year);
	const isSameMonth = state.selectedInsightMonth?.year === year && state.selectedInsightMonth?.month === month;
	state.selectedInsightMonth = isSameMonth ? null : { month, year };
	rerender();
});

refs.clearInsightsMonth.addEventListener("click", () => {
	state.selectedInsightMonth = null;
	rerender();
});

refs.downloadShareCard.addEventListener("click", () => {
	const year = new Date().getFullYear();
	const finished = state.books.filter((book) => book.isRead && String(book.finishedAt || "").startsWith(`${year}-`)).length;
	const goal = Number(state.currentUser?.readingGoal || 12);
	const percent = Math.min(100, Math.round((finished / goal) * 100));
	const canvas = document.createElement("canvas");
	canvas.width = 1200;
	canvas.height = 630;
	const context = canvas.getContext("2d");
	if (!context) return;
	context.fillStyle = "#f5e7b0";
	context.fillRect(0, 0, canvas.width, canvas.height);
	context.fillStyle = "#136f63";
	context.fillRect(0, 0, 42, canvas.height);
	context.fillStyle = "#1f2a35";
	context.font = "700 54px Merriweather, Georgia, serif";
	context.fillText("The Readers Collective", 92, 118);
	context.font = "500 34px Space Grotesk, sans-serif";
	context.fillText(`${year} reading goal`, 92, 178);
	context.font = "700 150px Space Grotesk, sans-serif";
	context.fillText(`${finished}/${goal}`, 92, 380);
	context.font = "500 34px Space Grotesk, sans-serif";
	context.fillText(`${percent}% complete`, 98, 438);
	context.fillStyle = "#d17b0f";
	context.fillRect(92, 495, 930, 26);
	context.fillStyle = "#136f63";
	context.fillRect(92, 495, 930 * percent / 100, 26);
	const link = document.createElement("a");
	link.href = canvas.toDataURL("image/png");
	link.download = `readers-corner-${year}-goal.png`;
	link.click();
	showNotice("Goal share card downloaded.");
});

refs.shelfMenuBtn.addEventListener("click", () => {
	if (state.currentUser) {
		refs.shelfMenuDialog.showModal();
	}
});

refs.nowReadingList.addEventListener("click", (event) => {
	const target = event.target;
	if (!(target instanceof HTMLButtonElement)) {
		return;
	}
	const id = target.dataset.id;
	const action = target.dataset.action;
	const index = state.books.findIndex((book) => book.id === id);
	if (!id || !action || index < 0) {
		return;
	}

	const existingBook = state.books[index];
	if (action === "finish-book") {
		openFinishRatingDialog(id);
		return;
	}
	const pageCount = Number(existingBook.pageCount || 0);
	const update = action === "add-pages"
		? { ...existingBook, currentPage: Math.min(pageCount, Number(existingBook.currentPage || 0) + 10) }
		: existingBook;

	(async () => {
		try {
			const response = await apiRequest(`/books/${id}`, {
				method: "PUT",
				body: JSON.stringify(update)
			});
			state.books[index] = response.book;
			showNotice("Progress updated.");
			rerender();
		} catch (error) {
			showNotice(error instanceof Error ? error.message : "Unable to update this book right now.");
		}
	})();
});

refs.wishlistList.addEventListener("click", (event) => {
	const target = event.target;
	if (!(target instanceof HTMLButtonElement)) {
		return;
	}
	const id = target.dataset.id;
	const index = state.books.findIndex((book) => book.id === id);
	if (!id || index < 0) {
		return;
	}

	(async () => {
		try {
			if (target.dataset.action === "delete") {
				await apiRequest(`/books/${id}`, { method: "DELETE" });
				state.books.splice(index, 1);
				showNotice("Removed from your wishlist.");
			} else if (target.dataset.action === "own") {
				const response = await apiRequest(`/books/${id}`, {
					method: "PUT",
					body: JSON.stringify({ ...state.books[index], isOwned: true })
				});
				state.books[index] = response.book;
				showNotice("Moved to your shelf.");
			}
			rerender();
		} catch (error) {
			showNotice(error instanceof Error ? error.message : "Unable to update this book right now.");
		}
	})();
});

refs.books.addEventListener("click", (event) => {
	if (!state.currentUser) {
		return;
	}

	const target = event.target;
	if (!(target instanceof HTMLButtonElement)) {
		return;
	}

	const action = target.dataset.action;
	const id = target.dataset.id;
	if (!action || !id) {
		return;
	}

	const idx = state.books.findIndex((book) => book.id === id);
	if (idx < 0) {
		return;
	}

	if (action === "find-replacement") {
		openMetadataPicker(state.books[idx]);
		return;
	}

	if (action === "finish") {
		openFinishRatingDialog(id);
		return;
	}

	if (action === "start" || action === "dnf" || action === "resume") {
		(async () => {
			try {
				const book = state.books[idx];
				const isFinished = false;
				const response = await apiRequest(`/books/${book.id}`, {
					method: "PUT",
					body: JSON.stringify({
						...book,
						isRead: isFinished,
						didNotFinish: action === "dnf",
						startedAt: action === "start" ? todayIsoDate() : book.startedAt || todayIsoDate(),
						finishedAt: ""
					})
				});
				state.books[idx] = response.book;
				rerender();
			} catch (error) {
				refs.progressCopy.textContent = error instanceof Error ? error.message : "Unable to update this book right now.";
			}
		})();
		return;
	}

	if (action === "recommend") {
		const book = state.books[idx];
		state.recommendationBookId = book.id;
		refs.recommendBookTitle.textContent = `${book.title}${book.author ? ` by ${book.author}` : ""}`;
		refs.recommendFriend.innerHTML = state.friends.map((friend) => `<option value="${friend.id}">${friend.email}</option>`).join("");
		refs.recommendNote.value = "";
		refs.recommendStatus.textContent = "";
		refs.recommendDialog.showModal();
		return;
	}

	if (action === "details") {
		const book = state.books[idx];
		const currentPage = book.isRead ? Number(book.pageCount) : Number(book.currentPage || 0);
		const progress = Number(book.pageCount) > 0 ? `${Math.min(100, Math.round((currentPage / Number(book.pageCount)) * 100))}% (${currentPage} of ${Number(book.pageCount)} pages)` : "Pages not added";
		refs.bookDetailsTitle.textContent = book.title;
		refs.bookDetailsContent.innerHTML = `<dl class="book-details-list"><div><dt>Author</dt><dd>${escapeHtml(book.author || "Not set")}</dd></div><div><dt>Status</dt><dd>${escapeHtml(book.isRead ? "Finished" : book.startedAt ? "Reading" : book.didNotFinish ? "Did not finish" : "Want to read")}</dd></div><div><dt>Progress</dt><dd>${escapeHtml(progress)}</dd></div><div><dt>Genre</dt><dd>${escapeHtml(book.genre || "Not set")}</dd></div><div><dt>Series</dt><dd>${escapeHtml(book.seriesName ? `${book.seriesName}${book.seriesPosition ? `, book ${book.seriesPosition}` : ""}` : "Not set")}</dd></div><div><dt>Tags</dt><dd>${escapeHtml((book.tags || []).join(", ") || "None")}</dd></div></dl>${book.review ? `<section><h3>Your review <span class="hint">(visible to friends)</span></h3><p>${escapeHtml(book.review)}</p></section>` : ""}${book.notes ? `<section><h3>Notes <span class="hint">(private)</span></h3><p>${escapeHtml(book.notes)}</p></section>` : ""}${book.favoriteQuote ? `<section><h3>Favorite quote</h3><blockquote>${escapeHtml(book.favoriteQuote)}</blockquote></section>` : ""}`;
		refs.bookDetailsDialog.showModal();
		return;
	}

	if (action === "edit") {
		state.editingBookId = state.editingBookId === id ? "" : id;
		rerender();
		const editor = document.getElementById(`book-editor-${id}`);
		if (editor instanceof HTMLDialogElement) {
			if (window.lucide) {
				window.lucide.createIcons({ nodes: [editor] });
			}
			editor.showModal();
		}
		return;
	}

	if (action === "cancel-edit") {
		state.editingBookId = "";
		rerender();
		return;
	}

	if (action === "delete") {
		(async () => {
			try {
				await apiRequest(`/books/${state.books[idx].id}`, { method: "DELETE" });
				state.books.splice(idx, 1);
				if (state.editingBookId === id) {
					state.editingBookId = "";
				}
				rerender();
			} catch (error) {
				refs.progressCopy.textContent = error instanceof Error ? error.message : "Unable to delete this book right now.";
			}
		})();
	}
});

refs.metadataPickerResults.addEventListener("click", (event) => {
	const button = event.target instanceof HTMLElement ? event.target.closest("button[data-metadata-key]") : null;
	if (!(button instanceof HTMLButtonElement) || !state.metadataPickerBookId) return;
	(async () => {
		try {
			const response = await apiRequest(`/books/${encodeURIComponent(state.metadataPickerBookId)}/metadata?key=${encodeURIComponent(button.dataset.metadataKey || "")}`, { method: "POST" });
			const index = state.books.findIndex((book) => book.id === state.metadataPickerBookId);
			if (index >= 0 && response && response.book) state.books[index] = response.book;
			refs.metadataPickerDialog.close();
			state.metadataPickerBookId = "";
			rerender();
			showNotice("Book information replaced.");
		} catch (error) {
			refs.metadataPickerStatus.textContent = error instanceof Error ? error.message : "Unable to replace book information right now.";
		}
	})();
});

document.addEventListener("close", (event) => {
	const dialog = event.target;
	if (dialog instanceof HTMLDialogElement && dialog.dataset.bookEditDialog === "true") {
		state.editingBookId = "";
	}
}, true);

refs.recommendForm.addEventListener("submit", (event) => {
	event.preventDefault();
	if (!state.recommendationBookId) {
		return;
	}
	(async () => {
		try {
			await apiRequest("/recommendations", {
				method: "POST",
				body: JSON.stringify({ bookId: state.recommendationBookId, friendId: refs.recommendFriend.value, note: refs.recommendNote.value })
			});
			refs.recommendDialog.close();
			showNotice("Recommendation sent.");
		} catch (error) {
			refs.recommendStatus.textContent = error instanceof Error ? error.message : "Unable to send recommendation right now.";
		}
	})();
});

refs.books.addEventListener("submit", (event) => {
	const form = event.target;
	if (!(form instanceof HTMLFormElement) || form.dataset.bookEditForm !== "true") {
		return;
	}

	event.preventDefault();
	const id = form.dataset.bookId || "";
	const idx = state.books.findIndex((book) => book.id === id);
	if (idx < 0) {
		return;
	}

	const existingBook = state.books[idx];
	const updatedBook = toBook(new FormData(form), existingBook);

	(async () => {
		try {
			const response = await apiRequest(`/books/${id}`, {
				method: "PUT",
				body: JSON.stringify(updatedBook)
			});
			state.books[idx] = response.book;
			state.editingBookId = "";
			rerender();
		} catch (error) {
			refs.progressCopy.textContent = error instanceof Error ? error.message : "Unable to update this book right now.";
		}
	})();
});

loadAuthToken();
refreshSession();
