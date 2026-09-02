import { state, refs, apiRequest, showNotice, escapeHtml } from "./shared.js";

const SPROUT_PLANT_SVG = `<svg viewBox="0 0 40 130" xmlns="http://www.w3.org/2000/svg">
	<path d="M11 100h18l-3 30H14l-3-30Z" fill="#b5651d"/>
	<path d="M9 95h22l-1.5 6h-19L9 95Z" fill="#d17a3a"/>
	<path d="M20 97V30" stroke="#3f7d3f" stroke-width="2.4" stroke-linecap="round"/>
	<path d="M20 46c-6-2-11-9-8-17 6-1 12 4 13 11" fill="#4f9d4f"/>
	<path d="M20 38c6-2 11-8 9-15-6 0-12 4-12.5 11" fill="#5fb35f"/>
	<path d="M20 28c-5-3-11-3-13 0 2 3.5 8.5 4.5 13 1Z" fill="#6bc16b"/>
	<circle cx="20" cy="22" r="5" fill="#e293c0"/>
	<path d="M20 22c-3-2.4-7-2-8.4 1 2 2.7 6.2 3.2 8.4-1Z" fill="#f0aad0"/>
	<path d="M20 22c3-2.4 7-2 8.4 1-2 2.7-6.2 3.2-8.4-1Z" fill="#f0aad0"/>
	<circle cx="12" cy="30" r="3.6" fill="#e293c0"/>
	<circle cx="28" cy="32" r="3.6" fill="#d97fb5"/>
</svg>`;

const LANTERN_SVG = `<svg viewBox="0 0 40 130" xmlns="http://www.w3.org/2000/svg">
	<path d="M17 4h6v10h-6z" fill="#3a3a3a"/>
	<path d="M14 14h12l2 6H12l2-6Z" fill="#2c2c2c"/>
	<rect x="11" y="22" width="18" height="80" rx="3" fill="#caa24a" stroke="#3a3a3a" stroke-width="1.6"/>
	<rect x="15" y="27" width="10" height="66" rx="1.5" fill="#fff3c4" opacity="0.9"/>
	<path d="M20 40c2.4 4 3.6 7 0 11-3.6-4-2.4-7 0-11Z" fill="#ff9a3c"/>
	<path d="M20 48c1.4 2 1.8 3.6 0 5.6-1.8-2-1.4-3.6 0-5.6Z" fill="#ffe27a"/>
	<path d="M11 102h18l-2 8H13l-2-8Z" fill="#2c2c2c"/>
</svg>`;

const TROPHY_SVG = `<svg viewBox="0 0 40 130" xmlns="http://www.w3.org/2000/svg">
	<path d="M12 6h16v10c0 6-4 10-8 10s-8-4-8-10V6Z" fill="#f6c945"/>
	<path d="M12 8H6c0 6 3 9 6 9.5" fill="none" stroke="#c9971a" stroke-width="2"/>
	<path d="M28 8h6c0 6-3 9-6 9.5" fill="none" stroke="#c9971a" stroke-width="2"/>
	<rect x="17" y="26" width="6" height="40" fill="#c9971a"/>
	<path d="M12 66h16l3 10H9l3-10Z" fill="#b5651d"/>
	<rect x="8" y="76" width="24" height="42" rx="3" fill="#8a5a3b"/>
	<rect x="12" y="82" width="16" height="6" rx="1" fill="#6b4326"/>
</svg>`;

const GLOBE_SVG = `<svg viewBox="0 0 40 130" xmlns="http://www.w3.org/2000/svg">
	<circle cx="20" cy="30" r="16" fill="#5fb0d9"/>
	<path d="M20 14c-4.5 4.5-4.5 27 0 32M20 14c4.5 4.5 4.5 27 0 32M4 30h32M6 21h28M6 39h28" fill="none" stroke="#3b7ca8" stroke-width="1"/>
	<path d="M11 20c2.3 3.4 3.4 8 1.1 12.6-3.4 1.1-6.9-1.1-8-4.6 1.1-3.4 3.4-5.7 6.9-8Z" fill="#5fae5f"/>
	<path d="M25 32c3.4 0 6.9 2.3 8 5.7-2.3 2.3-6.9 2.3-9.1 0-1.1-2.3-1.1-4.6 1.1-5.7Z" fill="#5fae5f"/>
	<rect x="17" y="48" width="6" height="34" fill="#8a5a3b"/>
	<path d="M12 86l8-6 8 6-4 8h-8l-4-8Z" fill="#8a5a3b"/>
	<path d="M9 96h22l4 6H5l4-6Z" fill="#6b4a30"/>
</svg>`;

