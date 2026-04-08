# 🎰 ARB Fun House

> **Fully on-chain arcade on Arbitrum Sepolia.**  
> Play Coin Flip, Dice Roll, and Spin Wheel. Win ETH + earn **FUN tokens**. Swap via Uniswap.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      USER WALLET                        │
│              (MetaMask / any injected wallet)           │
└──────────────────────────┬──────────────────────────────┘
                           │ ETH bet
                           ▼
┌─────────────────────────────────────────────────────────┐
│                    GameHub.sol                          │
│  ┌──────────────┐ ┌──────────────┐ ┌─────────────────┐ │
│  │  CoinFlip    │ │  DiceRoll    │ │   SpinWheel     │ │
│  │  50% · 1.9x  │ │ 16.7% · 5.7x│ │ varied payouts  │ │
│  └──────────────┘ └──────────────┘ └─────────────────┘ │
│           │ on win: mint FUN                            │
│           ▼                                             │
│      FunToken.sol (ERC20)                               │
└──────────────────────────────────────────────────────────┘
                           │ FUN tokens
                           ▼
┌─────────────────────────────────────────────────────────┐
│              Uniswap v3 (Arbitrum Sepolia)              │
│           FUN/ETH pool · Swap / Add liquidity           │
└─────────────────────────────────────────────────────────┘
```

---

## Games & Odds

| Game       | Chance    | Payout | House Edge |
|------------|-----------|--------|------------|
| Coin Flip  | 50.0%     | 1.9×   | 5%         |
| Dice Roll  | 16.7%     | 5.7×   | 5%         |
| Spin Wheel | 12.5% J   | 4.75×  | ~5%        |
|            | 25.0% W   | 1.9×   |            |
|            | 62.5% L   | 0×     |            |

---

## Quick Start

### 1 — Prerequisites

```bash
node --version  # v18+ required
```

### 2 — Install dependencies

```bash
npm install
```

### 3 — Environment

Create `.env` in the project root:

```env
PRIVATE_KEY=0x_your_deployer_private_key
ARB_SEPOLIA_RPC=https://sepolia-rollup.arbitrum.io/rpc
ARBISCAN_API_KEY=your_arbiscan_key   # optional, for verify
```

> **Get testnet ETH:** https://faucet.triangleplatform.com/arbitrum/sepolia

### 4 — Compile contracts

```bash
npm run compile
```

### 5 — Deploy

```bash
npm run deploy
```

Output will show both contract addresses. **Copy them.**

### 6 — Update frontend config

Open `frontend/index.html` and replace:
```js
const GAME_HUB_ADDRESS  = "0xYOUR_GAMEHUB_ADDRESS_HERE";
const FUN_TOKEN_ADDRESS = "0xYOUR_FUNTOKEN_ADDRESS_HERE";
```

Also open `frontend/src/config/contracts.ts` and do the same.

### 7 — Add liquidity on Uniswap (IMPORTANT)

Without liquidity, FUN → ETH swaps won't work.

1. Go to: `https://app.uniswap.org/#/add/ETH/YOUR_FUN_TOKEN_ADDRESS?chain=arbitrum-sepolia`
2. Add even a tiny amount (e.g. 0.01 ETH + some FUN)
3. Now swaps work ✅

### 8 — Open the frontend

```bash
# Option A — plain HTML (no build needed)
open frontend/index.html

# Option B — serve it locally
npx serve frontend
```

---

## Contract Verification (optional)

```bash
npx hardhat verify --network arbitrumSepolia YOUR_FUN_TOKEN_ADDRESS
npx hardhat verify --network arbitrumSepolia YOUR_GAMEHUB_ADDRESS
```

---

## Security Notes

- **Randomness**: Uses `keccak256(timestamp, prevrandao, sender, nonce)`. Good enough for testnet / low-stakes play. For mainnet, upgrade to **Chainlink VRF v2.5**.
- **Reentrancy**: Protected via OpenZeppelin `ReentrancyGuard`.
- **House balance**: Contract will revert if house lacks ETH for payout. Fund it generously.
- **Admin controls**: Owner can update bet limits, reward rate, and withdraw ETH.

---

## File Structure

```
arb-funhouse/
├── contracts/
│   ├── FunToken.sol        ← ERC20 reward token
│   └── GameHub.sol         ← Main game contract
├── scripts/
│   └── deploy.js           ← Hardhat deploy script
├── frontend/
│   ├── index.html          ← Full frontend (no build needed)
│   └── src/
│       ├── config/
│       │   ├── contracts.ts ← ABIs + addresses (for Next.js)
│       │   └── wagmi.ts     ← Wagmi config (for Next.js)
│       └── hooks/
│           └── useGameHub.ts ← Contract interaction hook (for Next.js)
├── hardhat.config.js
├── package.json
└── README.md
```

---

## How to describe this project

> *"ARB Fun House is a gamified liquidity funnel where users earn tokens through on-chain gameplay and immediately route that value into real DeFi markets via existing Uniswap infrastructure."*

---

## 🗄️ Supabase Database Setup (Optional — Persist History Off-Chain)

By default, all game/swap/liquidity history is stored in memory (lost on page refresh). You can optionally wire up a **Supabase** Postgres database to persist everything permanently.

### Step 1 — Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) → **Sign up / Log in**
2. Click **New Project**, choose your organisation
3. Set a project name (e.g. `arb-fun-game`), a strong database password, and pick a region
4. Wait ~2 minutes for provisioning

---

### Step 2 — Create Tables

In your Supabase dashboard → **SQL Editor**, paste and run:

