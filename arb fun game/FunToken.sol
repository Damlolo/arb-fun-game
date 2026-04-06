// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title FunToken
 * @notice ERC20 reward token for ARB Fun House
 * @dev Only the GameHub contract (minter) can mint new tokens
 */
contract FunToken is ERC20, Ownable {
    address public minter;

    event MinterUpdated(address indexed oldMinter, address indexed newMinter);

    constructor() ERC20("FunToken", "FUN") Ownable(msg.sender) {
        // Mint 1,000,000 FUN to deployer (owner) for initial liquidity seeding
        _mint(msg.sender, 1_000_000 ether);
    }

    /// @notice Set the minter address (should be GameHub contract)
    function setMinter(address _minter) external onlyOwner {
        emit MinterUpdated(minter, _minter);
        minter = _minter;
    }

    /// @notice Mint FUN tokens — callable only by the GameHub contract
    function mint(address to, uint256 amount) external {
        require(msg.sender == minter, "FunToken: caller is not minter");
        _mint(to, amount);
    }
}