const WISHING_CANDLE_SVG = `<svg viewBox="0 0 40 130" xmlns="http://www.w3.org/2000/svg">
	<ellipse cx="20" cy="120" rx="12" ry="4" fill="#c9971a"/>
	<rect x="14" y="30" width="12" height="88" rx="3" fill="#ffedc2"/>
	<path d="M14 40c4 1.6 8 1.6 12 0v6c-4 1.6-8 1.6-12 0v-6Z" fill="#ffdf9e"/>
	<path d="M20 30v3" stroke="#5c3d24" stroke-width="1.6" stroke-linecap="round"/>
	<path d="M20 12c2.8 4 3.8 7.4 0 12.4-3.8-5-2.8-8.4 0-12.4Z" fill="#ff9a3c"/>
	<path d="M20 17c1.4 2.2 1.9 4 0 6.2-1.9-2.2-1.4-4 0-6.2Z" fill="#ffe27a"/>
</svg>`;

const BOOKMARK_SVG = `<svg viewBox="0 0 40 130" xmlns="http://www.w3.org/2000/svg">
	<path d="M10 8h20v100l-10-10-10 10V8Z" fill="#c0392b"/>
	<path d="M10 8h20v14H10z" fill="#e05a48"/>
	<path d="M14 30h12" stroke="#8a221a" stroke-width="2" stroke-linecap="round"/>
	<path d="M14 38h12" stroke="#8a221a" stroke-width="2" stroke-linecap="round"/>
</svg>`;

const CROWN_SVG = `<svg viewBox="0 0 40 130" xmlns="http://www.w3.org/2000/svg">
	<path d="M6 40l7 20 7-14 0 0 0 0 7 14 7-20-4 34H10L6 40Z" fill="#f6c945"/>
	<circle cx="6" cy="38" r="3" fill="#e05a48"/>
	<circle cx="20" cy="30" r="3" fill="#3a5ba0"/>
	<circle cx="34" cy="38" r="3" fill="#e05a48"/>
	<rect x="9" y="74" width="22" height="10" rx="2" fill="#c9971a"/>
	<rect x="7" y="86" width="26" height="34" rx="3" fill="#8a5a3b"/>
	<rect x="11" y="92" width="18" height="6" rx="1" fill="#6b4326"/>
</svg>`;

const SHOOTING_STAR_SVG = `<svg viewBox="0 0 40 130" xmlns="http://www.w3.org/2000/svg">
	<path d="M20 8l3.6 8.6 9.4 1-7 6.6 1.9 9.2L20 28.6l-7.9 4.8 1.9-9.2-7-6.6 9.4-1L20 8Z" fill="#ffe27a"/>
	<path d="M6 42l22 10M4 52l16 8M8 62l10 6" stroke="#ffd76b" stroke-width="2.4" stroke-linecap="round" opacity="0.85"/>
	<rect x="15" y="86" width="10" height="30" rx="2" fill="#5a83a8"/>
	<path d="M11 116h18l3 6H8l3-6Z" fill="#3a5b7a"/>
</svg>`;

const READING_CIRCLE_SVG = `<svg viewBox="0 0 40 130" xmlns="http://www.w3.org/2000/svg">
	<circle cx="13" cy="20" r="8" fill="#d9a066"/>
	<path d="M13 30c-7 0-11 4-11 10v6h22v-6c0-6-4-10-11-10Z" fill="#c0392b"/>
	<circle cx="27" cy="20" r="8" fill="#e8c39e"/>
	<path d="M27 30c-7 0-11 4-11 10v6h22v-6c0-6-4-10-11-10Z" fill="#3a5ba0"/>
	<rect x="6" y="70" width="28" height="42" rx="3" fill="#8a5a3b"/>
	<rect x="10" y="76" width="20" height="6" rx="1" fill="#6b4326"/>
	<rect x="10" y="86" width="20" height="6" rx="1" fill="#6b4326"/>
	<rect x="10" y="96" width="20" height="6" rx="1" fill="#6b4326"/>
</svg>`;

