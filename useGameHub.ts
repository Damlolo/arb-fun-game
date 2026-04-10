import { useState, useCallback } from "react";
import {
  useAccount,
  useWalletClient,
  usePublicClient,
  useReadContract,
} from "wagmi";
import {
  parseEther,
  formatEther,
  decodeEventLog,
} from "viem";
import {
  GAME_HUB_ADDRESS,
  FUN_TOKEN_ADDRESS,
  GAME_HUB_ABI,
  FUN_TOKEN_ABI,
  GameType,
} from "../config/contracts";

export type GameResult = {
  game: GameType;
  choice: number;
  result: number;
  won: boolean;
  payout: bigint;
  funRewarded: bigint;
  txHash: string;
};

export type PlayStatus =
  | "idle"
  | "awaiting_wallet"   // waiting for user to sign commitPlay
  | "awaiting_vrf"      // commitPlay confirmed, waiting for Chainlink VRF callback
  | "success"
  | "error";

// How long to poll for the GamePlayed event after commitPlay confirms.
// VRF on Arbitrum Sepolia typically responds in ~5-30 seconds.
const VRF_POLL_INTERVAL_MS  = 2000;
const VRF_TIMEOUT_MS        = 120_000; // 2 minutes

export function useGameHub() {
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();

  const [status, setStatus] = useState<PlayStatus>("idle");
  const [lastResult, setLastResult] = useState<GameResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ── Read FUN balance ──────────────────────────────────────────────────────
  const { data: funBalance, refetch: refetchFun } = useReadContract({
    address: FUN_TOKEN_ADDRESS as `0x${string}`,
    abi: FUN_TOKEN_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  // ── Read house balance ────────────────────────────────────────────────────
  const { data: houseBalance } = useReadContract({
    address: GAME_HUB_ADDRESS as `0x${string}`,
    abi: GAME_HUB_ABI,
    functionName: "houseBalance",
  });

  // ── Play ──────────────────────────────────────────────────────────────────
  const playGame = useCallback(
    async (game: GameType, choice: number, betEth: string) => {
      if (!walletClient || !publicClient || !address) {
        setError("Wallet not connected");
        return;
      }

      setStatus("awaiting_wallet");
      setError(null);
      setLastResult(null);

      try {
        const betWei = parseEther(betEth);

        // Single transaction: locks bet and triggers VRF request.
        // No second reveal transaction needed — Chainlink settles the outcome.
        const commitTx = await walletClient.writeContract({
          address: GAME_HUB_ADDRESS as `0x${string}`,
          abi: GAME_HUB_ABI,
          functionName: "commitPlay",
          args: [game, BigInt(choice)],
          value: betWei,
        });

        const commitReceipt = await publicClient.waitForTransactionReceipt({
          hash: commitTx,
        });

        // Extract the VRF requestId from the GameCommitted event so we can
        // match the specific GamePlayed event for this bet.
        let requestId: bigint | null = null;
        for (const log of commitReceipt.logs) {
          try {
            const decoded = decodeEventLog({
              abi: GAME_HUB_ABI,
              data: log.data,
              topics: log.topics,
              eventName: "GameCommitted",
            });
            requestId = decoded.args.requestId;
            break;
          } catch { /* skip non-matching logs */ }
        }

        setStatus("awaiting_vrf");

        // Poll for the GamePlayed event emitted by fulfillRandomWords().
        // This is called by the Chainlink VRF coordinator, not by us.
        const fromBlock = commitReceipt.blockNumber;
        const deadline  = Date.now() + VRF_TIMEOUT_MS;
        let   result: GameResult | null = null;

        while (Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, VRF_POLL_INTERVAL_MS));

          const currentBlock = await publicClient.getBlockNumber();

          const logs = await publicClient.getLogs({
            address: GAME_HUB_ADDRESS as `0x${string}`,
            event: GAME_HUB_ABI.find((x) => "name" in x && x.name === "GamePlayed") as any,
            fromBlock,
            toBlock: currentBlock,
          });

          for (const log of logs) {
            try {
              const decoded = decodeEventLog({
                abi: GAME_HUB_ABI,
                data: log.data,
                topics: log.topics,
                eventName: "GamePlayed",
              });

              // Match by player address (and requestId if we got it)
              if (decoded.args.player.toLowerCase() !== address.toLowerCase()) continue;

              result = {
                game,
                choice,
                result:      Number(decoded.args.result),
                won:         decoded.args.won,
                payout:      decoded.args.payout,
                funRewarded: decoded.args.funRewarded,
                txHash:      log.transactionHash ?? commitTx,
              };
              break;
            } catch { /* skip non-matching logs */ }
          }

          if (result) break;
        }

        if (!result) {
          throw new Error(
            "VRF response timed out after 2 minutes. Your bet is safe — " +
            "check back later or contact support. The game will settle when Chainlink responds."
          );
        }

        setLastResult(result);
        setStatus("success");
        refetchFun();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Transaction failed";
        if (msg.includes("insufficient house balance")) {
          setError("House is out of ETH. Try again later.");
        } else if (msg.includes("User rejected") || msg.includes("user rejected")) {
          setError("Transaction rejected.");
        } else if (msg.includes("pending game exists")) {
          setError("You already have an open bet. Wait for Chainlink to settle it (~30s) then try again.");
        } else if (
          msg.includes("limit exceeded") ||
          msg.includes("too fast per second") ||
          msg.includes("api.zan.top")
        ) {
          setError("RPC rate-limited. Wait a few seconds and retry.");
        } else {
          setError(msg);
        }
        setStatus("error");
      }
    },
    [walletClient, publicClient, address, refetchFun]
  );

  const reset = useCallback(() => {
    setStatus("idle");
    setLastResult(null);
    setError(null);
  }, []);

  return {
    isConnected,
    address,
    funBalance:  funBalance  ?? 0n,
    houseBalance: houseBalance ?? 0n,
    playGame,
    status,
    lastResult,
    error,
    reset,
    formatFun: (v: bigint) => parseFloat(formatEther(v)).toFixed(2),
    formatEth: (v: bigint) => parseFloat(formatEther(v)).toFixed(6),
  };
}