```sql
-- Game play history
CREATE TABLE game_history (
  id            BIGSERIAL PRIMARY KEY,
  player        TEXT NOT NULL,
  game_name     TEXT NOT NULL,
  choice        TEXT,
  result        TEXT,
  won           BOOLEAN NOT NULL,
  payout_eth    NUMERIC,
  fun_rewarded  NUMERIC,
  tx_hash       TEXT,
  played_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Swap history
CREATE TABLE swap_history (
  id          BIGSERIAL PRIMARY KEY,
  player      TEXT NOT NULL,
  direction   TEXT NOT NULL,   -- 'ETH→FUN' or 'FUN→ETH'
  amount_in   NUMERIC NOT NULL,
  amount_out  NUMERIC NOT NULL,
  tx_hash     TEXT,
  swapped_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Liquidity history
CREATE TABLE liquidity_history (
  id         BIGSERIAL PRIMARY KEY,
  player     TEXT NOT NULL,
  action     TEXT NOT NULL,   -- 'Add' or 'Remove'
  eth_amount NUMERIC,
  fun_amount NUMERIC,
  lp_tokens  NUMERIC,
  tx_hash    TEXT,
  acted_at   TIMESTAMPTZ DEFAULT NOW()
);
```

---

### Step 3 — Enable Row Level Security

```sql
ALTER TABLE game_history      ENABLE ROW LEVEL SECURITY;
ALTER TABLE swap_history      ENABLE ROW LEVEL SECURITY;
ALTER TABLE liquidity_history ENABLE ROW LEVEL SECURITY;

-- Allow public insert & read (wallet-authenticated actions)
CREATE POLICY "allow_insert" ON game_history      FOR INSERT WITH CHECK (true);
CREATE POLICY "allow_select" ON game_history      FOR SELECT USING (true);
CREATE POLICY "allow_insert" ON swap_history      FOR INSERT WITH CHECK (true);
CREATE POLICY "allow_select" ON swap_history      FOR SELECT USING (true);
CREATE POLICY "allow_insert" ON liquidity_history FOR INSERT WITH CHECK (true);
CREATE POLICY "allow_select" ON liquidity_history FOR SELECT USING (true);
```

---

### Step 4 — Get Your API Keys

1. Go to **Project Settings → API**
2. Copy:
   - **Project URL** (e.g. `https://abcxyz.supabase.co`)
   - **anon / public key**

---

### Step 5 — Add Supabase to `index.html`

Add the Supabase JS SDK **before** the closing `</head>` tag:

```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
```

Then at the top of your `<script>` block, add:

```js
const SUPABASE_URL = 'https://YOUR_PROJECT_REF.supabase.co';
const SUPABASE_KEY = 'your-anon-public-key';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
```

---

### Step 6 — Persist Game History

Inside `addHist()`, after the existing `hist.unshift(...)` logic, add:

```js
// Persist to Supabase (fire-and-forget)
sb.from('game_history').insert({
  player:       await signer.getAddress(),
  game_name:    GNAMES[gi],
  choice:       chL,
  result:       rL,
  won,
  payout_eth:   parseFloat(ethers.formatEther(payout)),
  fun_rewarded: parseFloat(ethers.formatEther(funRewarded)),
}).then(({error}) => { if (error) console.warn('Supabase insert:', error); });
```

---

### Step 7 — Persist Swap History

Inside `addSwapHist()`, after `swapHist.unshift(...)`:

```js
sb.from('swap_history').insert({
  player:     await signer.getAddress(),
  direction,
  amount_in:  parseFloat(amtIn),
  amount_out: parseFloat(amtOut),
  tx_hash:    txHash,
}).then(({error}) => { if (error) console.warn('Supabase swap insert:', error); });
```

---

### Step 8 — Persist Liquidity History

Inside `addLiqHist()`, after `liqHist.unshift(...)`:

```js
sb.from('liquidity_history').insert({
  player:     await signer.getAddress(),
  action,
  eth_amount: parseFloat(ethAmt) || null,
  fun_amount: parseFloat(funAmt) || null,
  lp_tokens:  parseFloat(lpAmt) || null,
  tx_hash:    txHash,
}).then(({error}) => { if (error) console.warn('Supabase liq insert:', error); });
```

---

### Step 9 — Load History on Wallet Connect

After connecting a wallet (inside the `connectWallet` success path), load the player's past records:

```js
const addr = await signer.getAddress();

// Load game history
const { data: gh } = await sb.from('game_history')
  .select('*').eq('player', addr)
  .order('played_at', { ascending: false }).limit(20);
if (gh) {
  hist = gh.map(r => ({
    gi: GNAMES.indexOf(r.game_name),
    chL: r.choice, rL: r.result,
    won: r.won,
    pFmt: r.payout_eth?.toFixed(6) ?? '0.000000',
    fFmt: r.fun_rewarded?.toFixed(2) ?? '0.00',
  }));
  // re-render hist table ...
}

// Load swap history
const { data: sh } = await sb.from('swap_history')
  .select('*').eq('player', addr)
  .order('swapped_at', { ascending: false }).limit(20);
if (sh) {
  swapHist = sh.map(r => ({
    direction: r.direction,
    amtIn: r.amount_in, amtOut: r.amount_out, txHash: r.tx_hash
  }));
  // re-render swapHist table ...
}
```

---

### Step 10 — Deploy the Frontend

Since `index.html` is a single self-contained file you have several zero-config options:

| Option | Steps |
|--------|-------|
| **Supabase Storage** | Dashboard → Storage → New bucket (public) → Upload `index.html` → copy public URL |
| **Vercel** | `npx vercel` in the project folder, or drag-and-drop at vercel.com |
| **Netlify** | Drag `index.html` onto app.netlify.com/drop |
| **GitHub Pages** | Push to repo → Settings → Pages → Source: main branch |
| **IPFS (Fleek)** | app.fleek.co → New site → Upload file → get permanent IPFS URL |