const HOME_LIBRARY_SVG = `<svg viewBox="0 0 40 130" xmlns="http://www.w3.org/2000/svg">
	<rect x="4" y="20" width="8" height="70" rx="1" fill="#c0392b"/>
	<rect x="14" y="12" width="8" height="78" rx="1" fill="#3a5ba0"/>
	<rect x="24" y="24" width="8" height="66" rx="1" fill="#2e7d5b"/>
	<rect x="34" y="16" width="4" height="74" rx="1" fill="#c9971a"/>
	<rect x="2" y="90" width="36" height="8" rx="2" fill="#6b4326"/>
	<rect x="2" y="98" width="36" height="22" rx="3" fill="#8a5a3b"/>
</svg>`;

const READING_CAT_SVG = `<svg viewBox="0 0 40 130" xmlns="http://www.w3.org/2000/svg">
	<path d="M14 46l-3-8 7 5" fill="#d9a066"/>
	<path d="M26 46l3-8-7 5" fill="#d9a066"/>
	<path d="M10 62c0-10 4-16 10-16s10 6 10 16c0 4-3 6-10 6s-10-2-10-6Z" fill="#d9a066"/>
	<circle cx="16" cy="49" r="1.4" fill="#3a2a1a"/>
	<circle cx="24" cy="49" r="1.4" fill="#3a2a1a"/>
	<path d="M18 53q2 2 4 0" stroke="#3a2a1a" stroke-width="1.2" fill="none" stroke-linecap="round"/>
	<rect x="7" y="70" width="26" height="10" rx="1.5" fill="#c0392b"/>
	<rect x="7" y="82" width="26" height="10" rx="1.5" fill="#2e7d5b"/>
	<rect x="7" y="94" width="26" height="10" rx="1.5" fill="#3a5ba0"/>
	<rect x="9" y="104" width="22" height="10" rx="1.5" fill="#8a5a3b"/>
</svg>`;

const TRINKET_CATALOG = [
	{ id: "bookmark", label: "Bookmark", description: "Finish your first book", statKey: "finished", target: 1, condition: (stats) => stats.finished >= 1, svg: BOOKMARK_SVG },
	{ id: "sprout", label: "Sprout", description: "Finish 3 books", statKey: "finished", target: 3, condition: (stats) => stats.finished >= 3, svg: SPROUT_PLANT_SVG },
	{ id: "lantern", label: "Lantern", description: "Finish 10 books", statKey: "finished", target: 10, condition: (stats) => stats.finished >= 10, svg: LANTERN_SVG, glow: true },
	{ id: "trophy", label: "Trophy", description: "Finish 25 books", statKey: "finished", target: 25, condition: (stats) => stats.finished >= 25, svg: TROPHY_SVG },
	{ id: "crown", label: "Crown", description: "Finish 50 books", statKey: "finished", target: 50, condition: (stats) => stats.finished >= 50, svg: CROWN_SVG, glow: true },
	{ id: "globe", label: "Globe", description: "Own 15 books", statKey: "owned", target: 15, condition: (stats) => stats.owned >= 15, svg: GLOBE_SVG },
	{ id: "home-library", label: "Home Library", description: "Own 30 books", statKey: "owned", target: 30, condition: (stats) => stats.owned >= 30, svg: HOME_LIBRARY_SVG },
	{ id: "wishing-candle", label: "Wishing Candle", description: "Add 5 books to your wishlist", statKey: "wishlist", target: 5, condition: (stats) => stats.wishlist >= 5, svg: WISHING_CANDLE_SVG, glow: true },
	{ id: "shooting-star", label: "Shooting Star", description: "Add 15 books to your wishlist", statKey: "wishlist", target: 15, condition: (stats) => stats.wishlist >= 15, svg: SHOOTING_STAR_SVG, glow: true },
	{ id: "reading-cat", label: "Reading Cat", description: "Add a friend", statKey: "friends", target: 1, condition: (stats) => stats.friends >= 1, svg: READING_CAT_SVG },
	{ id: "reading-circle", label: "Reading Circle", description: "Add 5 friends", statKey: "friends", target: 5, condition: (stats) => stats.friends >= 5, svg: READING_CIRCLE_SVG }
];

