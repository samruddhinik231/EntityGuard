# Frontend

React + Vite client for the UEBA dashboard.

The UI now requires login and uses backend HttpOnly cookie sessions from `POST /api/v1/auth/login`.

## Run

```bash
npm run dev
```

## Environment

Copy `.env.example` to `.env`.

- `VITE_API_BASE_URL`: optional base URL for REST calls
- `VITE_SOCKET_URL`: Socket.IO backend URL

When `VITE_API_BASE_URL` is empty, Vite proxy forwards `/api` to `http://localhost:5000` in development.

## Default Dev Accounts

These accounts come from backend `AUTH_USERS_JSON` (in `server/.env`):

- `analyst` / `analyst123`
- `admin` / `admin123`
- `connector` / `connector123`

For production, use `passwordHash` values (bcrypt) in `AUTH_USERS_JSON`.

Backend can also use PostgreSQL-based auth users with `AUTH_PROVIDER=postgres`.
