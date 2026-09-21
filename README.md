# MoneyTrail API

![API tests](https://github.com/TanviMalewar/MoneyTrail-API/actions/workflows/api-tests.yml/badge.svg)

A ledger-based banking REST API built with **Node.js, Express 5 and MongoDB**. Users can register, open accounts, check balances and transfer money. Every transfer is recorded as immutable ledger entries inside a database transaction, and every transfer is idempotent, so a retried request can never move money twice.

The project also has an automated DevOps layer: **Postman/Newman API tests, Docker, and a GitHub Actions pipeline** that tests every push.

## Features

**Backend**
- Register, log in and log out with JWT authentication
- Logout blacklists the token, so it stops working immediately
- Multiple accounts per user, with balances calculated from the ledger
- Atomic transfers using MongoDB transactions
- Idempotency keys to make retries safe
- Ownership checks, plus a privileged system user who can add starting funds

**DevOps**
- Docker Compose runs the API and MongoDB with one command
- Automated API tests for every route, run by Newman
- GitHub Actions runs the tests on every push and pull request
- A throwaway test database, so no test data is left behind

## Tech stack

| Area | Tools |
|---|---|
| Runtime / framework | Node.js 22, Express 5 |
| Database | MongoDB 7, Mongoose 9 |
| Auth | jsonwebtoken, bcryptjs |
| Email | Nodemailer (Gmail OAuth2, can be switched off) |
| Testing | Postman collection + Newman |
| DevOps | Docker, Docker Compose, GitHub Actions |

## How the money logic works

- **Ledger, not balances.** Each transfer writes a `DEBIT` for the sender and a `CREDIT` for the receiver. An account's balance is its credits minus its debits. Ledger entries cannot be updated or deleted.
- **Atomic.** The transaction record, both ledger entries and the final status commit together, or not at all. This needs MongoDB running as a **replica set**, which the Docker setup handles for you.
- **Idempotent.** Every transfer has a unique `idempotencyKey`. Sending the same key again returns the original result instead of moving money again.
- **System user.** A user flagged `systemUser` can add starting funds to accounts. This flag cannot be set through the API. It is created by the seed script.

## Quick start (Docker)

You need [Docker Desktop](https://www.docker.com/products/docker-desktop/).

```bash
docker compose up --build --wait                          # start MongoDB + API
docker compose exec app node scripts/seed-system-user.js  # create the system user
```

Open <http://localhost:5000>. You should see `Ledger service is up and running`.

To stop everything **and delete the test database**:

```bash
docker compose down -v
```

The seeded test system login is `system@moneytrail.test` / `System@1234`. The Docker setup is for testing only. It uses a dummy JWT secret and turns real emails off.

## Running without Docker

1. Install Node.js 22 and have a MongoDB **replica set** (Atlas works). Use a database with `test` in its name.
2. Create a `.env` file:
   ```
   MONGO_URI="mongodb+srv://<user>:<pass>@<cluster>/moneytrail_test"
   JWT_SECRET=change-me
   EMAIL_DISABLED=true
   ```
3. Run:
   ```bash
   npm install
   npm run seed
   npm run dev
   ```

The seed script refuses to run on a database whose name does not contain "test", so it cannot touch real data by accident.

## Environment variables

| Variable | Description |
|---|---|
| `MONGO_URI` | MongoDB connection string (replica set) |
| `JWT_SECRET` | Secret used to sign tokens |
| `EMAIL_DISABLED` | Set to `true` to skip sending emails |
| `EMAIL_USER`, `CLIENT_ID`, `CLIENT_SECRET`, `REFRESH_TOKEN` | Gmail OAuth2, only needed when emails are on |

Never commit your `.env` file.

## API reference

Base URL: `http://localhost:5000`. Protected routes take `Authorization: Bearer <token>` (or the `token` cookie set at login).

| Method | Route | Auth | Description |
|---|---|---|---|
| GET | `/` | none | Health check |
| POST | `/api/auth/register` | none | Create a user |
| POST | `/api/auth/login` | none | Log in and get a token |
| POST | `/api/auth/logout` | none | Blacklist the current token |
| POST | `/api/accounts` | user | Create an account |
| GET | `/api/accounts` | user | List your accounts |
| GET | `/api/accounts/balance/:accountId` | user | Get an account balance |
| POST | `/api/transactions` | user | Transfer money |
| POST | `/api/transactions/system/initial-funds` | system user | Add starting funds |

**Register / login**

```json
{ "name": "Alice", "email": "alice@example.com", "password": "Test@1234" }
```

Login needs only `email` and `password`. Both return `{ "user": {...}, "token": "..." }`.
Status codes: `201` created, `200` logged in, `400` invalid input, `401` wrong credentials, `422` email already registered.

**Transfer**

```json
{
  "fromAccount": "<your account id>",
  "toAccount": "<any account id>",
  "amount": 2500,
  "idempotencyKey": "any-unique-string"
}
```

| Status | Meaning |
|---|---|
| 201 | Transfer completed |
| 200 | Same `idempotencyKey` used before, so nothing moved again |
| 400 | Invalid input, amount not a number above 0, or insufficient balance |
| 401 | Missing or invalid token |
| 403 | `fromAccount` belongs to someone else |

**Initial funds** (system user only): send `{ "toAccount": "<id>", "amount": 10000, "idempotencyKey": "..." }`. Returns `403` for a normal user.

## Testing

API tests are in `postman/` and run with [Newman](https://github.com/postmanlabs/newman):

```bash
npm test
```

They cover every route, including wrong passwords, invalid input, other people's accounts, insufficient funds, repeated idempotency keys, and checks that balances stay correct after failed attempts. Each run creates fresh users and keys, so it can be repeated any number of times.

You can also import `postman/MoneyTrail-green.postman_collection.json` and `postman/MoneyTrail-local.postman_environment.json` into Postman and run the folders in order. `MoneyTrail.postman_collection.json` is the full collection with a few extra edge-case checks.

## CI with GitHub Actions

`.github/workflows/api-tests.yml` runs on every push and pull request to `main`:

1. Start the API and MongoDB with Docker Compose
2. Seed the system user
3. Run the Postman collection with Newman
4. Upload the test report as an artifact
5. Delete everything with `docker compose down -v`

A green tick means every test passed. A red cross means something broke, and the app logs are printed to help you find it.

## Project structure

```
.github/workflows/api-tests.yml   CI pipeline
postman/                          API test collections
scripts/seed-system-user.js       creates the system user
src/                              app, controllers, middlewares, models, routes, services
Dockerfile, docker-compose.yml    containerized app + database
server.js                         entry point
```

## Roadmap

- Run the full collection in CI
- Deploy the Docker image automatically
- Add rate limiting and `httpOnly` cookies
- Add transaction history and account freeze/close endpoints
