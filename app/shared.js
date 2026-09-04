export const AUTH_TOKEN_STORAGE_KEY = "readers-corner-auth-token";
export const SESSION_AUTH_TOKEN_STORAGE_KEY = "readers-corner-session-auth-token";
export const AUTH_MESSAGE_STORAGE_KEY = "readers-corner-auth-message";
export const API_BASE = (() => {
	const configuredBase = String(window.READERS_COLLECTIVE_API_BASE || "").trim().replace(/\/+$/, "");
	if (configuredBase) {
		return configuredBase.endsWith("/api") ? configuredBase : `${configuredBase}/api`;
	}
	return window.location.protocol === "file:"
		? "http://localhost:3000/api"
		: `${window.location.origin}/api`;
})();
export const SITE_BASE = window.location.protocol === "file:"
	? "http://localhost:3000"
	: window.location.origin;
export const LOGIN_PAGE = window.location.protocol === "file:"
	? new URL("index.html", window.location.href).href
	: `${window.location.origin}/index.html`;
export const OPEN_LIBRARY_SEARCH_URL = "https://openlibrary.org/search.json";
export const GOOGLE_BOOKS_SEARCH_URL = "https://www.googleapis.com/books/v1/volumes";

export const GENRE_OPTIONS = [
	"Fantasy",
	"Science Fiction",
	"Mystery",
	"Thriller",
	"Romance",
	"Historical Fiction",
	"Literary Fiction",
	"Horror",
	"Adventure",
	"Crime",
	"Dystopian",
	"Young Adult",
	"Children's",
	"Nonfiction",
	"Biography",
	"Memoir",
	"Self-Help",
	"Business",
	"Philosophy",
	"Poetry",
	"Other"
];

export const state = {
	books: [],
	filter: "all",
	sort: "finished",
	genreFilter: "all",
	tagFilter: "all",
	shelfQuery: "",
	recommendationBookId: "",
	duplicateBookId: "",
	searchResults: [],
	friends: [],
	incomingFriendRequests: [],
	outgoingFriendRequests: [],
	activeFriendId: "",
	activeClubId: "",
	activeClubRoomId: "",
	activeClubRoomName: "",
	activeClubWorkspaceRoomId: "",
	activeClubWorkspaceRoomName: "",
	clubWorkspaceMessages: [],
	clubWorkspaceLoadError: "",
	chatMode: "direct",
	chatMessages: [],
	friendChatMessages: [],
	clubChatMessages: [],
	chatLoadError: "",
	friendChatLoadError: "",
	clubChatLoadError: "",
	unreadMessageCount: 0,
	bookClubs: [],
	clubInvitations: [],
	currentUser: null,
	authToken: "",
	editingBookId: "",
	typeaheadTimerId: null,
	latestSearchToken: 0
	,
	selectedSearchBook: null
	,
	recommendedBooks: []
	,
	finishRatingBookId: "",
	metadataPickerBookId: "",
	metadataCandidates: [],
	dismissedRecommendationKeys: [],
	friendRecommendations: [],
	trinkets: [],
	trinketStats: { finished: 0, owned: 0, wishlist: 0, friends: 0 },
	selectedInsightMonth: null
};

