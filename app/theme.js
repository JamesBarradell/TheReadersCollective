(function () {
	var STORAGE_KEY = "readers-corner-theme";
	var root = document.documentElement;

	function getStoredTheme() {
		var stored = null;
		try {
			stored = localStorage.getItem(STORAGE_KEY);
		} catch (error) {
			stored = null;
		}
		return stored === "light" || stored === "dark" ? stored : null;
	}

	function getPreferredTheme() {
		var stored = getStoredTheme();
		if (stored) {
			return stored;
		}
		return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
	}

	function applyTheme(theme) {
		root.setAttribute("data-theme", theme);
		root.style.colorScheme = theme;
	}

	function updateToggleButtons(theme) {
		var buttons = document.querySelectorAll("[data-theme-toggle]");
		buttons.forEach(function (btn) {
			btn.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
			var label = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";
			btn.setAttribute("aria-label", label);
			btn.setAttribute("title", label);
			btn.innerHTML = '<i data-lucide="' + (theme === "dark" ? "sun" : "moon") + '" aria-hidden="true"></i>';
			if (window.lucide && typeof window.lucide.createIcons === "function") {
				window.lucide.createIcons({ nodes: [btn] });
			}
		});
	}

	function setTheme(theme) {
		try {
			localStorage.setItem(STORAGE_KEY, theme);
		} catch (error) {
			// ignore storage failures (e.g. private browsing)
		}
		applyTheme(theme);
		updateToggleButtons(theme);
	}

	applyTheme(getPreferredTheme());

	document.addEventListener("DOMContentLoaded", function () {
		updateToggleButtons(getPreferredTheme());
		document.querySelectorAll("[data-theme-toggle]").forEach(function (btn) {
			btn.addEventListener("click", function () {
				var current = root.getAttribute("data-theme") === "dark" ? "dark" : "light";
				setTheme(current === "dark" ? "light" : "dark");
			});
		});
	});
})();
