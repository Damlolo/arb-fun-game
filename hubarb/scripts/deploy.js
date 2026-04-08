import { network } from "hardhat";
import dotenv from "dotenv";
dotenv.config();

async function main() {
  if (!process.env.PRIVATE_KEY) {
    throw new Error("PRIVATE_KEY not found in .env file. Make sure .env exists in your project root.");
  }

  const { ethers } = await network.connect("arbitrumSepolia");

  console.log("Deploying to Arbitrum Sepolia...");

  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);
  console.log(
    "Balance:",
    ethers.formatEther(await ethers.provider.getBalance(deployer.address)),
    "ETH"
  );

  // 1. Deploy FunToken
  console.log("\nDeploying FunToken...");
  const FunToken = await ethers.getContractFactory("FunToken");
  const funToken = await FunToken.deploy();
  await funToken.waitForDeployment();
  const funTokenAddr = await funToken.getAddress();
  console.log("FunToken deployed:", funTokenAddr);

  // 2. Deploy GameHub (fund it with 0.05 ETH seed)
  console.log("\nDeploying GameHub...");
  const GameHub = await ethers.getContractFactory("GameHub");
  const gameHub = await GameHub.deploy({ value: ethers.parseEther("0.05") });
  await gameHub.waitForDeployment();
  const gameHubAddr = await gameHub.getAddress();
  console.log("GameHub deployed:", gameHubAddr);
  console.log("   House seed balance: 0.05 ETH");

  // 3. Wire them together
  console.log("\nWiring contracts...");
  const tx1 = await gameHub.setFunToken(funTokenAddr);
  await tx1.wait();
  console.log("   GameHub -> FunToken set");

  const tx2 = await funToken.setMinter(gameHubAddr);
  await tx2.wait();
  console.log("   FunToken -> minter = GameHub\n");

  // 4. Summary
  console.log("==========================================");
  console.log("  ARB FUN HOUSE - DEPLOYMENT COMPLETE");
  console.log("==========================================");
  console.log("  FunToken :", funTokenAddr);
  console.log("  GameHub  :", gameHubAddr);
  console.log("  Network  : Arbitrum Sepolia (421614)");
  console.log("==========================================");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
