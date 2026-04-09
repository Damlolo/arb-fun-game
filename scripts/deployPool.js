import { network } from "hardhat";
import dotenv from "dotenv";
dotenv.config();

async function main() {
  const { ethers } = await network.connect("arbitrumSepolia");

  console.log("Deploying HubarbPool to Arbitrum Sepolia...");

  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Balance:", ethers.formatEther(balance), "ETH");

  const Pool = await ethers.getContractFactory("HubarbPool");
  const pool = await Pool.deploy();
  await pool.waitForDeployment();

  const poolAddress = await pool.getAddress();
  console.log("✅ HubarbPool deployed to:", poolAddress);

  // Auto-initialize with your FUN token
  const FUN_TOKEN = process.env.FUN_TOKEN_ADDRESS;
  if (!FUN_TOKEN) {
    throw new Error("FUN_TOKEN_ADDRESS not set in environment.");
  }
  console.log("Initializing pool with FUN token:", FUN_TOKEN);

  const tx = await pool.setTokens(FUN_TOKEN);
  await tx.wait();
  console.log("✅ setTokens() called — pool is ready.");

  console.log("Next step:");
  console.log(`Paste into index.html: const POOL_ADDRESS = "${poolAddress}";`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