const AUTO_COLUMNS = 20;
const MAX_ROWS = 6;
const START_X = 0.03;
const AUTO_COL_WIDTH = 0.045;
// The canvas has a fixed pixel height (see .bookshelf-canvas in styles.css) so these
// row values line up exactly with the repeating shelf-board background pattern.
const CANVAS_HEIGHT_PX = 1000;
const ROW_HEIGHT_PX = 164;
const ROW_CENTER_OFFSET_PX = 75;
const START_Y = ROW_CENTER_OFFSET_PX / CANVAS_HEIGHT_PX;
const AUTO_ROW_HEIGHT = ROW_HEIGHT_PX / CANVAS_HEIGHT_PX;

function genreColor(genre) {
	const palette = ["#8b5a2b", "#5a83a8", "#a8554b", "#5f8f6d", "#8b6bab", "#b18a2c", "#4c7a8f", "#a15b8f"];
	const text = String(genre || "other").toLowerCase();
	let hash = 0;
	for (let i = 0; i < text.length; i += 1) {
		hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
	}
	return palette[hash % palette.length];
}

function slotPosition(row, col) {
	return { x: START_X + col * AUTO_COL_WIDTH, y: START_Y + row * AUTO_ROW_HEIGHT };
}

function autoPosition(index) {
	const row = Math.floor(index / AUTO_COLUMNS) % MAX_ROWS;
	const col = index % AUTO_COLUMNS;
	return slotPosition(row, col);
}

function fractionToSlot(fracX, fracY) {
	const col = Math.max(0, Math.min(AUTO_COLUMNS - 1, Math.round((fracX - START_X) / AUTO_COL_WIDTH)));
	const row = Math.max(0, Math.min(MAX_ROWS - 1, Math.round((fracY - START_Y) / AUTO_ROW_HEIGHT)));
	return { row, col };
}

function occupiedSlots(excludeEl) {
	const occupied = new Set();
	refs.bookshelfCanvas.querySelectorAll(".book-spine, .shelf-trinket").forEach((item) => {
		if (item === excludeEl) return;
		const { row, col } = fractionToSlot(Number(item.dataset.x) || 0, Number(item.dataset.y) || 0);
		occupied.add(`${row}-${col}`);
	});
	return occupied;
}

function findFreeSlot(row, col, occupied) {
	if (!occupied.has(`${row}-${col}`)) return { row, col };
	for (let ring = 1; ring <= AUTO_COLUMNS + MAX_ROWS; ring += 1) {
		for (let dr = -ring; dr <= ring; dr += 1) {
			for (let dc = -ring; dc <= ring; dc += 1) {
				if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;
				const r = row + dr;
				const c = col + dc;
				if (r < 0 || r >= MAX_ROWS || c < 0 || c >= AUTO_COLUMNS) continue;
				if (!occupied.has(`${r}-${c}`)) return { row: r, col: c };
			}
		}
	}
	return { row, col };
}

function attachDrag(el, kind, id) {
	el.style.touchAction = "none";
	el.addEventListener("pointerdown", (event) => {
		if (event.button !== undefined && event.button !== 0) return;
		event.preventDefault();
		const container = refs.bookshelfCanvas;
		const containerRect = container.getBoundingClientRect();
		const startX = event.clientX;
		const startY = event.clientY;
		const startFracX = Number(el.dataset.x) || 0;
		const startFracY = Number(el.dataset.y) || 0;
		el.setPointerCapture(event.pointerId);
		el.classList.add("dragging");

		function onMove(moveEvent) {
			const dx = moveEvent.clientX - startX;
			const dy = moveEvent.clientY - startY;
			const fracX = Math.max(0, Math.min(1, startFracX + dx / containerRect.width));
			const fracY = Math.max(0, Math.min(1, startFracY + dy / containerRect.height));
			el.dataset.x = String(fracX);
			el.dataset.y = String(fracY);
			el.style.left = `${fracX * 100}%`;
			el.style.top = `${fracY * 100}%`;
		}

		function onUp(upEvent) {
			el.releasePointerCapture(upEvent.pointerId);
			el.classList.remove("dragging");
			document.removeEventListener("pointermove", onMove);
			document.removeEventListener("pointerup", onUp);
			const desiredSlot = fractionToSlot(Number(el.dataset.x), Number(el.dataset.y));
			const freeSlot = findFreeSlot(desiredSlot.row, desiredSlot.col, occupiedSlots(el));
			const snapped = slotPosition(freeSlot.row, freeSlot.col);
			el.dataset.x = String(snapped.x);
			el.dataset.y = String(snapped.y);
			el.style.left = `${snapped.x * 100}%`;
			el.style.top = `${snapped.y * 100}%`;
			persistPosition(kind, id, snapped.x, snapped.y);
		}

		document.addEventListener("pointermove", onMove);
		document.addEventListener("pointerup", onUp);
	});
}

