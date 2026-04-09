// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title HubarbPool
 * @notice Constant-product AMM (x * y = k) for FUN / ETH.
 *         LP providers earn 0.3% of every swap.
 *
 * ── Deploy steps ────────────────────────────────────────────────────────────
 *  1. Copy this file into contracts/HubarbPool.sol
 *  2. npx hardhat run scripts/deployPool.js --network arbSepolia
 *  3. Paste the deployed address into const POOL_ADDRESS in index.html
 *  4. Call setTokens(FUN_TOKEN_ADDRESS) as owner to initialise the pool
 * ────────────────────────────────────────────────────────────────────────────
 */
contract HubarbPool is ERC20, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─── State ────────────────────────────────────────────────────────────────

    IERC20 public funToken;

    uint256 public ethReserve;
    uint256 public funReserve;

    uint256 private constant FEE_NUM = 997; // 0.3% fee  (1 - 997/1000)
    uint256 private constant FEE_DEN = 1000;

    // ─── Events ───────────────────────────────────────────────────────────────

    event LiquidityAdded(
        address indexed by,
        uint256 ethAmount,
        uint256 funAmount,
        uint256 lpMinted
    );

    event LiquidityRemoved(
        address indexed by,
        uint256 ethAmount,
        uint256 funAmount,
        uint256 lpBurned
    );

    event Swap(
        address indexed by,
        address indexed tokenIn,  // address(0) = ETH
        uint256 amountIn,
        uint256 amountOut
    );

    // ─── Constructor ──────────────────────────────────────────────────────────

    /// @dev LP token is named "HUBARB LP" with symbol "HLP"
    constructor() ERC20("HUBARB LP", "HLP") Ownable(msg.sender) {}

    // ─── Admin ────────────────────────────────────────────────────────────────

    /// @notice Set the FUN token address. Call once after deployment.
    function setTokens(address _fun) external onlyOwner {
        require(_fun != address(0), "Pool: zero address");
        require(address(funToken) == address(0), "Pool: token already set");
        funToken = IERC20(_fun);
    }

    // ─── Liquidity ────────────────────────────────────────────────────────────

    /**
     * @notice Add liquidity to the pool.
     *         Send ETH as msg.value; approve `funAmount` to this contract first.
     * @param funAmount  Amount of FUN tokens to deposit alongside the ETH.
     * @return lpMinted  Number of HLP tokens minted to the caller.
     *
     * First deposit seeds the pool at whatever ratio you choose.
     * Subsequent deposits must match the current ETH:FUN ratio; the smaller
     * of the two proportions is used and any excess is NOT refunded — callers
     * should calculate the exact ratio off-chain before calling.
     */
    function addLiquidity(uint256 funAmount, uint256 minLpOut)
        external
        payable
        nonReentrant
        returns (uint256 lpMinted)
    {
        require(address(funToken) != address(0), "Pool: not initialised");
        require(msg.value > 0 && funAmount > 0, "Pool: zero amount");

        uint256 supply = totalSupply();

        if (supply == 0) {
            // First deposit — seed the pool; LP = geometric mean of inputs
            lpMinted = sqrt(msg.value * funAmount);
        } else {
            // Subsequent deposit — enforce current ratio; mint proportionally
            uint256 lpFromEth = (msg.value  * supply) / ethReserve;
            uint256 lpFromFun = (funAmount  * supply) / funReserve;
            lpMinted = lpFromEth < lpFromFun ? lpFromEth : lpFromFun;
        }

        require(lpMinted > 0, "Pool: insufficient liquidity minted");
        require(lpMinted >= minLpOut, "Pool: slippage");

        funToken.safeTransferFrom(msg.sender, address(this), funAmount);
        ethReserve += msg.value;
        funReserve += funAmount;
        _mint(msg.sender, lpMinted);

        emit LiquidityAdded(msg.sender, msg.value, funAmount, lpMinted);
    }

    /**
     * @notice Remove liquidity from the pool by burning HLP tokens.
     * @param lpAmount  Number of HLP tokens to burn.
     * @return ethOut   ETH returned to the caller.
     * @return funOut   FUN tokens returned to the caller.
     */
    function removeLiquidity(uint256 lpAmount)
        external
        nonReentrant
        returns (uint256 ethOut, uint256 funOut)
    {
        require(lpAmount > 0, "Pool: zero lp");

        uint256 supply = totalSupply();
        ethOut = (lpAmount * ethReserve) / supply;
        funOut = (lpAmount * funReserve) / supply;

        require(ethOut > 0 && funOut > 0, "Pool: insufficient reserves");

        _burn(msg.sender, lpAmount);
        ethReserve -= ethOut;
        funReserve -= funOut;

        funToken.safeTransfer(msg.sender, funOut);
        (bool ok, ) = payable(msg.sender).call{value: ethOut}("");
        require(ok, "Pool: ETH transfer failed");

        emit LiquidityRemoved(msg.sender, ethOut, funOut, lpAmount);
    }

    // ─── Swaps ────────────────────────────────────────────────────────────────

    /**
     * @notice Swap ETH → FUN using the constant-product formula with 0.3% fee.
     *         Send the ETH you want to swap as msg.value.
     * @return funOut  FUN tokens received by the caller.
     */
    function swapEthForFun(uint256 minFunOut)
        external
        payable
        nonReentrant
        returns (uint256 funOut)
    {
        require(msg.value > 0, "Pool: zero in");

        // amountOut = (amtIn * 0.997 * reserveOut) / (reserveIn + amtIn * 0.997)
        uint256 amtInWithFee = msg.value * FEE_NUM;
        funOut = (amtInWithFee * funReserve) / (ethReserve * FEE_DEN + amtInWithFee);

        require(funOut > 0,          "Pool: insufficient output");
        require(funOut < funReserve, "Pool: insufficient liquidity");
        require(funOut >= minFunOut, "Pool: slippage");

        ethReserve += msg.value;
        funReserve -= funOut;
        funToken.safeTransfer(msg.sender, funOut);

        emit Swap(msg.sender, address(0), msg.value, funOut);
    }

    /**
     * @notice Swap FUN → ETH using the constant-product formula with 0.3% fee.
     *         Approve this contract to spend `funIn` before calling.
     * @param funIn    Amount of FUN to swap.
     * @return ethOut  ETH received by the caller.
     */
    function swapFunForEth(uint256 funIn, uint256 minEthOut)
        external
        nonReentrant
        returns (uint256 ethOut)
    {
        require(funIn > 0, "Pool: zero in");

        funToken.safeTransferFrom(msg.sender, address(this), funIn);

        uint256 amtInWithFee = funIn * FEE_NUM;
        ethOut = (amtInWithFee * ethReserve) / (funReserve * FEE_DEN + amtInWithFee);

        require(ethOut > 0,          "Pool: insufficient output");
        require(ethOut < ethReserve, "Pool: insufficient liquidity");
        require(ethOut >= minEthOut, "Pool: slippage");

        funReserve += funIn;
        ethReserve -= ethOut;

        (bool ok, ) = payable(msg.sender).call{value: ethOut}("");
        require(ok, "Pool: ETH transfer failed");

        emit Swap(msg.sender, address(funToken), funIn, ethOut);
    }

    // ─── View helpers ─────────────────────────────────────────────────────────

    /// @notice Returns current pool reserves.
    function getReserves() external view returns (uint256 eth, uint256 fun) {
        return (ethReserve, funReserve);
    }

    /**
     * @notice Quote how much FUN you get for `ethIn` (before fee deduction shown
     *         separately so the UI can display a clean breakdown).
     */
    function quoteEthForFun(uint256 ethIn) external view returns (uint256 funOut) {
        if (ethReserve == 0 || funReserve == 0) return 0;
        uint256 amtInWithFee = ethIn * FEE_NUM;
        funOut = (amtInWithFee * funReserve) / (ethReserve * FEE_DEN + amtInWithFee);
    }

    /**
     * @notice Quote how much ETH you get for `funIn`.
     */
    function quoteFunForEth(uint256 funIn) external view returns (uint256 ethOut) {
        if (ethReserve == 0 || funReserve == 0) return 0;
        uint256 amtInWithFee = funIn * FEE_NUM;
        ethOut = (amtInWithFee * ethReserve) / (funReserve * FEE_DEN + amtInWithFee);
    }

    // ─── Internal ─────────────────────────────────────────────────────────────

    /// @dev Integer square root (Babylonian method) used for first-deposit LP calc.
    function sqrt(uint256 y) internal pure returns (uint256 z) {
        if (y > 3) {
            z = y;
            uint256 x = y / 2 + 1;
            while (x < z) {
                z = x;
                x = (y / x + x) / 2;
            }
        } else if (y != 0) {
            z = 1;
        }
    }

    // ─── Receive ──────────────────────────────────────────────────────────────

    /// @dev Reject plain ETH transfers to prevent ethReserve desync.
    ///      ETH must enter the pool only via addLiquidity or swapEthForFun,
    ///      both of which update ethReserve atomically.
    ///      Use sync() to reconcile if ETH arrives via selfdestruct/coinbase.
    receive() external payable {
        revert("Pool: use addLiquidity or swapEthForFun");
    }

    // ─── Sync ─────────────────────────────────────────────────────────────────

    /// @notice Sync tracked reserves to actual token/ETH balances.
    ///         Call this if reserves ever drift due to external transfers.
    function sync() external nonReentrant {
        require(address(funToken) != address(0), "Pool: not initialised");
        ethReserve = address(this).balance;
        funReserve = funToken.balanceOf(address(this));
    }
}
