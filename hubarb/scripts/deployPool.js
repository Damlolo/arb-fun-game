import { network } from "hardhat";

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
  const FUN_TOKEN = "0x92E79A3f212f6BD696a2ddB3da374e7776B4daaC";
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
