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
const token = new URLSearchParams(window.location.search).get("token") || "";
const form = document.getElementById("reset-password-form");
const password = document.getElementById("new-password");
const confirmPassword = document.getElementById("confirm-password");
const status = document.getElementById("reset-password-status");

if (!token) {
	form.querySelector("button").disabled = true;
	status.textContent = "This password reset link is missing or invalid.";
}

form.addEventListener("submit", (event) => {
	event.preventDefault();
	if (password.value !== confirmPassword.value) {
		status.textContent = "Passwords do not match.";
		return;
	}

	(async () => {
		try {
			status.textContent = "Resetting password...";
			const response = await fetch(`${API_BASE}/auth/password-reset/complete`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ token, password: password.value })
			});
			const payload = await response.json().catch(() => null);
			if (!response.ok) {
				throw new Error(payload && payload.message ? payload.message : response.status === 404 ? `Backend API route not found at ${API_BASE}/auth/password-reset/complete. Deploy the Node server or set READERS_COLLECTIVE_API_BASE to your backend URL.` : "Unable to reset password.");
			}
			status.textContent = "Password reset. Redirecting to sign in...";
			window.setTimeout(() => {
				window.location.href = `${SITE_BASE}/`;
			}, 1200);
		} catch (error) {
			status.textContent = error instanceof Error ? error.message : "Unable to reset password.";
		}
	})();
});
