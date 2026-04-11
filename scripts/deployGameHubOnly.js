import { network } from "hardhat";
import dotenv from "dotenv";
dotenv.config();

// ─── Existing deployed contracts ─────────────────────────────────────────────
const FUN_TOKEN_ADDRESS = "0x06e7836A655AaB61C214302DCE5e62dfA57805eD";

// ─── Correct Arbitrum Sepolia VRF v2.5 values ────────────────────────────────
// Source: docs.chain.link/vrf/v2-5/supported-networks → Arbitrum Sepolia Testnet
const VRF_COORDINATOR = "0x5CE8D5A2BC84beb22a398CCA51996F7930313D61";
const VRF_KEY_HASH    = "0x1770bdc7eec7771f7ba4ffd640f34260d7f095b79c92d34a5b2551d6f6cfd2be";

async function main() {
  if (!process.env.PRIVATE_KEY) throw new Error("PRIVATE_KEY not set in .env");
  if (!process.env.VRF_SUBSCRIPTION_ID) {
    throw new Error(
      "VRF_SUBSCRIPTION_ID not set in .env\n" +
      "  1. Go to vrf.chain.link on Arbitrum Sepolia\n" +
      "  2. Create a new subscription and fund it with LINK\n" +
      "  3. Add VRF_SUBSCRIPTION_ID=<new_id> to your .env"
    );
  }

  const { ethers } = await network.connect("arbitrumSepolia");
  const [deployer] = await ethers.getSigners();

  console.log("Deployer:", deployer.address);
  console.log("Balance: ", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");
  console.log("Reusing FunToken:", FUN_TOKEN_ADDRESS);

  const subscriptionId = BigInt(process.env.VRF_SUBSCRIPTION_ID);

  // 1. Deploy GameHub only
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
  console.log("✅ GameHub deployed:", gameHubAddr);

  // 2. Wire GameHub to existing FunToken
  console.log("\nWiring contracts...");
  const tx1 = await gameHub.setFunToken(FUN_TOKEN_ADDRESS);
  await tx1.wait();
  console.log("✅ GameHub -> FunToken set");

  // 3. Update FunToken minter to new GameHub
  const FunToken = await ethers.getContractAt(
    ["function setMinter(address) external"],
    FUN_TOKEN_ADDRESS
  );
  const tx2 = await FunToken.setMinter(gameHubAddr);
  await tx2.wait();
  console.log("✅ FunToken -> minter updated to new GameHub");

  // 4. Summary
  console.log("\n==========================================");
  console.log("  GAMEHUB REDEPLOYMENT COMPLETE");
  console.log("==========================================");
  console.log("  FunToken  :", FUN_TOKEN_ADDRESS, "(unchanged)");
  console.log("  GameHub   :", gameHubAddr, "(NEW)");
  console.log("  VRF Sub ID:", subscriptionId.toString());
  console.log("==========================================");
  console.log("\n  ACTION REQUIRED:");
  console.log("  1. Go to vrf.chain.link and add");
  console.log("    ", gameHubAddr);
  console.log("     as a consumer on subscription", subscriptionId.toString());
  console.log("  2. Update HUB_ADDR in index.html to", gameHubAddr);
  console.log("  3. Update GAME_HUB_ADDRESS in contracts.ts to", gameHubAddr);
  console.log("==========================================");
}

main().catch((err) => { console.error(err); process.exitCode = 1; });
