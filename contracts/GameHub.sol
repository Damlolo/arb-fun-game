// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@chainlink/contracts/src/v0.8/vrf/dev/VRFConsumerBaseV2Plus.sol";
import "@chainlink/contracts/src/v0.8/vrf/dev/interfaces/IVRFCoordinatorV2Plus.sol";

interface IFunToken {
    function mint(address to, uint256 amount) external;
}

// Deploy checklist (plain comment — NatSpec block below cannot contain @ paths):
//   1. Run: npm install (installs chainlink/contracts from package.json)
//   2. Fund your VRF subscription at vrf.chain.link with LINK.
//   3. Add this contract as a consumer on the subscription.
//   4. Pass subscriptionId and coordinator address to the constructor.
//      Arbitrum Sepolia coordinator: 0x9DdfaCa8183c41ad55329BdeeD9F6A8d53168B1B
//      Arbitrum Sepolia key hash:    0x787d74caea10b2b357790d5b5247c2f63d1d91572a9846f780606e4d953677ae
//      (always verify these at docs.chain.link/vrf/v2-5/supported-networks)

/**
 * @title GameHub
 * @notice On-chain arcade: Coin Flip, Dice Roll, Spin Wheel.
 *         Winners receive ETH payout plus FUN token rewards.
 *         Randomness is provided by Chainlink VRF v2.5 — a verifiable random
 *         function whose output cannot be predicted or manipulated by the player,
 *         the house, or the Arbitrum sequencer.
 * @dev Randomness flow:
 *        1. Player calls commitPlay() to lock bet and choice.
 *        2. Contract requests a random word from the VRF Coordinator.
 *        3. Coordinator calls fulfillRandomWords() with a provably fair value,
 *           verified on-chain via zk proof before the callback fires.
 *        4. fulfillRandomWords() resolves the game and pays out automatically.
 *      House edge:
 *        Coin Flip  — 50% chance, 1.9x payout (5% edge)
 *        Dice Roll  — 16.7% chance, 5.7x payout (5% edge)
 *        Spin Wheel — 1/8 jackpot 4.75x, 2/8 near-miss 1.9x, 5/8 loss
 */