export const refs = {
	form: document.getElementById("book-form"),
	title: document.getElementById("title"),
	author: document.getElementById("author"),
	genre: document.getElementById("genre"),
	rating: document.getElementById("rating"),
	isRead: document.getElementById("is-read"),
	year: document.getElementById("year"),
	startedAt: document.getElementById("started-at"),
	finishedAt: document.getElementById("finished-at"),
	coverUrl: document.getElementById("cover-url"),
	bookCoverUpload: document.getElementById("book-cover-upload"),
	bookCoverUploadName: document.getElementById("book-cover-upload-name"),
	clearAll: document.getElementById("clear-all"),
	openClearDialog: document.getElementById("open-clear-dialog"),
	clearShelfDialog: document.getElementById("clear-shelf-dialog"),
	clearShelfConfirmation: document.getElementById("clear-shelf-confirmation"),
	viewNav: document.querySelector(".view-nav"),
	libraryView: document.getElementById("library-view"),
	wishlistView: document.getElementById("wishlist-view"),
	communityView: document.getElementById("community-view"),
	communityTabs: document.querySelector(".community-tabs"),
	communityMessageCount: document.getElementById("community-message-count"),
	communityRequestCount: document.getElementById("community-request-count"),
	activityList: document.getElementById("activity-list"),
	shelfView: document.getElementById("shelf-view"),
	bookshelfCanvas: document.getElementById("bookshelf-canvas"),
	resetBookshelfLayout: document.getElementById("reset-bookshelf-layout"),
	resetBookshelfDialog: document.getElementById("reset-bookshelf-dialog"),
	confirmResetBookshelf: document.getElementById("confirm-reset-bookshelf"),
	bookcaseColorBtn: document.getElementById("bookcase-color-btn"),
	bookcaseColorMenu: document.getElementById("bookcase-color-menu"),
	trinketTrayList: document.getElementById("trinket-tray-list"),
	appNotice: document.getElementById("app-notice"),
	nowReadingList: document.getElementById("now-reading-list"),
	wishlistList: document.getElementById("wishlist-list"),
	statusTabs: document.getElementById("status-tabs"),
	shelfSearch: document.getElementById("shelf-search"),
	genreFilter: document.getElementById("genre-filter"),
	tagFilter: document.getElementById("tag-filter"),
	sortView: document.getElementById("sort-view"),
	shelfMenuBtn: document.getElementById("shelf-menu-btn"),
	shelfMenuDialog: document.getElementById("shelf-menu-dialog"),
	books: document.getElementById("books"),
	statOwned: document.getElementById("stat-owned"),
	statRead: document.getElementById("stat-read"),
	statAverage: document.getElementById("stat-average"),
	statTop: document.getElementById("stat-top"),
	insightsList: document.getElementById("insights-list"),
	insightsScope: document.getElementById("insights-scope"),
	clearInsightsMonth: document.getElementById("clear-insights-month"),
	downloadShareCard: document.getElementById("download-share-card"),
	readProgress: document.getElementById("read-progress"),
	progressCopy: document.getElementById("progress-copy"),
	readingGoalForm: document.getElementById("reading-goal-form"),
	readingGoal: document.getElementById("reading-goal"),
	readingGoalStatus: document.getElementById("reading-goal-status"),
	goalProgress: document.getElementById("goal-progress"),
	goalProgressCopy: document.getElementById("goal-progress-copy"),
	monthlyHistory: document.getElementById("monthly-history"),
	friendForm: document.getElementById("friend-form"),
	openFriendDialog: document.getElementById("open-friend-dialog"),
	friendDialog: document.getElementById("friend-dialog"),
	friendEmail: document.getElementById("friend-email"),
	friendStatus: document.getElementById("friend-status"),
	friendsList: document.getElementById("friends-list"),
	bookClubsList: document.getElementById("book-clubs-list"),
	clubInvitations: document.getElementById("club-invitations"),
	clubWorkspaceDialog: document.getElementById("club-workspace-dialog"),
	clubWorkspaceTitle: document.getElementById("club-workspace-title"),
	clubWorkspaceContent: document.getElementById("club-workspace-content"),
	openClubDialog: document.getElementById("open-club-dialog"),
	bookClubDialog: document.getElementById("book-club-dialog"),
	bookClubForm: document.getElementById("book-club-form"),
	clubName: document.getElementById("club-name"),
	clubMemberOptions: document.getElementById("club-member-options"),
	bookClubStatus: document.getElementById("book-club-status"),
	chatRoomTitle: document.getElementById("chat-room-title"),
	chatMessages: document.getElementById("chat-messages"),
	chatForm: document.getElementById("chat-form"),
	chatText: document.getElementById("chat-text"),
	chatStatus: document.getElementById("chat-status"),
	clubChatRoomTitle: document.getElementById("club-chat-room-title"),
	clubChatMessages: document.getElementById("club-chat-messages"),
	clubChatForm: document.getElementById("club-chat-form"),
	clubChatText: document.getElementById("club-chat-text"),
	clubChatStatus: document.getElementById("club-chat-status"),
	friendProfile: document.getElementById("friend-profile"),
	recommendationsList: document.getElementById("recommendations-list"),
	recommendDialog: document.getElementById("recommend-dialog"),
	recommendForm: document.getElementById("recommend-form"),
	recommendBookTitle: document.getElementById("recommend-book-title"),
	recommendFriend: document.getElementById("recommend-friend"),
	recommendNote: document.getElementById("recommend-note"),
	recommendStatus: document.getElementById("recommend-status"),
	searchInput: document.getElementById("book-search"),
	searchBtn: document.getElementById("search-btn"),
	searchStatus: document.getElementById("search-status"),
	searchResults: document.getElementById("search-results"),
	recommendationsCopy: document.getElementById("recommendations-copy"),
	shelfRecommendationsList: document.getElementById("shelf-recommendations-list"),
	refreshRecommendations: document.getElementById("refresh-recommendations"),
	recommendationInfoDialog: document.getElementById("recommendation-info-dialog"),
	recommendationInfoTitle: document.getElementById("recommendation-info-title"),
	recommendationInfoMeta: document.getElementById("recommendation-info-meta"),
	recommendationInfoRating: document.getElementById("recommendation-info-rating"),
	recommendationInfoBlurb: document.getElementById("recommendation-info-blurb"),
	metadataPickerDialog: document.getElementById("metadata-picker-dialog"),
	metadataPickerTitle: document.getElementById("metadata-picker-title"),
	metadataPickerStatus: document.getElementById("metadata-picker-status"),
	metadataPickerResults: document.getElementById("metadata-picker-results"),
	finishRatingDialog: document.getElementById("finish-rating-dialog"),
	finishRatingForm: document.getElementById("finish-rating-form"),
	finishRatingTitle: document.getElementById("finish-rating-title"),
	finishRating: document.getElementById("finish-rating"),
	finishRatingReview: document.getElementById("finish-rating-review"),
	finishRatingStatus: document.getElementById("finish-rating-status"),
	searchBookDialog: document.getElementById("search-book-dialog"),
	searchBookForm: document.getElementById("search-book-form"),
	selectedBookTitle: document.getElementById("selected-book-title"),
	selectedBookMeta: document.getElementById("selected-book-meta"),
	duplicateBookNotice: document.getElementById("duplicate-book-notice"),
	saveSearchBook: document.getElementById("save-search-book"),
	addDuplicateBook: document.getElementById("add-duplicate-book"),
	searchBookRating: document.getElementById("search-book-rating"),
	searchBookRatingField: document.getElementById("search-book-rating-field"),
	searchBookReadingFields: document.getElementById("search-book-reading-fields"),
	searchBookFinishedAtField: document.getElementById("search-book-finished-at-field"),
	searchBookCurrentPageField: document.getElementById("search-book-current-page-field"),
	searchBookStartedAt: document.getElementById("search-book-started-at"),
	searchBookFinishedAt: document.getElementById("search-book-finished-at"),
	searchBookPageCount: document.getElementById("search-book-page-count"),
	searchBookCurrentPage: document.getElementById("search-book-current-page"),
	searchBookSeriesName: document.getElementById("search-book-series-name"),
	searchBookSeriesPosition: document.getElementById("search-book-series-position"),
	searchBookStatus: document.getElementById("search-book-status"),
	settingsForm: document.getElementById("settings-form"),
	settingsDialog: document.getElementById("settings-dialog"),
	settingsBtn: document.getElementById("settings-btn"),
	settingsUsername: document.getElementById("settings-username"),
	settingsEmail: document.getElementById("settings-email"),
	settingsPassword: document.getElementById("settings-password"),
	settingsAvatar: document.getElementById("settings-avatar"),
	settingsAvatarName: document.getElementById("settings-avatar-name"),
	weeklySummaryEnabled: document.getElementById("weekly-summary-enabled"),
	readingRemindersEnabled: document.getElementById("reading-reminders-enabled"),
	profileBooksVisible: document.getElementById("profile-books-visible"),
	profileActivityVisible: document.getElementById("profile-activity-visible"),
	settingsStatus: document.getElementById("settings-status"),
	openDeleteAccountDialog: document.getElementById("open-delete-account-dialog"),
	deleteAccountDialog: document.getElementById("delete-account-dialog"),
	deleteAccountConfirmation: document.getElementById("delete-account-confirmation"),
	confirmDeleteAccount: document.getElementById("confirm-delete-account"),
	bookDetailsDialog: document.getElementById("book-details-dialog"),
	bookDetailsTitle: document.getElementById("book-details-title"),
	bookDetailsContent: document.getElementById("book-details-content"),
	downloadJson: document.getElementById("download-json"),
	downloadCsv: document.getElementById("download-csv"),
	libraryImportFile: document.getElementById("library-import-file"),
	libraryImportFileName: document.getElementById("library-import-file-name"),
	importLibrary: document.getElementById("import-library"),
	profileAvatar: document.getElementById("profile-avatar"),
	accountEmail: document.getElementById("account-email"),
	accountNote: document.getElementById("account-note"),
	logoutBtn: document.getElementById("logout-btn"),
	viewMyProfileBtn: document.getElementById("view-my-profile-btn")
};

