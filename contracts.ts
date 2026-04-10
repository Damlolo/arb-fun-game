// ─────────────────────────────────────────────────────────────────────────────
//  Contract addresses — update these after deployment
// ─────────────────────────────────────────────────────────────────────────────
export const GAME_HUB_ADDRESS   = "0xD10a252c80521d090ECC74d13305c3Cc8d817082";
export const FUN_TOKEN_ADDRESS  = "0x06e7836A655AaB61C214302DCE5e62dfA57805eD";

export const ARBITRUM_SEPOLIA_CHAIN_ID = 421614;

// ─────────────────────────────────────────────────────────────────────────────
//  ABIs (minimal — only what the frontend needs)
// ─────────────────────────────────────────────────────────────────────────────
export const GAME_HUB_ABI = [
  // commitPlay — single tx to lock bet and trigger VRF
  {
    inputs: [
      { internalType: "uint8",   name: "game",   type: "uint8"   },
      { internalType: "uint256", name: "choice", type: "uint256" },
    ],
    name: "commitPlay",
    outputs: [{ internalType: "uint256", name: "requestId", type: "uint256" }],
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
  // getActiveRequest — check if player has a pending VRF request
  {
    inputs: [{ internalType: "address", name: "player", type: "address" }],
    name: "getActiveRequest",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  // GameCommitted event — emitted by commitPlay, contains requestId
  {
    anonymous: false,
    inputs: [
      { indexed: true,  internalType: "address", name: "player",    type: "address" },
      { indexed: true,  internalType: "uint8",   name: "game",      type: "uint8"   },
      { indexed: false, internalType: "uint256", name: "betAmount", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "choice",    type: "uint256" },
      { indexed: false, internalType: "uint256", name: "requestId", type: "uint256" },
    ],
    name: "GameCommitted",
    type: "event",
  },
  // GamePlayed event — emitted by fulfillRandomWords (Chainlink VRF callback)
  {
    anonymous: false,
    inputs: [
      { indexed: true,  internalType: "address", name: "player",      type: "address" },
      { indexed: true,  internalType: "uint8",   name: "game",        type: "uint8"   },
      { indexed: false, internalType: "uint256", name: "choice",      type: "uint256" },
      { indexed: false, internalType: "uint256", name: "result",      type: "uint256" },
      { indexed: false, internalType: "bool",    name: "won",         type: "bool"    },
      { indexed: false, internalType: "uint256", name: "payout",      type: "uint256" },
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
//  Swap / liquidity links
// ─────────────────────────────────────────────────────────────────────────────
export const UNISWAP_SWAP_URL =
  `https://app.camelot.exchange/?chain=arbitrumSepolia&token2=${FUN_TOKEN_ADDRESS}`;

export const UNISWAP_ADD_LIQUIDITY_URL =
  `https://app.camelot.exchange/liquidity?chain=arbitrumSepolia&token1=ETH&token2=${FUN_TOKEN_ADDRESS}`;

// Game type enum — must match Solidity
export enum GameType {
  COINFLIP = 0,
  DICE     = 1,
  WHEEL    = 2,
}
