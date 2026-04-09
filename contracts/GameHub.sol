// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IFunToken {
    function mint(address to, uint256 amount) external;
}

/**
 * @title GameHub
 * @notice On-chain arcade: Coin Flip, Dice Roll, Spin Wheel
 *         Winners receive ETH payout + FUN token rewards.
 *
 * Randomness: keccak256(block.timestamp, msg.sender, block.prevrandao)
 * NOTE: block.prevrandao is available on Arbitrum Sepolia (post-Merge).
 *       For mainnet, upgrade to Chainlink VRF.
 *
 * House Edge:
 *   Coin Flip  — 50% chance, 1.9x payout  (5% edge)
 *   Dice Roll  — ~16.7% chance, 5.7x payout (5% edge)
 *   Spin Wheel — varied: 1/8 → 4.75x, 2/8 → 1.9x, 5/8 → 0x
 */
contract GameHub is Ownable, ReentrancyGuard {
    // ─── Types ───────────────────────────────────────────────────────────────

    enum GameType {
        COINFLIP, // choice: 0 (heads) or 1 (tails)
        DICE,     // choice: 1-6
        WHEEL     // choice: irrelevant, outcome is random
    }

    // ─── State ────────────────────────────────────────────────────────────────

    IFunToken public funToken;

    uint256 public minBet = 0.0001 ether;
    uint256 public maxBet = 0.1 ether;

    /// @notice FUN tokens rewarded per wei bet on a win
    /// e.g. 1_000_000 means 1 FUN per 0.000001 ETH (1e12 wei) wagered
    /// Using a high rate ensures small bets (0.0001 ETH) still yield FUN rewards
    uint256 public funRewardRate = 1_000_000;

    uint256 private _nonce;

    // ─── Events ───────────────────────────────────────────────────────────────

    event GamePlayed(
        address indexed player,
        GameType indexed game,
        uint256 choice,
        uint256 result,
        bool won,
        uint256 payout,
        uint256 funRewarded
    );

    event FundsDeposited(address indexed by, uint256 amount);
    event FundsWithdrawn(address indexed to, uint256 amount);
    event FunTokenSet(address token);

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor() Ownable(msg.sender) payable {}

    // ─── Admin ────────────────────────────────────────────────────────────────

    function setFunToken(address _token) external onlyOwner {
        funToken = IFunToken(_token);
        emit FunTokenSet(_token);
    }

    function setRewardRate(uint256 rate) external onlyOwner {
        funRewardRate = rate;
    }

    function setBetLimits(uint256 _min, uint256 _max) external onlyOwner {
        require(_min < _max, "GameHub: invalid limits");
        minBet = _min;
        maxBet = _max;
    }

    function deposit() external payable onlyOwner {
        emit FundsDeposited(msg.sender, msg.value);
    }

    function withdraw(uint256 amount) external onlyOwner {
        require(address(this).balance >= amount, "GameHub: insufficient balance");
        payable(msg.sender).transfer(amount);
        emit FundsWithdrawn(msg.sender, amount);
    }

    // ─── Randomness ───────────────────────────────────────────────────────────

    function _rand() internal returns (uint256) {
        _nonce++;
        return uint256(
            keccak256(
                abi.encodePacked(
                    block.timestamp,
                    block.prevrandao,
                    msg.sender,
                    _nonce
                )
            )
        );
    }

    // ─── Core Game Logic ──────────────────────────────────────────────────────

    /**
     * @notice Play a game.
     * @param game  GameType enum value
     * @param choice COINFLIP: 0=heads 1=tails | DICE: 1-6 | WHEEL: ignored
     */
    function play(GameType game, uint256 choice)
        external
        payable
        nonReentrant
    {
        require(msg.value >= minBet, "GameHub: bet below minimum");
        require(msg.value <= maxBet, "GameHub: bet above maximum");

        uint256 rand = _rand();
        uint256 result;
        uint256 payout;
        bool won;

        if (game == GameType.COINFLIP) {
            require(choice == 0 || choice == 1, "GameHub: choice must be 0 or 1");
            result = rand % 2;
            won = (choice == result);
            if (won) {
                payout = (msg.value * 190) / 100; // 1.9x
            }
        } else if (game == GameType.DICE) {
            require(choice >= 1 && choice <= 6, "GameHub: choice must be 1-6");
            result = (rand % 6) + 1;
            won = (choice == result);
            if (won) {
                payout = (msg.value * 570) / 100; // 5.7x
            }
        } else if (game == GameType.WHEEL) {
            result = rand % 8;
            if (result == 0) {
                payout = (msg.value * 475) / 100; // 4.75x — jackpot (1 in 8)
                won = true;
            } else if (result < 3) {
                payout = (msg.value * 190) / 100; // 1.9x — near miss (2 in 8)
                won = true;
            } else {
                payout = 0; // lose (5 in 8)
                won = false;
            }
        } else {
            revert("GameHub: unknown game");
        }

        uint256 funRewarded;

        if (won && payout > 0) {
            require(
                address(this).balance >= payout,
                "GameHub: insufficient house balance"
            );
            (bool sent, ) = payable(msg.sender).call{value: payout}("");
            require(sent, "GameHub: payout failed");

            // Mint FUN reward tokens
            if (address(funToken) != address(0)) {
                // funRewardRate FUN per ETH wagered
                funRewarded = (msg.value * funRewardRate) / 1 ether;
                if (funRewarded > 0) {
                    funToken.mint(msg.sender, funRewarded);
                }
            }
        }

        emit GamePlayed(
            msg.sender,
            game,
            choice,
            result,
            won,
            payout,
            funRewarded
        );
    }

    // ─── View Helpers ─────────────────────────────────────────────────────────

    function houseBalance() external view returns (uint256) {
        return address(this).balance;
    }

    receive() external payable {
        emit FundsDeposited(msg.sender, msg.value);
    }
}
