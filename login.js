const AUTH_TOKEN_STORAGE_KEY = "readers-corner-auth-token";
const SESSION_AUTH_TOKEN_STORAGE_KEY = "readers-corner-session-auth-token";
const AUTH_MESSAGE_STORAGE_KEY = "readers-corner-auth-message";
const API_BASE = (() => {
	const configuredBase = String(window.READERS_COLLECTIVE_API_BASE || "").trim().replace(/\/+$/, "");
	if (configuredBase) {
		return configuredBase.endsWith("/api") ? configuredBase : `${configuredBase}/api`;
	}
	return window.location.protocol === "file:"
		? "http://localhost:3000/api"
		: `${window.location.origin}/api`;
})();
const SITE_BASE = window.location.protocol === "file:"
	? "http://localhost:3000"
	: window.location.origin;
const APP_PAGE = window.location.protocol === "file:"
	? new URL("app.html", window.location.href).href
	: `${SITE_BASE}/app.html`;

const refs = {
	authForm: document.getElementById("auth-form"),
	authEmail: document.getElementById("auth-email"),
	authPassword: document.getElementById("auth-password"),
	rememberMe: document.getElementById("remember-me"),
	createAccountBtn: document.getElementById("create-account-btn"),
	createAccountDialog: document.getElementById("create-account-dialog"),
	closeCreateAccount: document.getElementById("close-create-account"),
	registerForm: document.getElementById("register-form"),
	registerUsername: document.getElementById("register-username"),
	registerEmail: document.getElementById("register-email"),
	registerPassword: document.getElementById("register-password"),
	registerReadingGoal: document.getElementById("register-reading-goal"),
	registerStatus: document.getElementById("register-status"),
	googleSignIn: document.getElementById("google-signin"),
	googleStatus: document.getElementById("google-status"),
	authStatus: document.getElementById("auth-status"),
	forgotPasswordBtn: document.getElementById("forgot-password-btn"),
	forgotPasswordDialog: document.getElementById("forgot-password-dialog"),
	closeForgotPassword: document.getElementById("close-forgot-password"),
	forgotPasswordForm: document.getElementById("forgot-password-form"),
	resetEmail: document.getElementById("reset-email"),
	resetRequestStatus: document.getElementById("reset-request-status")
};

if (window.lucide) {
	window.lucide.createIcons();
}

function normalizeEmail(email) {
	return String(email || "").trim().toLowerCase();
}

function saveAuthToken(token, remember = true) {
	if (!token) {
		localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
		sessionStorage.removeItem(SESSION_AUTH_TOKEN_STORAGE_KEY);
		return;
	}
	if (remember) {
		localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
		sessionStorage.removeItem(SESSION_AUTH_TOKEN_STORAGE_KEY);
		return;
	}
	localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
	sessionStorage.setItem(SESSION_AUTH_TOKEN_STORAGE_KEY, token);
}

async function apiRequest(path, options = {}) {
	const headers = {
		"Content-Type": "application/json",
		...(options.headers || {})
	};

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
		throw new Error(message);
	}

	return payload;
}

async function tryRestoreSession() {
	const savedMessage = localStorage.getItem(AUTH_MESSAGE_STORAGE_KEY) || "";
	if (savedMessage) {
		refs.authStatus.textContent = savedMessage;
		localStorage.removeItem(AUTH_MESSAGE_STORAGE_KEY);
	}

	const token = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)
		|| sessionStorage.getItem(SESSION_AUTH_TOKEN_STORAGE_KEY)
		|| "";
	if (!token) {
		return;
	}

	try {
		const response = await fetch(`${API_BASE}/auth/me`, {
			headers: {
				Authorization: `Bearer ${token}`
			}
		});
		if (response.ok) {
			window.location.replace(APP_PAGE);
			return;
		}
	} catch {
		// Ignore restore failures on the login page.
	}

	saveAuthToken("");
}

async function handleGoogleCredential(response) {
	try {
		refs.authStatus.textContent = "Signing in with Google...";
		const authResponse = await apiRequest("/auth/google", {
			method: "POST",
			body: JSON.stringify({ credential: response.credential })
		});
		saveAuthToken(authResponse.token, refs.rememberMe.checked);
		window.location.replace(APP_PAGE);
	} catch (error) {
		refs.authStatus.textContent = error instanceof Error ? error.message : "Google sign-in failed.";
	}
}