async function persistPosition(kind, id, x, y) {
	try {
		if (kind === "book") {
			const response = await apiRequest(`/books/${id}/position`, { method: "PUT", body: JSON.stringify({ x, y }) });
			const book = state.books.find((entry) => entry.id === id);
			if (book) {
				book.shelfX = response.book.shelfX;
				book.shelfY = response.book.shelfY;
			}
		} else {
			const response = await apiRequest(`/trinkets/${id}/position`, { method: "PUT", body: JSON.stringify({ x, y }) });
			const trinket = state.trinkets.find((entry) => entry.id === id);
			if (trinket) {
				trinket.x = response.trinket.x;
				trinket.y = response.trinket.y;
			}
		}
	} catch (error) {
		showNotice(error instanceof Error ? error.message : "Unable to save that position right now.");
	}
}

export function renderBookshelf() {
	if (!refs.bookshelfCanvas) return;
	refs.bookshelfCanvas.innerHTML = "";
	if (!state.currentUser) {
		refs.bookshelfCanvas.innerHTML = '<div class="empty">Sign in to see your bookshelf.</div>';
		return;
	}

	const shelfBooks = state.books.filter((book) => book.isOwned);
	if (!shelfBooks.length) {
		refs.bookshelfCanvas.innerHTML = '<div class="empty">Add books to your library to start filling your shelf.</div>';
	}

	let autoIndex = 0;
	for (const book of shelfBooks) {
		const hasPosition = Number(book.shelfX) >= 0 && Number(book.shelfY) >= 0;
		const position = hasPosition ? { x: Number(book.shelfX), y: Number(book.shelfY) } : autoPosition(autoIndex++);
		const spine = document.createElement("article");
		spine.className = "book-spine";
		spine.classList.toggle("has-cover", Boolean(book.coverUrl));
		spine.dataset.x = String(position.x);
		spine.dataset.y = String(position.y);
		spine.style.left = `${position.x * 100}%`;
		spine.style.top = `${position.y * 100}%`;
		spine.title = `${book.title}${book.author ? ` by ${book.author}` : ""}`;
		if (book.coverUrl) {
			spine.style.backgroundImage = `url(${JSON.stringify(book.coverUrl)})`;
			spine.innerHTML = `<span>${escapeHtml(book.title)}</span>`;
		} else {
			spine.style.background = genreColor(book.genre);
			spine.innerHTML = `<span>${escapeHtml(book.title)}</span>`;
		}
		attachDrag(spine, "book", book.id);
		refs.bookshelfCanvas.append(spine);
	}

	for (const trinket of state.trinkets) {
		if (isTrinketHidden(trinket.id)) continue;
		const catalogEntry = TRINKET_CATALOG.find((entry) => entry.id === trinket.id);
		if (!catalogEntry) continue;
		const hasPosition = Number(trinket.x) >= 0 && Number(trinket.y) >= 0;
		const position = hasPosition ? { x: Number(trinket.x), y: Number(trinket.y) } : autoPosition(autoIndex++);
		const item = document.createElement("div");
		item.className = `shelf-trinket${catalogEntry.glow ? " glow" : ""}${catalogEntry.svg ? " is-illustration" : ""}`;
		if (!catalogEntry.svg) {
			item.style.background = catalogEntry.gradient;
		}
		item.dataset.x = String(position.x);
		item.dataset.y = String(position.y);
		item.style.left = `${position.x * 100}%`;
		item.style.top = `${position.y * 100}%`;
		item.title = catalogEntry.label;
		item.innerHTML = catalogEntry.svg || `<i data-lucide="${catalogEntry.icon}" aria-hidden="true"></i>`;
		attachDrag(item, "trinket", trinket.id);
		refs.bookshelfCanvas.append(item);
	}

	if (window.lucide) {
		window.lucide.createIcons();
	}
}

