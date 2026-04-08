import hre from "hardhat";
import { ethers } from "ethers";

const provider = new ethers.JsonRpcProvider("https://sepolia-rollup.arbitrum.io/rpc");
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

const abi = ["function setRewardRate(uint256 rate) external"];
const hub = new ethers.Contract("0xF67dA5dE3b6c4D8675047eBf0DE71Dd9Ac96227C", abi, wallet);

const tx = await hub.setRewardRate(1000000n);
console.log("Tx sent:", tx.hash);
await tx.wait();
console.log("Done! Reward rate updated to 1,000,000");