# The Readers Collective

This project now includes a real backend API for authentication and synced book data.

## Stack

- Frontend: static HTML/CSS/JS
- Backend: Node.js + Express
- Auth: JWT + bcrypt password hashing, with optional Google sign-in
- Persistence: SQLite database at `data/readers-corner.db` (imports existing `data/db.json` automatically on first launch)

## Run locally

1. Install Node.js 18+.
2. Install dependencies:

   npm install

3. Start server:

   npm start

4. Open:

   http://localhost:3000

The frontend is served by the backend, and API routes are available under `/api`.

## Google sign-in setup

1. Create an OAuth 2.0 Web Client ID in Google Cloud Console.
2. Add `http://localhost:3000` to the client ID's Authorized JavaScript origins.
3. Start the server with the client ID:

   $env:GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"; npm start

Without `GOOGLE_CLIENT_ID`, the login page shows a setup message instead of the Google button.

## Password recovery setup

Password recovery sends one-time, one-hour links through Resend. Configure these environment variables before deploying:

```powershell
$env:RESEND_API_KEY="re_..."
$env:RESEND_FROM_EMAIL="Readers Collective <noreply@your-verified-domain.com>"
$env:APP_BASE_URL="https://your-app.example"
npm start
```

`RESEND_FROM_EMAIL` must use a domain verified in Resend. Without both Resend variables, the reset request page clearly reports that password recovery has not been configured.

## API summary

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/password-reset/request`
- `POST /api/auth/password-reset/complete`
- `GET /api/auth/google/config`
- `POST /api/auth/google`
- `GET /api/auth/me`
- `PUT /api/auth/me`
- `GET /api/books`
- `POST /api/books`
- `PUT /api/books/:id`
- `DELETE /api/books/:id`
- `DELETE /api/books`

All routes except register/login require `Authorization: Bearer <token>`.

## Production notes

- Set a strong `JWT_SECRET` as an environment variable. The server refuses to start in production without it.
- Set `CORS_ORIGIN` to your deployed frontend origin instead of allowing all origins.
- This backend uses Node's built-in SQLite module, so deploy it with Node 24.x.
- Squarespace and GitLab Pages can host the static frontend, but they do not run the Node/Express API. Deploy `server.js` to a Node host, then set the backend origin in `config.js`:

   ```js
   window.READERS_COLLECTIVE_API_BASE = "https://your-backend.example";
   ```

   The value can include `/api`, but it does not need to; the frontend adds it automatically.
- The API applies request-size limits, rate limits, strict input constraints, and invalidates earlier tokens after a password change.
- For multi-device sync, deploy this backend to a shared host and point the frontend to that API.
- For high scale or multiple server instances, move from the local SQLite file to managed PostgreSQL.

### Render backend deployment

This repo includes `render.yaml` for deploying the Node API to Render.

1. Push this repo to GitLab.
2. Sign in to Render and open the Dashboard.
3. Choose **New +** and then **Blueprint**.
4. Connect your GitLab account if Render asks for access.
5. Select this repository. Render should detect `render.yaml` automatically.
6. On the environment variable screen, set `JWT_SECRET` to a long random value.
7. Set `GOOGLE_CLIENT_ID`, `RESEND_API_KEY`, and `RESEND_FROM_EMAIL` if you use Google sign-in or password reset.
8. Choose **Apply** or **Deploy** and wait for the service to finish building.
9. Copy the service URL, for example `https://the-readers-collective-api.onrender.com`.
10. Update `config.js` in the static site branch/deploy:

   ```js
   window.READERS_COLLECTIVE_API_BASE = "https://the-readers-collective-api.onrender.com";
   ```

11. Redeploy the static site to Squarespace/GitLab Pages.

If Render does not show a Blueprint option, create a regular **Web Service** instead with these settings:

```text
Runtime: Node
Build Command: npm install
Start Command: npm start
NODE_VERSION: 24.18.0
NODE_ENV: production
CORS_ORIGIN: https://www.thereaderscollective.com
APP_BASE_URL: https://www.thereaderscollective.com
JWT_SECRET: a long random secret value
```

## Tests

Run `npm test` to execute API integration tests against an isolated temporary SQLite database.