export function renderTrinketTray() {
	if (!refs.trinketTrayList) return;
	refs.trinketTrayList.innerHTML = TRINKET_CATALOG.map((entry) => {
		const unlocked = state.trinkets.some((trinket) => trinket.id === entry.id);
		const hidden = unlocked && isTrinketHidden(entry.id);
		const visibilityToggle = unlocked
			? `<button class="trinket-visibility-btn" type="button" data-action="toggle-trinket-visibility" data-id="${entry.id}" aria-pressed="${hidden ? "false" : "true"}" aria-label="${hidden ? "Show" : "Hide"} ${escapeHtml(entry.label)} on shelf" title="${hidden ? "Show" : "Hide"} on shelf"><i data-lucide="${hidden ? "eye-off" : "eye"}" aria-hidden="true"></i></button>`
			: "";
		const current = Number(state.trinketStats[entry.statKey] || 0);
		const percent = Math.max(0, Math.min(100, Math.round((current / entry.target) * 100)));
		const progressBar = unlocked
			? ""
			: `<div class="trinket-progress" role="progressbar" aria-valuenow="${percent}" aria-valuemin="0" aria-valuemax="100" aria-label="${escapeHtml(entry.label)} progress"><div style="width: ${percent}%"></div></div><p class="trinket-progress-label">${Math.min(current, entry.target)} / ${entry.target}</p>`;
		if (entry.svg) {
			const badgeClass = `trinket-tray-badge is-illustration${unlocked ? "" : " locked-illustration"}`;
			return `
				<div class="trinket-tray-item ${unlocked ? "unlocked" : "locked"}${hidden ? " hidden-trinket" : ""}">
					${visibilityToggle}
					<span class="${badgeClass}">${unlocked ? entry.svg : '<i data-lucide="lock" aria-hidden="true"></i>'}</span>
					<span>${escapeHtml(entry.label)}</span>
					<p class="hint">${unlocked ? (hidden ? "Hidden from shelf" : "Unlocked") : escapeHtml(entry.description)}</p>
					${progressBar}
				</div>
			`;
		}
		const badgeStyle = unlocked ? ` style="background:${entry.gradient}"` : "";
		return `
			<div class="trinket-tray-item ${unlocked ? "unlocked" : "locked"}${hidden ? " hidden-trinket" : ""}">
				${visibilityToggle}
				<span class="trinket-tray-badge"${badgeStyle}><i data-lucide="${unlocked ? entry.icon : "lock"}" aria-hidden="true"></i></span>
				<span>${escapeHtml(entry.label)}</span>
				<p class="hint">${unlocked ? (hidden ? "Hidden from shelf" : "Unlocked") : escapeHtml(entry.description)}</p>
				${progressBar}
			</div>
		`;
	}).join("");
	if (window.lucide) {
		window.lucide.createIcons();
	}
}

export async function loadBookshelfExtras() {
	if (!state.currentUser) {
		state.trinkets = [];
		state.trinketStats = { finished: 0, owned: 0, wishlist: 0, friends: 0 };
		return;
	}
	try {
		const response = await apiRequest("/trinkets", { method: "GET" });
		state.trinkets = Array.isArray(response.trinkets) ? response.trinkets : [];
		state.trinketStats = response.stats || state.trinketStats;
		const newlyUnlocked = [];
		for (const entry of TRINKET_CATALOG) {
			const alreadyUnlocked = state.trinkets.some((trinket) => trinket.id === entry.id);
			if (alreadyUnlocked || !entry.condition(state.trinketStats)) continue;
			try {
				const unlockResponse = await apiRequest(`/trinkets/${entry.id}/unlock`, { method: "POST" });
				state.trinkets.push(unlockResponse.trinket);
				newlyUnlocked.push(entry.label);
			} catch {
				// condition mismatch or race, ignore
			}
		}
		if (newlyUnlocked.length) {
			showNotice(`New trinket unlocked: ${newlyUnlocked.join(", ")}!`);
		}
	} catch (error) {
		showNotice(error instanceof Error ? error.message : "Unable to load your trinkets right now.");
	}
}

