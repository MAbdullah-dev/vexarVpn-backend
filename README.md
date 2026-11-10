# VEXRAVPN backend

NestJS control-plane foundation for VEXRAVPN. This service authenticates Android clients and does not open a VPN tunnel, provision WireGuard peers, or sell subscriptions. The Android app continues to use its simulated session until a later stage connects the two.

The React Native application stays in its own repository. This repository is the backend.

## Planned modules

`HealthModule`, `AuthModule`, `UsersModule`, and `DevicesModule` are implemented. Authentication routes issue and revoke refresh-token families. `GET /api/v1/users/me` and `PATCH /api/v1/users/me` read and rename the signed-in profile. `POST /api/v1/devices`, `GET /api/v1/devices`, and `DELETE /api/v1/devices/:id` register, list, and revoke the signed-in user's devices. Later stages can add:

- `ServersModule`
- `ConnectionsModule`
- `SubscriptionsModule`
- `AdminModule`

Those modules are not registered, and this API does not expose them.

## Requirements

- Node.js 22 or newer
- npm
- PostgreSQL already installed on the machine

Docker is not required. `docker-compose.yml` remains available for someone who prefers a container later.

## Setup

1. Install dependencies.

```bash
npm install
```

2. Create the local database with TablePlus or `psql`. The application reads the connection only from `DATABASE_URL`.

**TablePlus**

- Open TablePlus and connect to the local server, usually host `localhost` and port `5432`.
- Use the PostgreSQL role and password from that Windows installation.
- Open a SQL tab on the maintenance database, normally `postgres`.
- Run:

```sql
CREATE DATABASE vexravpn;
```

**psql**

On Windows the client is often `C:\Program Files\PostgreSQL\16\bin\psql.exe`. The version directory may differ.

```powershell
& "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -h localhost -d postgres
```

Then, inside `psql`:

```sql
CREATE DATABASE vexravpn;
\q
```

3. Copy the environment example and replace `YOUR_PASSWORD` with the password for that PostgreSQL role. Keep `.env` on this machine.

```powershell
Copy-Item .env.example .env
```

```text
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/vexravpn?schema=public
```

If `.env` already contains NestJS Observe keys, add the database URL beside them. Do not commit `.env` or a real password.

4. Generate the Prisma client and apply migrations. PostgreSQL must already be running as a Windows service.

```bash
npm run db:generate
npm run db:migrate
```

5. Start the API.

```bash
npm run start:dev
```

6. Check health.

```bash
curl http://localhost:3000/api/v1/health
```

A ready database returns HTTP 200:

```json
{
  "status": "ok",
  "info": {
    "application": { "status": "up" },
    "database": { "status": "up" }
  },
  "error": {},
  "details": {
    "application": { "status": "up" },
    "database": { "status": "up" }
  }
}
```

`responseTime` is also included on each check. If PostgreSQL is down, the process can still start. The same URL then returns HTTP 503 with `application` up and `database` down. The body does not include the database URL or credentials.

Set `ACCESS_TOKEN_KEY` in `.env` to at least 32 random bytes before starting the API. The process refuses to start when that key is missing or shorter. `ACCESS_TOKEN_TTL` defaults to 15 minutes, `REFRESH_TOKEN_TTL` to 30 days, and `REFRESH_TOKEN_ABSOLUTE_TTL` to 90 days.

End-to-end tests use a separate database named `vexravpn_test` on the same PostgreSQL server. Create it the same way as `vexravpn`, then apply migrations with `DATABASE_URL` pointed at `vexravpn_test`. The test run does not reset `vexravpn`.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run start:dev` | Development server with reload |
| `npm run build` | Generate the Prisma client and compile |
| `npm run start:prod` | Run the compiled server |
| `npm run db:generate` | Generate the Prisma client |
| `npm run db:migrate` | Apply committed migrations |
| `npm run db:migrate:dev` | Create and apply a development migration |
| `npm test` | Unit tests |
| `npm run test:e2e` | HTTP health and authentication tests against `vexravpn_test` |
| `npm run lint` | Lint `src` and `test` |

## Security boundaries

- Client WireGuard private keys stay on the device. The database can later store a device public key only.
- `VpnServer.wireguardPublicKey` is the server public key. Server private keys, SSH credentials, and provisioning secrets are not columns and are not returned by the API.
- Gateway changes, when they exist, will use a separate authenticated channel. This stage has no provisioning endpoint.
- Secrets are read from the environment. `.env.example` contains placeholders.
- Logs and health errors omit connection strings and driver messages.
- CORS origins come from `CORS_ORIGINS`. An empty value allows no browser origin.
- Helmet, a validation pipe, and a global error filter are enabled in `src/app.setup.ts`.
- `installId` is the installation id sent by the client. It does not prove possession of a device, and a copied refresh token can be used from another client until that token's family is revoked.
- Revoking a refresh-token family does not expire access tokens already issued. Those tokens remain valid until their expiry, at most `ACCESS_TOKEN_TTL` (15 minutes by default). Revoking the device makes the authentication guard reject that device's access tokens.
- Login keeps a hard per-IP limit. Repeated failures for the same IP and email add a growing delay. That delay does not lock the email for other addresses.

## Optional Docker PostgreSQL

`docker-compose.yml` can start a separate PostgreSQL 16 container. It creates the role `vexar` and the database `vexar_vpn`. A developer who uses that container sets `DATABASE_URL` to match those values. The native Windows setup above uses the database `vexravpn` and the local PostgreSQL role.

```bash
docker compose up -d
```

## Tests

This NestJS app is ESM. Tests use Vitest, which is the runner the project was generated with. Jest remains the test runner in the React Native repository.
