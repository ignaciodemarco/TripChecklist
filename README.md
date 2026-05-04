# 🧳 Trip Checklist

Weather-aware smart packing list, with per-user accounts (Google or Microsoft sign-in), saved trips,
editable personal defaults, and an Imperial / Metric toggle.

Built with **Next.js 15 + TypeScript + Tailwind + Prisma (SQLite) + NextAuth (Auth.js v5)**.

---

## Quick start (local)

```powershell
# 1. Install
npm install

# 2. Copy env and fill in values (see "OAuth setup" below)
copy .env.example .env

# 3. Generate a secret for NextAuth
npx auth secret      # writes AUTH_SECRET into .env

# 4. Initialize the database
npx prisma migrate dev --name init

# 5. Run
npm run dev
# → http://localhost:3000
```

The two seed emails (`ignacio.demarco@bairesdev.com`, `magui.jpc@gmail.com`) get the
"Ropa para Viajes" spreadsheet pre-loaded as **editable** personal defaults the first time they sign in.
Other users start with empty defaults and can build their own list (or load the template) in **Settings**.

---

## OAuth setup

### Google

1. Go to <https://console.cloud.google.com/> → create a project (or pick one).
2. **APIs & Services → OAuth consent screen** → External → fill app name, support email, developer email → Save.
3. **APIs & Services → Credentials → + Create credentials → OAuth client ID**
   - Application type: **Web application**
   - **Authorized JavaScript origins**: `http://localhost:3000`
   - **Authorized redirect URIs**: `http://localhost:3000/api/auth/callback/google`
4. Copy the Client ID + Secret into `.env`:

   ```
   AUTH_GOOGLE_ID=...
   AUTH_GOOGLE_SECRET=...
   ```

### Microsoft (Entra ID / personal + work accounts)

1. Go to <https://portal.azure.com> → **Microsoft Entra ID → App registrations → New registration**.
2. Name: `Trip Checklist`. Supported account types: **Accounts in any organizational directory and personal Microsoft accounts** (lets both your BairesDev and Gmail-linked Microsoft accounts work).
3. **Redirect URI**: Web → `http://localhost:3000/api/auth/callback/microsoft-entra-id`
4. After creation, copy **Application (client) ID** → `AUTH_MICROSOFT_ENTRA_ID_ID`.
5. **Certificates & secrets → New client secret** → copy the *Value* (shown only once) → `AUTH_MICROSOFT_ENTRA_ID_SECRET`.
6. Keep `AUTH_MICROSOFT_ENTRA_ID_ISSUER=https://login.microsoftonline.com/common/v2.0`.

> When deploying, add the production callback URLs to **both** providers
> (`https://your-domain/api/auth/callback/google` and `…/microsoft-entra-id`).

---

## Project structure

```
prisma/schema.prisma        — DB schema (User, Trip, TripItem, Account, Session)
src/auth.ts                 — NextAuth config (Google + Microsoft, seeds defaults on first login)
src/lib/db.ts               — Prisma client singleton
src/lib/packing.ts          — Rules engine (temp/rain/snow/UV/wind/activities/trip type)
src/lib/weather.ts          — Open-Meteo forecast + climate fallback
src/lib/units.ts            — °F↔°C, mph↔km/h, in↔mm conversions
src/lib/seed-defaults.ts    — Spreadsheet items pre-loaded for two seeded users
src/app/api/                — REST endpoints (trips, items, geocode, me)
src/app/trips/              — Trips list + new-trip form + detail/checklist
src/app/settings/           — Units toggle + editable personal defaults
src/app/login/              — Google / Microsoft sign-in buttons
```

---

## Useful commands

```powershell
npm run dev          # start dev server
npm run build        # production build
npm start            # serve built app
npm run db:studio    # GUI to inspect SQLite contents
npm run db:migrate   # create & apply a new migration
```

The legacy single-file prototype is preserved as `index.html` (no server needed) — safe to delete.
