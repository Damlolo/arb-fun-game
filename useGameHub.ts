import { useState, useCallback } from "react";
import {
  useAccount,
  useWalletClient,
  usePublicClient,
  useReadContract,
} from "wagmi";
import { parseEther, formatEther, decodeEventLog } from "viem";
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
  | "awaiting_wallet"
  | "processing"
  | "success"
  | "error";

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

        // Send transaction
        const txHash = await walletClient.writeContract({
          address: GAME_HUB_ADDRESS as `0x${string}`,
          abi: GAME_HUB_ABI,
          functionName: "play",
          args: [game, BigInt(choice)],
          value: betWei,
        });

        setStatus("processing");

        // Wait for receipt
        const receipt = await publicClient.waitForTransactionReceipt({
          hash: txHash,
        });

        // Parse GamePlayed event
        let result: GameResult = {
          game,
          choice,
          result: 0,
          won: false,
          payout: 0n,
          funRewarded: 0n,
          txHash,
        };

        for (const log of receipt.logs) {
          try {
            const decoded = decodeEventLog({
              abi: GAME_HUB_ABI,
              data: log.data,
              topics: log.topics,
              eventName: "GamePlayed",
            });
            result = {
              game,
              choice,
              result: Number(decoded.args.result),
              won: decoded.args.won,
              payout: decoded.args.payout,
              funRewarded: decoded.args.funRewarded,
              txHash,
            };
            break;
          } catch {
            /* skip non-matching logs */
          }
        }

        setLastResult(result);
        setStatus("success");
        refetchFun();
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : "Transaction failed";
        // Surface user-friendly messages
        if (msg.includes("insufficient house balance")) {
          setError("House is out of ETH. Try again later.");
        } else if (msg.includes("User rejected")) {
          setError("Transaction rejected.");
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
    funBalance: funBalance ?? 0n,
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