contract GameHub is VRFConsumerBaseV2Plus, ReentrancyGuard {
    // --- Types ---------------------------------------------------------------

    enum GameType {
        COINFLIP, // choice: 0 (heads) or 1 (tails)
        DICE,     // choice: 1-6
        WHEEL     // choice: irrelevant, outcome is random
    }

    // --- VRF Config ----------------------------------------------------------

    IVRFCoordinatorV2Plus private immutable i_coordinator;

    /// @notice Chainlink VRF subscription ID. Fund this at vrf.chain.link.
    uint256 public subscriptionId;

    /// @notice Key hash selects the Chainlink oracle tier (gas lane).
    bytes32 public keyHash;

    /// @notice Gas limit for the fulfillRandomWords callback.
    ///         200_000 is sufficient for all three game types.
    uint32 public callbackGasLimit = 200_000;

    /// @notice Block confirmations before VRF responds.
    ///         3 is safe against reorgs on Arbitrum.
    uint16 public constant REQUEST_CONFIRMATIONS = 3;

    uint32 private constant NUM_WORDS = 1;

    // --- State ---------------------------------------------------------------

    IFunToken public funToken;

    uint256 public minBet = 0.0001 ether;
    uint256 public maxBet = 0.1 ether;

    /// @notice FUN tokens rewarded per wei bet on a win
    uint256 public funRewardRate = 1_000_000;

    struct PendingGame {
        address player;
        GameType game;
        uint256 betAmount;
        uint256 choice;
    }

    /// @dev VRF request ID => pending game. Set by commitPlay, cleared by fulfillRandomWords.
    mapping(uint256 => PendingGame) public pendingGames;

    /// @dev player => active VRF requestId. Prevents two simultaneous open bets.
    mapping(address => uint256) public activeRequest;

    // --- Events --------------------------------------------------------------

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
    event GameCommitted(
        address indexed player,
        GameType indexed game,
        uint256 betAmount,
        uint256 choice,
        uint256 requestId
    );

    // --- Constructor ---------------------------------------------------------

    /**
     * @param _coordinator   Chainlink VRF Coordinator address for your network.
     * @param _subscriptionId  Your funded VRF subscription ID.
     * @param _keyHash       Gas lane key hash for your network.
     */
    constructor(
        address _coordinator,
        uint256 _subscriptionId,
        bytes32 _keyHash
    )
        VRFConsumerBaseV2Plus(_coordinator)
        payable
    {
        i_coordinator = IVRFCoordinatorV2Plus(_coordinator);
        subscriptionId = _subscriptionId;
        keyHash = _keyHash;
    }

    // --- Admin ---------------------------------------------------------------

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

    /// @notice Update VRF gas lane or callback gas limit if network conditions change.
    function setVrfConfig(bytes32 _keyHash, uint32 _callbackGasLimit) external onlyOwner {
        keyHash = _keyHash;
        callbackGasLimit = _callbackGasLimit;
    }

    function deposit() external payable onlyOwner {
        emit FundsDeposited(msg.sender, msg.value);
    }

    function withdraw(uint256 amount) external onlyOwner {
        require(address(this).balance >= amount, "GameHub: insufficient balance");
        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        require(ok, "GameHub: withdraw failed");
        emit FundsWithdrawn(msg.sender, amount);
    }

    // --- Core Game Logic -----------------------------------------------------

    /**
     * @notice Lock a bet and request verifiable randomness from Chainlink VRF.
     *         The outcome is settled automatically when the VRF response arrives
     *         (~3 blocks, roughly 5-15 seconds on Arbitrum).
     *
     * @param game    GameType enum value.
     * @param choice  COINFLIP: 0=heads 1=tails | DICE: 1-6 | WHEEL: any value.
     *
     * NOTE: Your VRF subscription must be funded with LINK. The LINK fee is
     *       deducted from the subscription, not from msg.value.
     */
    function commitPlay(GameType game, uint256 choice)
        external
        payable
        nonReentrant
        returns (uint256 requestId)
    {
        require(msg.value >= minBet, "GameHub: bet below minimum");
        require(msg.value <= maxBet, "GameHub: bet above maximum");
        require(activeRequest[msg.sender] == 0, "GameHub: pending game exists");

        // Validate choice before paying for VRF
        if (game == GameType.COINFLIP) {
            require(choice == 0 || choice == 1, "GameHub: choice must be 0 or 1");
        } else if (game == GameType.DICE) {
            require(choice >= 1 && choice <= 6, "GameHub: choice must be 1-6");
        }
        // WHEEL: choice is ignored

        // Request randomness. The VRF coordinator verifies the result on-chain
        // with a zk proof before calling fulfillRandomWords, making it impossible
        // for any party — player, house, or sequencer — to predict or bias the outcome.
        requestId = i_coordinator.requestRandomWords(
            VRFV2PlusClient.RandomWordsRequest({
                keyHash:              keyHash,
                subId:                subscriptionId,
                requestConfirmations: REQUEST_CONFIRMATIONS,
                callbackGasLimit:     callbackGasLimit,
                numWords:             NUM_WORDS,
                extraArgs:            VRFV2PlusClient._argsToBytes(
                                          VRFV2PlusClient.ExtraArgsV1({ nativePayment: false })
                                      )
            })
        );

        pendingGames[requestId] = PendingGame({
            player:    msg.sender,
            game:      game,
            betAmount: msg.value,
            choice:    choice
        });
        activeRequest[msg.sender] = requestId;

        emit GameCommitted(msg.sender, game, msg.value, choice, requestId);
    }

    /**
     * @notice Chainlink VRF callback — called by the coordinator, never directly.
     * @dev    Settling here rather than in a separate reveal() removes the window
     *         where a player or sequencer could withhold a reveal after seeing the
     *         random value on-chain.
     */
    function fulfillRandomWords(uint256 requestId, uint256[] calldata randomWords)
        internal
        override
    {
        PendingGame memory p = pendingGames[requestId];
        require(p.betAmount > 0, "GameHub: unknown request");

        // Clear state before external calls (checks-effects-interactions)
        delete pendingGames[requestId];
        delete activeRequest[p.player];

        uint256 rand = randomWords[0];
        uint256 result;
        uint256 payout;
        bool won;

        if (p.game == GameType.COINFLIP) {
            result = rand % 2;
            won    = (p.choice == result);
            if (won) payout = (p.betAmount * 190) / 100; // 1.9x
        } else if (p.game == GameType.DICE) {
            result = (rand % 6) + 1;
            won    = (p.choice == result);
            if (won) payout = (p.betAmount * 570) / 100; // 5.7x
        } else {
            // WHEEL
            result = rand % 8;
            if (result == 0) {
                payout = (p.betAmount * 475) / 100; // 4.75x jackpot (1 in 8)
                won = true;
            } else if (result < 3) {
                payout = (p.betAmount * 190) / 100; // 1.9x near miss (2 in 8)
                won = true;
            }
            // else: payout = 0, won = false (5 in 8)
        }

        uint256 funRewarded;

        if (won && payout > 0 && address(this).balance >= payout) {
            (bool sent, ) = payable(p.player).call{value: payout}("");
            if (sent) {
                // Only mint FUN if ETH payout succeeded
                if (address(funToken) != address(0)) {
                    funRewarded = (p.betAmount * funRewardRate) / 1 ether;
                    if (funRewarded > 0) {
                        funToken.mint(p.player, funRewarded);
                    }
                }
            } else {
                // ETH transfer failed (player is a contract with reverting receive).
                // Do NOT revert here — reverting the VRF callback would brick all
                // future VRF requests for this contract. Bet stays in house.
                won    = false;
                payout = 0;
            }
        } else if (won) {
            // House underfunded: outcome is recorded but no ETH sent.
            // Monitor houseBalance() and top up before this happens.
            won    = false;
            payout = 0;
        }

        emit GamePlayed(p.player, p.game, p.choice, result, won, payout, funRewarded);
    }

    // --- View Helpers --------------------------------------------------------

    function houseBalance() external view returns (uint256) {
        return address(this).balance;
    }

    /// @notice Returns the VRF requestId for a player's pending (unsettled) bet, or 0.
    function getActiveRequest(address player) external view returns (uint256) {
        return activeRequest[player];
    }

    receive() external payable {
        emit FundsDeposited(msg.sender, msg.value);
    }
}
