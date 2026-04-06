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