function waitForGoogleIdentity(timeoutMs = 5000) {
	return new Promise((resolve) => {
		if (window.google?.accounts?.id) {
			resolve(true);
			return;
		}

		const startedAt = Date.now();
		const timer = window.setInterval(() => {
			if (window.google?.accounts?.id) {
				window.clearInterval(timer);
				resolve(true);
				return;
			}

			if (Date.now() - startedAt >= timeoutMs) {
				window.clearInterval(timer);
				resolve(false);
			}
		}, 100);
	});
}

async function initGoogleSignIn() {
	if (!refs.googleSignIn) {
		return;
	}

	try {
		const config = await apiRequest("/auth/google/config");
		if (!config.clientId) {
			refs.googleStatus.textContent = "Google sign-in needs GOOGLE_CLIENT_ID on the server.";
			return;
		}

		const isGoogleReady = await waitForGoogleIdentity();
		if (!isGoogleReady) {
			refs.googleStatus.textContent = "Google sign-in could not load. Check your connection and refresh.";
			return;
		}

		window.google.accounts.id.initialize({
			client_id: config.clientId,
			callback: handleGoogleCredential
		});
		window.google.accounts.id.renderButton(refs.googleSignIn, {
			theme: "outline",
			size: "large",
			text: "signin_with",
			shape: "rectangular",
			width: 320
		});
		refs.googleStatus.textContent = "";
	} catch (error) {
		refs.googleStatus.textContent = error instanceof Error ? error.message : "Google sign-in is unavailable.";
	}
}

refs.authForm.addEventListener("submit", (event) => {
	event.preventDefault();
	const email = refs.authEmail.value;
	const password = refs.authPassword.value;
	const submitButtons = refs.authForm.querySelectorAll("button[type='submit']");

	(async () => {
		try {
			refs.authStatus.textContent = "Signing in...";
			submitButtons.forEach((button) => {
				button.disabled = true;
			});
			const response = await apiRequest("/auth/login", {
				method: "POST",
				body: JSON.stringify({
					email: normalizeEmail(email),
					password
				})
			});
			saveAuthToken(response.token, refs.rememberMe.checked);
			window.location.replace(APP_PAGE);
		} catch (error) {
			refs.authStatus.textContent = error instanceof Error ? error.message : "Unable to sign in right now.";
			submitButtons.forEach((button) => {
				button.disabled = false;
			});
		}
	})();
});

refs.createAccountBtn.addEventListener("click", () => {
	refs.registerEmail.value = refs.authEmail.value;
	refs.registerStatus.textContent = "";
	refs.createAccountDialog.showModal();
	refs.registerUsername.focus();
});

refs.closeCreateAccount.addEventListener("click", () => refs.createAccountDialog.close());

refs.registerForm.addEventListener("submit", (event) => {
	event.preventDefault();
	const username = String(refs.registerUsername.value || "").trim();
	const submitButton = refs.registerForm.querySelector("button[type='submit']");
	if (!/^[a-z0-9_]{3,24}$/i.test(username)) {
		refs.registerStatus.textContent = "Choose a username with 3-24 letters, numbers, or underscores.";
		refs.registerUsername.focus();
		return;
	}

	(async () => {
		try {
			refs.registerStatus.textContent = "Creating your account...";
			submitButton.disabled = true;
			const response = await apiRequest("/auth/register", {
				method: "POST",
				body: JSON.stringify({
					username,
					email: normalizeEmail(refs.registerEmail.value),
					password: refs.registerPassword.value,
					readingGoal: Number(refs.registerReadingGoal.value)
				})
			});
			saveAuthToken(response.token, refs.rememberMe.checked);
			window.location.replace(APP_PAGE);
		} catch (error) {
			refs.registerStatus.textContent = error instanceof Error ? error.message : "Unable to create your account right now.";
			submitButton.disabled = false;
		}
	})();
});

refs.forgotPasswordBtn.addEventListener("click", () => {
	refs.resetEmail.value = refs.authEmail.value;
	refs.resetRequestStatus.textContent = "";
	refs.forgotPasswordDialog.showModal();
});

refs.closeForgotPassword.addEventListener("click", () => refs.forgotPasswordDialog.close());

refs.forgotPasswordForm.addEventListener("submit", (event) => {
	event.preventDefault();
	(async () => {
		try {
			refs.resetRequestStatus.textContent = "Sending reset link...";
			const response = await apiRequest("/auth/password-reset/request", {
				method: "POST",
				body: JSON.stringify({ email: normalizeEmail(refs.resetEmail.value) })
			});
			refs.resetRequestStatus.textContent = response.message;
		} catch (error) {
			refs.resetRequestStatus.textContent = error instanceof Error ? error.message : "Unable to request a password reset.";
		}
	})();
});

tryRestoreSession();
initGoogleSignIn();
