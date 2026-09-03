const isLocalDevelopmentHost = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);

if (!isLocalDevelopmentHost) {
	window.READERS_COLLECTIVE_API_BASE = "https://the-readers-collective-api.onrender.com";
}