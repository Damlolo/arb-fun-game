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
 * Randomness: commit-reveal using future blockhash + user secret.
 * Players first commit a hash, then reveal in a later block.
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
    uint256 public commitDelayBlocks = 1;
    uint256 public commitExpiryBlocks = 200;

    struct PendingGame {
        GameType game;
        uint256 betAmount;
        uint256 commitBlock;
        bytes32 commitment;
    }

    mapping(address => PendingGame) public pendingGames;

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
    event GameCommitted(address indexed player, GameType indexed game, uint256 betAmount, bytes32 commitment, uint256 commitBlock);
    event GameCommitExpired(address indexed player, uint256 betAmount, uint256 commitBlock);

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

    function setCommitWindows(uint256 delayBlocks, uint256 expiryBlocks) external onlyOwner {
        require(delayBlocks > 0, "GameHub: delay=0");
        require(expiryBlocks > delayBlocks, "GameHub: expiry <= delay");
        require(expiryBlocks <= 250, "GameHub: expiry too high");
        commitDelayBlocks = delayBlocks;
        commitExpiryBlocks = expiryBlocks;
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

    function _rand(bytes32 seed, uint256 commitBlock) internal returns (uint256) {
        _nonce++;
        bytes32 bh = blockhash(commitBlock + commitDelayBlocks);
        require(bh != bytes32(0), "GameHub: stale commit");
        return uint256(
            keccak256(
                abi.encodePacked(
                    bh,
                    seed,
                    msg.sender,
                    address(this),
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
    function commitPlay(GameType game, bytes32 commitment) external payable nonReentrant {
        require(msg.value >= minBet, "GameHub: bet below minimum");
        require(msg.value <= maxBet, "GameHub: bet above maximum");
        require(commitment != bytes32(0), "GameHub: bad commitment");
        require(pendingGames[msg.sender].betAmount == 0, "GameHub: pending game exists");

        pendingGames[msg.sender] = PendingGame({
            game: game,
            betAmount: msg.value,
            commitBlock: block.number,
            commitment: commitment
        });

        emit GameCommitted(msg.sender, game, msg.value, commitment, block.number);
    }

    /**
     * @notice Reveal your committed choice and secret.
     * @param choice COINFLIP: 0=heads 1=tails | DICE: 1-6 | WHEEL: ignored
     * @param secret bytes32 secret used when creating the commitment
     */
    function revealPlay(uint256 choice, bytes32 secret) external nonReentrant {
        PendingGame memory p = pendingGames[msg.sender];
        require(p.betAmount > 0, "GameHub: no pending game");
        require(
            block.number > p.commitBlock + commitDelayBlocks,
            "GameHub: wait for commit delay"
        );
        require(
            block.number <= p.commitBlock + commitExpiryBlocks,
            "GameHub: commit expired"
        );

        bytes32 expected = keccak256(
            abi.encodePacked(
                msg.sender,
                address(this),
                block.chainid,
                p.game,
                choice,
                secret
            )
        );
        require(expected == p.commitment, "GameHub: bad reveal");

        delete pendingGames[msg.sender];

        uint256 rand = _rand(secret, p.commitBlock);
        uint256 result;
        uint256 payout;
        bool won;
        GameType game = p.game;
        uint256 betAmount = p.betAmount;

        if (game == GameType.COINFLIP) {
            require(choice == 0 || choice == 1, "GameHub: choice must be 0 or 1");
            result = rand % 2;
            won = (choice == result);
            if (won) {
                payout = (betAmount * 190) / 100; // 1.9x
            }
        } else if (game == GameType.DICE) {
            require(choice >= 1 && choice <= 6, "GameHub: choice must be 1-6");
            result = (rand % 6) + 1;
            won = (choice == result);
            if (won) {
                payout = (betAmount * 570) / 100; // 5.7x
            }
        } else if (game == GameType.WHEEL) {
            result = rand % 8;
            if (result == 0) {
                payout = (betAmount * 475) / 100; // 4.75x — jackpot (1 in 8)
                won = true;
            } else if (result < 3) {
                payout = (betAmount * 190) / 100; // 1.9x — near miss (2 in 8)
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
                funRewarded = (betAmount * funRewardRate) / 1 ether;
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

    /// @notice Clears an expired commitment (funds remain in the house bankroll).
    function clearExpiredCommitment(address player) external {
        PendingGame memory p = pendingGames[player];
        require(p.betAmount > 0, "GameHub: no pending game");
        require(
            block.number > p.commitBlock + commitExpiryBlocks,
            "GameHub: commit not expired"
        );
        delete pendingGames[player];
        emit GameCommitExpired(player, p.betAmount, p.commitBlock);
    }

    /// @dev Deprecated insecure single-tx flow, kept to avoid accidental use.
    function play(GameType, uint256) external payable {
        revert("GameHub: use commitPlay + revealPlay");
    }

    // ─── View Helpers ─────────────────────────────────────────────────────────

    function houseBalance() external view returns (uint256) {
        return address(this).balance;
    }

    receive() external payable {
        emit FundsDeposited(msg.sender, msg.value);
    }
}
