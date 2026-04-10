import { network } from "hardhat";
import dotenv from "dotenv";
dotenv.config();

// ─── Chainlink VRF v2.5 — Arbitrum Sepolia ───────────────────────────────────
// Source: https://docs.chain.link/vrf/v2-5/supported-networks (Arbitrum Sepolia)
// and confirmed at vrf.chain.link when connected to Arbitrum Sepolia.
const VRF_COORDINATOR   = "0x9DdfaCa8183c41ad55329BdeeD9F6A8d53168B1B";
const VRF_KEY_HASH      = "0x787d74caea10b2b357790d5b5247c2f63d1d91572a9846f780606e4d953677ae";

async function main() {
  if (!process.env.PRIVATE_KEY) {
    throw new Error("PRIVATE_KEY not found in .env");
  }
  if (!process.env.VRF_SUBSCRIPTION_ID) {
    throw new Error(
      "VRF_SUBSCRIPTION_ID not found in .env\n" +
      "  1. Go to https://vrf.chain.link\n" +
      "  2. Create a subscription and fund it with LINK\n" +
      "  3. Add VRF_SUBSCRIPTION_ID=<id> to your .env file"
    );
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

  const subscriptionId = BigInt(process.env.VRF_SUBSCRIPTION_ID);

  // 1. Deploy FunToken
  console.log("\nDeploying FunToken...");
  const FunToken = await ethers.getContractFactory("FunToken");
  const funToken = await FunToken.deploy();
  await funToken.waitForDeployment();
  const funTokenAddr = await funToken.getAddress();
  console.log("FunToken deployed:", funTokenAddr);

  // 2. Deploy GameHub with Chainlink VRF config (fund it with 0.05 ETH seed)
  console.log("\nDeploying GameHub (VRF-powered)...");
  const GameHub = await ethers.getContractFactory("GameHub");
  const gameHub = await GameHub.deploy(
    VRF_COORDINATOR,
    subscriptionId,
    VRF_KEY_HASH,
    { value: ethers.parseEther("0.05") }
  );
  await gameHub.waitForDeployment();
  const gameHubAddr = await gameHub.getAddress();
  console.log("GameHub deployed:", gameHubAddr);
  console.log("   House seed balance: 0.05 ETH");

  // 3. Wire contracts together
  console.log("\nWiring contracts...");
  const tx1 = await gameHub.setFunToken(funTokenAddr);
  await tx1.wait();
  console.log("   GameHub -> FunToken set");

  const tx2 = await funToken.setMinter(gameHubAddr);
  await tx2.wait();
  console.log("   FunToken -> minter = GameHub");

  // 4. IMPORTANT: Register GameHub as a VRF consumer
  console.log("\n==========================================");
  console.log("  ARB FUN HOUSE - DEPLOYMENT COMPLETE");
  console.log("==========================================");
  console.log("  FunToken    :", funTokenAddr);
  console.log("  GameHub     :", gameHubAddr);
  console.log("  Network     : Arbitrum Sepolia (421614)");
  console.log("  VRF Sub ID  :", subscriptionId.toString());
  console.log("==========================================");
  console.log("\n  ACTION REQUIRED:");
  console.log("  Go to https://vrf.chain.link and add");
  console.log("  GameHub as a consumer on subscription", subscriptionId.toString());
  console.log("  Without this, commitPlay() will revert.");
  console.log("==========================================");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