export function createId() {
	return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function normalizeEmail(email) {
	return String(email || "").trim().toLowerCase();
}

let noticeTimerId = null;

export function showNotice(message) {
	refs.appNotice.textContent = message;
	refs.appNotice.classList.add("visible");
	if (noticeTimerId !== null) {
		clearTimeout(noticeTimerId);
	}
	noticeTimerId = setTimeout(() => {
		refs.appNotice.classList.remove("visible");
	}, 3500);
}

export function capitalizeGenreLabel(value) {
	return String(value || "")
		.trim()
		.replace(/\s+/g, " ")
		.split(" ")
		.map((word) => {
			if (!word) {
				return word;
			}
			return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
		})
		.join(" ");
}

export function avatarPlaceholder(email) {
	const source = String(email || "Reader").trim();
	const initial = source.charAt(0).toUpperCase() || "R";
	const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='96' height='96'><defs><linearGradient id='g' x1='0' x2='1' y1='0' y2='1'><stop offset='0%' stop-color='#f3dc9a'/><stop offset='100%' stop-color='#88a9bd'/></linearGradient></defs><rect width='96' height='96' rx='48' fill='url(#g)'/><text x='50%' y='56%' text-anchor='middle' font-size='44' fill='#1f2a35' font-family='Segoe UI, sans-serif'>${initial}</text></svg>`;
	return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

export function getUploadedAssetUrl(value) {
	const assetPath = String(value || "").trim();
	return assetPath.startsWith("/uploads/") ? new URL(assetPath, API_BASE).href : assetPath;
}

export function getAvatarUrl(user) {
	if (user && user.avatarUrl) {
		return getUploadedAssetUrl(user.avatarUrl);
	}
	return avatarPlaceholder(user ? user.email : "Reader");
}

export function escapeHtml(value) {
	return String(value)
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}

export function friendLabel(friend) {
	return friend && (friend.username || friend.email) ? friend.username || friend.email : "Unknown friend";
}

export function formatChatTime(value) {
	const time = Number(value || Date.now());
	const date = Number.isFinite(time) ? new Date(time) : new Date();
	return new Intl.DateTimeFormat(undefined, {
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit"
	}).format(date);
}

export function validEmail(email) {
	const normalized = normalizeEmail(email);
	return normalized.includes("@") && normalized.includes(".");
}

export function saveAuthToken() {
	if (!state.authToken) {
		localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
		sessionStorage.removeItem(SESSION_AUTH_TOKEN_STORAGE_KEY);
		return;
	}
	if (sessionStorage.getItem(SESSION_AUTH_TOKEN_STORAGE_KEY)) {
		sessionStorage.setItem(SESSION_AUTH_TOKEN_STORAGE_KEY, state.authToken);
		return;
	}
	localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, state.authToken);
}

export function loadAuthToken() {
	state.authToken = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)
		|| sessionStorage.getItem(SESSION_AUTH_TOKEN_STORAGE_KEY)
		|| "";
}

export async function apiRequest(path, options = {}) {
	const headers = {
		...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
		...(options.headers || {})
	};

	if (state.authToken) {
		headers.Authorization = `Bearer ${state.authToken}`;
	}

	let response;
	try {
		response = await fetch(`${API_BASE}${path}`, {
			...options,
			headers
		});
	} catch {
		throw new Error(`Unable to reach the backend at ${API_BASE}. Check the connection, turn off VPN/private relay temporarily, or try again after the server wakes up.`);
	}

	let payload = null;
	const text = await response.text();
	if (text) {
		try {
			payload = JSON.parse(text);
		} catch {
			payload = null;
		}
	}

	if (!response.ok) {
		const message = payload && payload.message
			? payload.message
			: response.status === 404
				? `Backend API route not found at ${API_BASE}${path}. Deploy the Node server or set READERS_COLLECTIVE_API_BASE to your backend URL.`
				: `Request failed (${response.status})`;
		const error = new Error(message);
		error.status = response.status;
		throw error;
	}

	return payload;
}