export async function resetBookshelfLayout() {
	const shelfBooks = state.books.filter((book) => book.isOwned);
	let index = 0;
	for (const book of shelfBooks) {
		const position = autoPosition(index++);
		try {
			const response = await apiRequest(`/books/${book.id}/position`, { method: "PUT", body: JSON.stringify(position) });
			book.shelfX = response.book.shelfX;
			book.shelfY = response.book.shelfY;
		} catch {
			// keep going even if one book fails to update
		}
	}
	for (const trinket of state.trinkets) {
		const position = autoPosition(index++);
		try {
			const response = await apiRequest(`/trinkets/${trinket.id}/position`, { method: "PUT", body: JSON.stringify(position) });
			trinket.x = response.trinket.x;
			trinket.y = response.trinket.y;
		} catch {
			// keep going even if one trinket fails to update
		}
	}
	renderBookshelf();
	showNotice("Bookshelf layout reset.");
}

const BOOKCASE_COLOR_STORAGE_KEY = "readers-corner-bookcase-color";

export const BOOKCASE_COLOR_PRESETS = [
	{ id: "walnut", label: "Walnut", base: "#6b4a30", light: "#7a5638", dark: "#5b3d26" },
	{ id: "oak", label: "Oak", base: "#a9793f", light: "#c79457", dark: "#8a6034" },
	{ id: "espresso", label: "Espresso", base: "#3b2a20", light: "#4a3628", dark: "#241a13" },
	{ id: "cherry", label: "Cherry", base: "#7a2e24", light: "#94392c", dark: "#5c211a" },
	{ id: "slate", label: "Slate", base: "#465059", light: "#586570", dark: "#2f363c" },
	{ id: "forest", label: "Forest", base: "#33502f", light: "#436a3d", dark: "#213620" },
	{ id: "navy", label: "Navy", base: "#243a5e", light: "#31497a", dark: "#182742" },
	{ id: "rose", label: "Rose", base: "#7a4560", light: "#95577a", dark: "#5a3247" }
];

function applyBookcasePreset(preset) {
	if (!preset) return;
	const root = document.documentElement;
	root.style.setProperty("--wood-base", preset.base);
	root.style.setProperty("--wood-light", preset.light);
	root.style.setProperty("--wood-dark", preset.dark);
	for (const swatch of refs.bookcaseColorMenu.querySelectorAll(".bookcase-swatch")) {
		swatch.classList.toggle("active", swatch.dataset.presetId === preset.id);
	}
}

export function setBookcaseColor(presetId) {
	const preset = BOOKCASE_COLOR_PRESETS.find((entry) => entry.id === presetId) || BOOKCASE_COLOR_PRESETS[0];
	try {
		localStorage.setItem(BOOKCASE_COLOR_STORAGE_KEY, preset.id);
	} catch {
		// ignore storage failures (e.g. private browsing)
	}
	applyBookcasePreset(preset);
}

export function initBookcaseColorPicker() {
	if (!refs.bookcaseColorMenu || refs.bookcaseColorMenu.childElementCount) return;
	refs.bookcaseColorMenu.innerHTML = BOOKCASE_COLOR_PRESETS.map((preset) => `<button type="button" class="bookcase-swatch" data-preset-id="${preset.id}" style="background:${preset.base}" aria-label="${preset.label} bookcase" title="${preset.label}"></button>`).join("");
	let storedId = "";
	try {
		storedId = localStorage.getItem(BOOKCASE_COLOR_STORAGE_KEY) || "";
	} catch {
		storedId = "";
	}
	applyBookcasePreset(BOOKCASE_COLOR_PRESETS.find((entry) => entry.id === storedId) || BOOKCASE_COLOR_PRESETS[0]);
}

const TRINKETS_VISIBLE_STORAGE_KEY = "readers-corner-hidden-trinkets";

function getHiddenTrinketIds() {
	try {
		const stored = JSON.parse(localStorage.getItem(TRINKETS_VISIBLE_STORAGE_KEY) || "[]");
		return Array.isArray(stored) ? stored : [];
	} catch {
		return [];
	}
}

export function isTrinketHidden(trinketId) {
	return getHiddenTrinketIds().includes(trinketId);
}

export function toggleTrinketVisibility(trinketId) {
	const hiddenIds = getHiddenTrinketIds();
	const nextIds = hiddenIds.includes(trinketId) ? hiddenIds.filter((id) => id !== trinketId) : [...hiddenIds, trinketId];
	try {
		localStorage.setItem(TRINKETS_VISIBLE_STORAGE_KEY, JSON.stringify(nextIds));
	} catch {
		// ignore storage failures (e.g. private browsing)
	}
	renderBookshelf();
	renderTrinketTray();
}
