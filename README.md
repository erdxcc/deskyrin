# Deskyrin

Deskyrin is a campaign-driven platform built on Solana.
Users complete partner tasks, earn AC, stake AC, and claim vested PT.

## Repository Structure

- `frontend/` — React + Vite web app
- `backend/` — Express API + SQLite
- `programs/bbm/` — Anchor smart contract
- `scripts/` — utility scripts
- `tests/` — test suite

## Local Development

Install dependencies:

```bash
npm run install:all
```

Run frontend + backend:

```bash
npm run dev
```

Default local URLs:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3001`
- Health check: `GET /health`

## Environment Variables

### Frontend (`frontend/.env`)

- `VITE_API_URL=` (leave empty for local proxy)
- `VITE_SOLANA_RPC_URL=https://api.devnet.solana.com`
- `VITE_PROGRAM_ID=4mpEQjcASo912VDw8HtW89Ps44T4q8BaaVpYPRup4AQi`

### Backend (`backend/.env`)

- `PORT=3001`
- `CORS_ORIGIN=` (comma-separated allowlist in production)
- `DATABASE_PATH=./data/recycling.db`
- `WALLET_ENCRYPTION_SECRET=<long-random-string>`
- `JWT_SECRET=<long-random-string>`
- `JWT_EXPIRES_IN=7d`
- `ADMIN_API_KEY=<admin-key>`
- `SOLANA_RPC_URL=https://api.devnet.solana.com`
- `RECYCLING_PROGRAM_ID=4mpEQjcASo912VDw8HtW89Ps44T4q8BaaVpYPRup4AQi`
- `SOLANA_PARTNER_KEYPAIR=<json secret key>`
- `SOLANA_PARTNER_PUBKEY=<public key>`
- `USDC_MINT=<mint pubkey if used>`

## Deployment (Recommended)

### Frontend: Vercel

This repo includes `vercel.json`.

Set in Vercel project settings:

- `VITE_API_URL=https://<your-backend-domain>`
- `VITE_SOLANA_RPC_URL=https://api.devnet.solana.com`
- `VITE_PROGRAM_ID=4mpEQjcASo912VDw8HtW89Ps44T4q8BaaVpYPRup4AQi`

### Backend: Railway

This repo includes `railway.json`.

Set in Railway service settings:

- `CORS_ORIGIN=https://<your-frontend-domain>`
- all required backend variables listed above

Use a persistent volume for SQLite data.

## Solana Notes

- Current deployment target: Devnet
- Program ID: `4mpEQjcASo912VDw8HtW89Ps44T4q8BaaVpYPRup4AQi`
- `setup_deskyrin_staking` must be initialized before AC/PT actions work

