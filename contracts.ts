// ─────────────────────────────────────────────────────────────────────────────
//  Contract addresses — update these after deployment
// ─────────────────────────────────────────────────────────────────────────────
export const GAME_HUB_ADDRESS = "0xF67dA5dE3b6c4D8675047eBf0DE71Dd9Ac96227C";
export const FUN_TOKEN_ADDRESS = "0x92E79A3f212f6BD696a2ddB3da374e7776B4daaC";

export const ARBITRUM_SEPOLIA_CHAIN_ID = 421614;

// ─────────────────────────────────────────────────────────────────────────────
//  ABIs (minimal — only what the frontend needs)
// ─────────────────────────────────────────────────────────────────────────────
export const GAME_HUB_ABI = [
  // play
  {
    inputs: [
      { internalType: "uint8", name: "game", type: "uint8" },
      { internalType: "uint256", name: "choice", type: "uint256" },
    ],
    name: "play",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  // houseBalance
  {
    inputs: [],
    name: "houseBalance",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  // minBet / maxBet
  {
    inputs: [],
    name: "minBet",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "maxBet",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  // events
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "player", type: "address" },
      { indexed: true, internalType: "uint8", name: "game", type: "uint8" },
      { indexed: false, internalType: "uint256", name: "choice", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "result", type: "uint256" },
      { indexed: false, internalType: "bool", name: "won", type: "bool" },
      { indexed: false, internalType: "uint256", name: "payout", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "funRewarded", type: "uint256" },
    ],
    name: "GamePlayed",
    type: "event",
  },
] as const;

export const FUN_TOKEN_ABI = [
  {
    inputs: [{ internalType: "address", name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "symbol",
    outputs: [{ internalType: "string", name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
//  Uniswap swap link (update outputCurrency after deploying FunToken)
// ─────────────────────────────────────────────────────────────────────────────
export const UNISWAP_SWAP_URL =
  `https://app.camelot.exchange/?chain=arbitrumSepolia&token2=${0x92E79A3f212f6BD696a2ddB3da374e7776B4daaC}`;

export const UNISWAP_ADD_LIQUIDITY_URL =
  `https://app.camelot.exchange/liquidity?chain=arbitrumSepolia&token1=ETH&token2=${0x92E79A3f212f6BD696a2ddB3da374e7776B4daaC}`;

// Game type enum — must match Solidity
export enum GameType {
  COINFLIP = 0,
  DICE = 1,
  WHEEL = 2,
}
