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
  encodePacked,
  keccak256,
  toHex,
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
        const secret = keccak256(
          toHex(`${Date.now()}-${Math.random()}-${address}`)
        );
        const commitment = keccak256(
          encodePacked(
            ["address", "address", "uint256", "uint8", "uint256", "bytes32"],
            [
              address,
              GAME_HUB_ADDRESS as `0x${string}`,
              BigInt(421614),
              game,
              BigInt(choice),
              secret,
            ]
          )
        );

        // Commit transaction
        const commitTx = await walletClient.writeContract({
          address: GAME_HUB_ADDRESS as `0x${string}`,
          abi: GAME_HUB_ABI,
          functionName: "commitPlay",
          args: [game, commitment],
          value: betWei,
        });

        setStatus("processing");

        const commitReceipt = await publicClient.waitForTransactionReceipt({
          hash: commitTx,
        });
        const revealAt = commitReceipt.blockNumber + 1n;
        while ((await publicClient.getBlockNumber()) < revealAt) {
          await new Promise((r) => setTimeout(r, 1200));
        }

        // Reveal transaction
        const txHash = await walletClient.writeContract({
          address: GAME_HUB_ADDRESS as `0x${string}`,
          abi: GAME_HUB_ABI,
          functionName: "revealPlay",
          args: [BigInt(choice), secret],
        });

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
        } else if (
          msg.includes("limit exceeded") ||
          msg.includes("too fast per second") ||
          msg.includes("api.zan.top")
        ) {
          setError("RPC rate-limited by wallet/provider. Wait a few seconds and retry.");
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
