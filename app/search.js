import {
	OPEN_LIBRARY_SEARCH_URL,
	GOOGLE_BOOKS_SEARCH_URL,
	state,
	refs,
	createId,
	capitalizeGenreLabel,
	escapeHtml
} from "./shared.js";

const SEARCH_BUTTON_LABEL = "Search Books";
const TYPEAHEAD_DELAY_MS = 300;
const SEARCH_TIMEOUT_MS = 9000;
const GOOGLE_BOOKS_TIMEOUT_MS = 4000;
const OPEN_LIBRARY_SEARCH_TIMEOUT_MS = 4000;
const GENRE_PATTERNS = [
	{ label: "Fantasy", patterns: [/\bfantas(y|ies)\b/i, /\bhigh fantasy\b/i, /\bepic fantasy\b/i, /\bsword and sorcery\b/i, /\bspeculative fiction\b/i] },
	{ label: "Science Fiction", patterns: [/\bscience fiction\b/i, /\bsci[- ]?fi\b/i, /\bspace opera\b/i] },
	{ label: "Mystery", patterns: [/\bmystery\b/i, /\bdetective fiction\b/i, /\bwhodunits?\b/i] },
	{ label: "Thriller", patterns: [/\bthriller\b/i, /\bsuspense fiction\b/i, /\bpsychological thriller\b/i] },
	{ label: "Romance", patterns: [/\bromance\b/i, /\bromantic fiction\b/i] },
	{ label: "Historical Fiction", patterns: [/\bhistorical fiction\b/i, /\bhistorical novel\b/i, /\bhistorical romance\b/i] },
	{ label: "Literary Fiction", patterns: [/\bliterary fiction\b/i] },
	{ label: "Horror", patterns: [/\bhorror\b/i, /\bsupernatural horror\b/i, /\bghost stories?\b/i] },
	{ label: "Adventure", patterns: [/\badventure\b/i, /\badventure stories?\b/i] },
	{ label: "Crime", patterns: [/\bcrime\b/i, /\bcrime fiction\b/i, /\bnoir\b/i] },
	{ label: "Dystopian", patterns: [/\bdystopian\b/i, /\bpost-apocalyptic\b/i, /\bapocalyptic fiction\b/i] },
	{ label: "Young Adult", patterns: [/\byoung adult\b/i, /\bya fiction\b/i] },
	{ label: "Children's", patterns: [/\bchildren'?s\b/i, /\bchildren fiction\b/i, /\bjuvenile fiction\b/i] },
	{ label: "Nonfiction", patterns: [/\bnonfiction\b/i, /\bnon-fiction\b/i] },
	{ label: "Biography", patterns: [/\bbiography\b/i, /\bbiographies\b/i, /\bautobiography\b/i] },
	{ label: "Memoir", patterns: [/\bmemoir\b/i, /\bmemoirs\b/i] },
	{ label: "Self-Help", patterns: [/\bself-help\b/i, /\bself help\b/i] },
	{ label: "Business", patterns: [/\bbusiness\b/i, /\bentrepreneurship\b/i] },
	{ label: "Philosophy", patterns: [/\bphilosophy\b/i, /\bphilosophical\b/i] },
	{ label: "Poetry", patterns: [/\bpoetry\b/i, /\bpoems?\b/i] }
];
const FALLBACK_GENRE_SIGNAL = /\b(fiction|novel|novels|story|stories|poetry|poems|horror|romance|mystery|thriller|adventure|crime|dystopian|fantasy|science fiction|sci[- ]?fi|biography|memoir|self-help|business|philosophy|young adult|children'?s|nonfiction|non-fiction)\b/i;

function setSearchLoading(isLoading) {
	refs.searchBtn.disabled = isLoading || !state.currentUser;
	refs.searchBtn.classList.toggle("is-loading", isLoading);
	refs.searchBtn.setAttribute("aria-busy", isLoading ? "true" : "false");
	refs.searchBtn.textContent = isLoading ? "Searching" : SEARCH_BUTTON_LABEL;
}

function renderSearchResults() {
	if (!state.searchResults.length) {
		refs.searchResults.innerHTML = "";
		return;
	}

	refs.searchResults.innerHTML = state.searchResults.map((book, index) => {
		const yearText = book.year || "Unknown year";
		const authorText = book.author || "Unknown author";
		const genreText = book.genre ? capitalizeGenreLabel(book.genre) : "Unknown genre";
		return `
			<article class="search-item">
				${book.coverUrl ? `<img class="search-cover" src="${escapeHtml(book.coverUrl)}" alt="Cover of ${escapeHtml(book.title)}">` : '<div class="search-cover placeholder" aria-hidden="true">Book</div>'}
				<div>
					<h3>${escapeHtml(book.title)}</h3>
					<p>${escapeHtml(authorText)} • ${escapeHtml(String(yearText))} • ${escapeHtml(genreText)}</p>
				</div>
				<button type="button" data-search-index="${index}">Use This</button>
			</article>
		`;
	}).join("");
}

function renderShelfRecommendations() {
	if (!state.recommendedBooks.length) {
		refs.shelfRecommendationsList.innerHTML = '<div class="recommendations-empty">No new recommendations yet.</div>';
		return;
	}
	refs.shelfRecommendationsList.innerHTML = state.recommendedBooks.map((book, index) => `
		<article class="shelf-recommendation">
			${book.coverUrl ? `<img src="${escapeHtml(book.coverUrl)}" alt="Cover of ${escapeHtml(book.title)}">` : '<div class="recommendation-cover placeholder" aria-hidden="true">Book</div>'}
			<div><h4>${escapeHtml(book.title)}</h4><p>${escapeHtml(book.author || "Unknown author")}</p><div class="recommendation-actions"><button type="button" data-recommendation-index="${index}">Add book</button><button type="button" data-recommendation-info-index="${index}">More info</button><button type="button" data-recommendation-dismiss-index="${index}">Not interested</button></div></div>
		</article>
	`).join("");
}

function catalogDescription(value) {
	if (typeof value === "string") return value.trim();
	if (value && typeof value.value === "string") return value.value.trim();
	return "";
}

function pickBestGenreFromSubjects(subjects) {
	if (!Array.isArray(subjects) || !subjects.length) {
		return "";
	}

	const canonicalCandidates = [];
	const fallbackCandidates = [];

	for (const subject of subjects) {
		const cleaned = String(subject || "").trim().replace(/\s+/g, " ");
		if (!cleaned) {
			continue;
		}

		const normalized = cleaned.toLowerCase();
		for (const entry of GENRE_PATTERNS) {
			if (normalized === entry.label.toLowerCase()) {
				canonicalCandidates.push({ label: entry.label, score: 1000 });
				break;
			}
			if (entry.patterns.some((pattern) => pattern.test(cleaned))) {
				canonicalCandidates.push({ label: entry.label, score: 900 - entry.label.length });
				break;
			}
		}

		if (!FALLBACK_GENRE_SIGNAL.test(cleaned)) {
			continue;
		}

		const words = cleaned.split(" ").length;
		const hasHierarchy = cleaned.includes(" -- ") || cleaned.includes("/");
		const hasProperNounShape = words === 1 && /^[A-Z][a-z]+(?:'[A-Za-z]+)?$/.test(cleaned);
		const score = words * 10 + (hasHierarchy ? 10 : 0) + (cleaned.length > 32 ? 10 : 0) - (hasProperNounShape ? 25 : 0);
		fallbackCandidates.push({ label: cleaned, score });
	}

	if (canonicalCandidates.length) {
		canonicalCandidates.sort((left, right) => right.score - left.score || left.label.localeCompare(right.label));
		return canonicalCandidates[0].label;
	}

	fallbackCandidates.sort((left, right) => right.score - left.score || left.label.localeCompare(right.label));
	return fallbackCandidates[0] ? capitalizeGenreLabel(fallbackCandidates[0].label) : "";
}

function pickGenreFromDoc(doc) {
	if (typeof doc.genre === "string" && doc.genre.trim()) {
		return capitalizeGenreLabel(doc.genre);
	}

	if (Array.isArray(doc.subjects) && doc.subjects.length) {
		const subjectGenre = pickBestGenreFromSubjects(doc.subjects);
		if (subjectGenre) {
			return subjectGenre;
		}
	}

	const subjectLists = [];
	if (Array.isArray(doc.subject_facet)) {
		subjectLists.push(...doc.subject_facet);
	}
	if (Array.isArray(doc.subject)) {
		subjectLists.push(...doc.subject);
	}
	const subjectGenre = pickBestGenreFromSubjects(subjectLists);
	if (subjectGenre) {
		return subjectGenre;
	}

	const ignored = new Set(["fiction", "nonfiction", "non-fiction", "books", "book", "literature", "novels", "novel", "general", "history", "children", "childrens", "juvenile", "ebook"]);
	const broadHints = ["fiction", "nonfiction", "non-fiction", "literature", "history", "children", "childrens", "juvenile", "general", "books", "book"];
	const scoredSubjects = [];

	for (const subject of subjectLists) {
		const cleaned = String(subject || "").trim().replace(/\s+/g, " ");
		if (!cleaned) {
			continue;
		}
		const normalized = cleaned.toLowerCase();
		if (ignored.has(normalized)) {
			continue;
		}
		if (broadHints.some((hint) => normalized === hint || normalized.startsWith(`${hint} `) || normalized.includes(` ${hint} `))) {
			continue;
		}
		const words = cleaned.split(" ").length;
		const hasHierarchy = cleaned.includes(" -- ") || cleaned.includes("/");
		const score = words * 10 + (hasHierarchy ? 10 : 0) + (cleaned.length > 32 ? 10 : 0);
		scoredSubjects.push({ cleaned, score });
	}

	scoredSubjects.sort((left, right) => left.score - right.score || left.cleaned.localeCompare(right.cleaned));
	return scoredSubjects[0] ? capitalizeGenreLabel(scoredSubjects[0].cleaned) : "";
}

function parseSearchQuery(query) {
	const normalized = String(query || "").trim();
	const genreMatch = normalized.match(/^(?:genre|subject|g)\s*:\s*(.+)$/i);
	if (genreMatch && genreMatch[1]) {
		return { mode: "genre", term: genreMatch[1].trim() };
	}
	const seriesMatch = normalized.match(/^(?:series|s)\s*:\s*(.+)$/i);
	if (seriesMatch && seriesMatch[1]) {
		return { mode: "series", term: seriesMatch[1].trim() };
	}
	return { mode: "text", term: normalized };
}

async function loadOpenLibraryWorkDoc(doc) {
	const key = String(doc && doc.key ? doc.key : "").trim();
	if (!key) {
		return null;
	}

	try {
		const response = await fetchWithTimeout(`https://openlibrary.org${key}.json`);
		if (!response.ok) {
			return null;
		}
		return await response.json();
	} catch {
		return null;
	}
}

function extractSeriesFromTitle(title) {
	if (!title) {
		return { seriesName: "", seriesPosition: 0 };
	}

	const titleStr = String(title).trim();

	// Fallback: Known series patterns for when Open Library API data is unavailable
	// These are common series that work reliably when API fails
	const knownPatterns = [
		// "Red Rising" series: 6 books
		{ titles: ["Red Rising", "Golden Son", "Morning Star", "Iron Gold", "Dark Age", "Light Bringer"], series: "Red Rising" },
		// "Hunger Games" series
		{ titles: ["The Hunger Games", "Catching Fire", "Mockingjay"], series: "The Hunger Games" },
		// "Harry Potter" series
		{ titles: ["Harry Potter and the Philosopher's Stone", "Harry Potter and the Chamber of Secrets", "Harry Potter and the Prisoner of Azkaban", "Harry Potter and the Goblet of Fire", "Harry Potter and the Order of the Phoenix", "Harry Potter and the Half-Blood Prince", "Harry Potter and the Deathly Hallows"], series: "Harry Potter" },
	];

	for (const pattern of knownPatterns) {
		const index = pattern.titles.findIndex(t => t.toLowerCase() === titleStr.toLowerCase());
		if (index !== -1) {
			return { seriesName: pattern.series, seriesPosition: index + 1 };
		}
	}

	return { seriesName: "", seriesPosition: 0 };
}

function extractSeriesInfo(workDoc) {
	if (!workDoc) {
		return { seriesName: "", seriesPosition: 0 };
	}

	// Check for series array (primary method)
	if (workDoc.series && Array.isArray(workDoc.series) && workDoc.series.length > 0) {
		const series = workDoc.series[0];
		const seriesName = String(series.name || "").trim();
		let seriesPosition = 0;

		if (series.sequence) {
			const match = String(series.sequence).match(/^#?(\d+)/);
			if (match && match[1]) {
				seriesPosition = parseInt(match[1], 10);
			}
		}

		if (seriesName) {
			return { seriesName, seriesPosition };
		}
	}

	// Check for series as object (alternate format)
	if (workDoc.series && typeof workDoc.series === "object" && !Array.isArray(workDoc.series)) {
		const seriesName = String(workDoc.series.name || "").trim();
		let seriesPosition = 0;

		if (workDoc.series.sequence) {
			const match = String(workDoc.series.sequence).match(/^#?(\d+)/);
			if (match && match[1]) {
				seriesPosition = parseInt(match[1], 10);
			}
		}

		if (seriesName) {
			return { seriesName, seriesPosition };
		}
	}

	// Check for series_id field and try to extract from subjects
	if (workDoc.subjects && Array.isArray(workDoc.subjects)) {
		for (const subject of workDoc.subjects) {
			const subjectStr = String(subject || "").trim();
			// Look for patterns like "Title series" or "Title (series)"
			const seriesMatch = subjectStr.match(/^(.+?)\s+(?:series|books?(?:\s+in\s+)?)?(?:\(\s*series\s*\))?$/i);
			if (seriesMatch && seriesMatch[1]) {
				const potentialSeriesName = seriesMatch[1].trim();
				// Only return if it looks like a series name (not too generic)
				if (potentialSeriesName.length > 2 && !potentialSeriesName.match(/^(fiction|novel|story|book)$/i)) {
					return { seriesName: potentialSeriesName, seriesPosition: 0 };
				}
			}
		}
	}

	return { seriesName: "", seriesPosition: 0 };
}

function mapSearchDocs(docs) {
	const items = docs.slice(0, 8);
	return items.map((doc) => {
		const seriesInfo = extractSeriesFromTitle(doc.title);
		return {
			id: createId(),
			title: doc.title || "Untitled",
			author: Array.isArray(doc.author_name) ? doc.author_name[0] || "" : "",
			year: Number.isFinite(Number(doc.first_publish_year)) ? Number(doc.first_publish_year) : "",
			genre: pickGenreFromDoc(doc),
			coverUrl: Number.isInteger(Number(doc.cover_i)) ? `https://covers.openlibrary.org/b/id/${Number(doc.cover_i)}-M.jpg` : "",
			blurb: catalogDescription(doc.description),
			catalogRating: Number(doc.ratings_average) || 0,
			key: doc.key || "",
			seriesName: seriesInfo.seriesName,
			seriesPosition: seriesInfo.seriesPosition
		};
	});
}

async function fetchBooksFromUrl(url, timeoutMs = OPEN_LIBRARY_SEARCH_TIMEOUT_MS) {
	let response;
	try {
		response = await fetchWithTimeout(url, timeoutMs);
	} catch (error) {
		const detail = error instanceof Error && error.message ? error.message : String(error);
		throw new Error(`Search request failed for ${url} (${detail})`);
	}
	if (!response.ok) {
		throw new Error(`Search failed for ${url} (${response.status})`);
	}
	const data = await response.json();
	const docs = Array.isArray(data.docs) ? data.docs : [];
	return mapSearchDocs(docs);
}

async function fetchWithTimeout(url, timeoutMs = SEARCH_TIMEOUT_MS) {
	const controller = new AbortController();
	const timer = setTimeout(() => {
		controller.abort();
	}, timeoutMs);

	try {
		return await fetch(url, { signal: controller.signal });
	} catch (error) {
		if (error && typeof error === "object" && "name" in error && error.name === "AbortError") {
			throw new Error(`Request timed out after ${Math.round(timeoutMs / 1000)} seconds.`);
		}
		throw error;
	} finally {
		clearTimeout(timer);
	}
}

function pickGenreFromGutendex(book) {
	const subjects = Array.isArray(book.subjects) ? book.subjects : [];
	const matched = pickBestGenreFromSubjects(subjects);
	if (matched) {
		return matched;
	}
	return "Other";
}

async function fetchBooksFromGutendex(term) {
	const response = await fetchWithTimeout(`${GUTENDEX_SEARCH_URL}?search=${encodeURIComponent(term)}`);
	if (!response.ok) {
		throw new Error(`Fallback catalog failed (${response.status})`);
	}

	const data = await response.json();
	const results = Array.isArray(data.results) ? data.results.slice(0, 8) : [];
	return results.map((book) => {
		const authors = Array.isArray(book.authors) ? book.authors : [];
		const firstAuthor = authors[0] && authors[0].name ? String(authors[0].name).trim() : "";
		const year = Number(authors[0] && authors[0].birth_year ? authors[0].birth_year : "");
		const normalizedYear = Number.isFinite(year) ? year : "";
		return {
			id: createId(),
			title: book.title || "Untitled",
			author: firstAuthor,
			year: normalizedYear,
			genre: pickGenreFromGutendex(book),
			coverUrl: String(book.formats && book.formats["image/jpeg"] ? book.formats["image/jpeg"] : ""),
			blurb: String(book.summaries && book.summaries[0] ? book.summaries[0] : ""),
			catalogRating: 0,
			key: String(book.id || "")
		};
	});
}

function pickGenreFromGoogleBooks(volumeInfo) {
	const categories = Array.isArray(volumeInfo.categories) ? volumeInfo.categories : [];
	const matched = pickBestGenreFromSubjects(categories);
	return matched || "Other";
}

async function fetchBooksFromGoogleBooks(term, mode = "text") {
	const query = mode === "genre" ? `subject:${term}` : term;
	const fields = "items(id,volumeInfo(title,authors,publishedDate,categories,imageLinks,description,averageRating))";
	const response = await fetchWithTimeout(`${GOOGLE_BOOKS_SEARCH_URL}?q=${encodeURIComponent(query)}&maxResults=8&fields=${encodeURIComponent(fields)}`, GOOGLE_BOOKS_TIMEOUT_MS);
	if (!response.ok) {
		throw new Error(`Google Books search failed (${response.status})`);
	}

	const data = await response.json();
	const items = Array.isArray(data.items) ? data.items.slice(0, 8) : [];
	return items.map((item) => {
		const info = item.volumeInfo || {};
		const authors = Array.isArray(info.authors) ? info.authors : [];
		const seriesInfo = extractSeriesFromTitle(info.title);
		const year = Number.parseInt(String(info.publishedDate || "").slice(0, 4), 10);
		const imageLinks = info.imageLinks || {};
		const coverUrl = String(imageLinks.thumbnail || imageLinks.smallThumbnail || "").replace(/^http:/, "https:");
		return {
			id: createId(),
			title: info.title || "Untitled",
			author: authors[0] || "",
			year: Number.isFinite(year) ? year : "",
			genre: pickGenreFromGoogleBooks(info),
			coverUrl,
			blurb: String(info.description || ""),
			catalogRating: Number(info.averageRating) || 0,
			key: String(item.id || ""),
			seriesName: seriesInfo.seriesName,
			seriesPosition: seriesInfo.seriesPosition
		};
	});
}

async function fetchBooksByText(term) {
	const fields = "key,title,author_name,first_publish_year,cover_i,subject,subject_facet,ratings_average,description";
	const url = `${OPEN_LIBRARY_SEARCH_URL}?q=${encodeURIComponent(term)}&limit=12&fields=${encodeURIComponent(fields)}`;
	return fetchBooksFromUrl(url);
}

async function fetchBooksByGenre(term) {
	const fields = "key,title,author_name,first_publish_year,cover_i,subject,subject_facet,ratings_average,description";
	const url = `${OPEN_LIBRARY_SEARCH_URL}?subject=${encodeURIComponent(term)}&limit=12&fields=${encodeURIComponent(fields)}`;
	return fetchBooksFromUrl(url);
}

async function similarSubjectsForBook(book) {
	const url = `${OPEN_LIBRARY_SEARCH_URL}?title=${encodeURIComponent(book.title)}&author=${encodeURIComponent(book.author || "")}&limit=1`;
	try {
		const response = await fetchWithTimeout(url);
		if (!response.ok) return [];
		const data = await response.json();
		const subjects = Array.isArray(data.docs?.[0]?.subject) ? data.docs[0].subject : [];
		return subjects
			.map((subject) => String(subject || "").trim())
			.filter((subject) => subject && subject.length <= 42 && !/^(fiction|books|literature|novels?)$/i.test(subject))
			.slice(0, 2);
	} catch {
		return [];
	}
}

function getSearchErrorMessage(error) {
	if (!error) {
		return "Search failed.";
	}
	if (error instanceof Error && error.message) {
		return error.message;
	}
	return String(error);
}

export function clearSearchUi(statusText = "") {
	state.searchResults = [];
	renderSearchResults();
	refs.searchStatus.textContent = statusText;
	setSearchLoading(false);
}

export async function runSearch(queryOverride) {
	if (!state.currentUser) {
		clearSearchUi("Sign in to search and add books.");
		return;
	}

	const query = typeof queryOverride === "string" ? queryOverride.trim() : refs.searchInput.value.trim();
	if (!query) {
		clearSearchUi("Type a title, author, or series to search.");
		return;
	}

	const searchSpec = parseSearchQuery(query);
	const searchToken = ++state.latestSearchToken;
	refs.searchStatus.textContent = searchSpec.mode === "genre" ? "Searching Open Library by genre..." : searchSpec.mode === "series" ? "Searching Open Library for a series..." : "Searching Open Library...";
	setSearchLoading(true);

	try {
		let fallbackResults = searchSpec.mode === "genre"
			? await fetchBooksByGenre(searchSpec.term)
			: await fetchBooksByText(searchSpec.term);
		if (searchToken !== state.latestSearchToken) {
			return;
		}
		if (searchSpec.mode === "series") {
			fallbackResults = fallbackResults.map((book) => ({
				...book,
				seriesName: book.seriesName || searchSpec.term
			}));
		}
		state.searchResults = fallbackResults;
		renderSearchResults();
		if (!fallbackResults.length) {
			refs.searchStatus.textContent = "No matches found. Try a different search term.";
		} else {
			refs.searchStatus.textContent = `Found ${fallbackResults.length} matches. Choose one to autofill.${searchSpec.mode === "series" ? " The series name will be filled in." : ""}`;
		}
	} catch (error) {
		if (searchToken !== state.latestSearchToken) {
			return;
		}
		clearSearchUi(`Search is unavailable right now. Please try again. ${getSearchErrorMessage(error)}`);
	} finally {
		if (searchToken === state.latestSearchToken) {
			setSearchLoading(false);
		}
	}
}

export async function refreshShelfRecommendations() {
	if (!state.currentUser) return;
	const genreScores = new Map();
	const authorScores = new Map();
	const tasteBooks = state.books.filter((book) => book.isOwned && book.isRead && Number(book.rating) >= 3);
	for (const book of (tasteBooks.length ? tasteBooks : state.books.filter((book) => book.isOwned))) {
		const genre = capitalizeGenreLabel(book.genre);
		if (genre) genreScores.set(genre, (genreScores.get(genre) || 0) + Number(book.rating || 0));
		const author = String(book.author || "").trim();
		if (author) authorScores.set(author, (authorScores.get(author) || 0) + Number(book.rating || 0));
	}
	const preferredGenres = [...genreScores.entries()].sort((left, right) => right[1] - left[1]).map(([genre]) => genre).slice(0, 1);
	const preferredAuthors = [...authorScores.entries()].sort((left, right) => right[1] - left[1]).map(([author]) => author).slice(0, 2);
	if (!preferredAuthors.length && !preferredGenres.length) {
		refs.recommendationsCopy.textContent = "Add rated books with an author or genre to get tailored recommendations.";
		state.recommendedBooks = [];
		renderShelfRecommendations();
		return;
	}
	refs.refreshRecommendations.disabled = true;
	refs.recommendationsCopy.textContent = "Finding picks from your full shelf...";
	try {
		const terms = [...preferredGenres.map((genre) => ({ type: "genre", value: genre })), ...preferredAuthors.slice(0, 1).map((author) => ({ type: "author", value: author }))];
		const results = await Promise.all(terms.map((term) => term.type === "author" ? fetchBooksByText(`author:${term.value}`) : fetchBooksByGenre(term.value)));
		const savedTitles = new Set(state.books.map((book) => String(book.title || "").trim().toLowerCase()));
		const dismissed = new Set(state.dismissedRecommendationKeys);
		const recommendedTitles = new Set();
		state.recommendedBooks = results.flat().filter((book) => {
			const title = String(book.title || "").trim().toLowerCase();
			const key = `${title}::${String(book.author || "").trim().toLowerCase()}`;
			if (!title || savedTitles.has(title) || dismissed.has(key) || recommendedTitles.has(title)) return false;
			recommendedTitles.add(title);
			return true;
		}).slice(0, 8);
		const basis = preferredAuthors.length ? `${preferredAuthors.join(", ")}${preferredGenres.length ? ` and ${preferredGenres.join(" / ")}` : ""}` : preferredGenres.join(" / ");
		refs.recommendationsCopy.textContent = state.recommendedBooks.length ? `Based on ${basis}.` : `No new picks found based on ${basis}.`;
		renderShelfRecommendations();
	} catch {
		state.recommendedBooks = [];
		refs.recommendationsCopy.textContent = "Recommendations are unavailable right now.";
		renderShelfRecommendations();
	} finally {
		refs.refreshRecommendations.disabled = false;
	}
}

export function scheduleTypeaheadSearch() {
	if (!state.currentUser) {
		return;
	}

	const query = refs.searchInput.value.trim();
	if (!query) {
		state.latestSearchToken += 1;
		clearSearchUi("Type a title, author, or series to search.");
		if (state.typeaheadTimerId !== null) {
			clearTimeout(state.typeaheadTimerId);
			state.typeaheadTimerId = null;
		}
		return;
	}

	if (query.length < 2) {
		clearSearchUi("Keep typing to search known books by title or genre...");
		return;
	}

	if (state.typeaheadTimerId !== null) {
		clearTimeout(state.typeaheadTimerId);
	}

	state.typeaheadTimerId = setTimeout(() => {
		state.typeaheadTimerId = null;
		runSearch(query);
	}, TYPEAHEAD_DELAY_MS);
}

export function applySearchResult(index) {
	const book = state.searchResults[index];
	if (!book) {
		return;
	}

	const normalized = (value) => String(value || "").trim().toLocaleLowerCase().replace(/\s+/g, " ");
	const matchingBook = state.books.find((savedBook) => normalized(savedBook.title) === normalized(book.title) && normalized(savedBook.author) === normalized(book.author));
	state.selectedSearchBook = book;
	state.duplicateBookId = matchingBook ? matchingBook.id : "";
	refs.selectedBookTitle.textContent = book.title || "Untitled";
	refs.selectedBookMeta.textContent = [book.author || "Unknown author", book.year || "Unknown year", capitalizeGenreLabel(book.genre) || "Unknown genre"].join(" | ");
	refs.searchBookForm.reset();
	const initialStatus = matchingBook ? (matchingBook.isRead ? "finished" : matchingBook.isOwned ? "own" : "want") : "want";
	const statusRadio = refs.searchBookForm.querySelector(`input[name='shelfStatus'][value='${initialStatus}']`);
	if (statusRadio) {
		statusRadio.checked = true;
	}
	refs.searchBookRating.value = matchingBook?.rating ? Number(matchingBook.rating).toFixed(2) : "2.5";
	refs.searchBookReadingFields.hidden = initialStatus === "want";
	refs.searchBookFinishedAtField.hidden = initialStatus !== "finished";
	refs.searchBookRatingField.hidden = initialStatus !== "finished";
	refs.searchBookRating.required = initialStatus === "finished";
	refs.searchBookStartedAt.value = matchingBook?.startedAt || "";
	refs.searchBookFinishedAt.value = matchingBook?.finishedAt || "";
	refs.searchBookSeriesName.value = book.seriesName || "";
	refs.searchBookSeriesPosition.value = book.seriesPosition || "";
	refs.searchBookPageCount.value = book.pageCount || (matchingBook ? matchingBook.pageCount || "" : "");
	refs.searchBookCurrentPage.value = matchingBook ? matchingBook.currentPage || "" : "";
	refs.duplicateBookNotice.hidden = !matchingBook;
	refs.duplicateBookNotice.textContent = matchingBook ? "This book is already on your shelf. Update the saved copy or add another copy." : "";
	refs.saveSearchBook.textContent = matchingBook ? "Update Existing Copy" : "Add To Shelf";
	refs.addDuplicateBook.hidden = !matchingBook;
	refs.searchBookStatus.textContent = "";
	refs.searchBookDialog.showModal();
}

export function applyShelfRecommendation(index) {
	const book = state.recommendedBooks[index];
	if (!book) return;
	state.searchResults = state.recommendedBooks;
	applySearchResult(index);
}

export function showShelfRecommendationInfo(index) {
	const book = state.recommendedBooks[index];
	if (!book) return;
	refs.recommendationInfoTitle.textContent = book.title || "Book details";
	refs.recommendationInfoMeta.textContent = [book.author || "Unknown author", book.year || "Unknown year", capitalizeGenreLabel(book.genre) || "Unknown genre"].join(" | ");
	refs.recommendationInfoRating.textContent = Number(book.catalogRating) > 0 ? `Google Books rating: ${Number(book.catalogRating).toFixed(1)} / 5` : "No Google Books rating available.";
	refs.recommendationInfoBlurb.textContent = book.blurb || "No synopsis is available from this catalog entry.";
	refs.recommendationInfoDialog.showModal();
}

export function removeShelfRecommendation(index) {
	if (index >= 0 && index < state.recommendedBooks.length) {
		state.recommendedBooks.splice(index, 1);
		renderShelfRecommendations();
	}
}
