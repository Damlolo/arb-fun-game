const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);
  console.log(
    "Balance:",
    ethers.formatEther(await ethers.provider.getBalance(deployer.address)),
    "ETH"
  );

  // ── 1. Deploy FunToken ───────────────────────────────────────────────────
  console.log("\n▶ Deploying FunToken…");
  const FunToken = await ethers.getContractFactory("FunToken");
  const funToken = await FunToken.deploy();
  await funToken.waitForDeployment();
  const funTokenAddr = await funToken.getAddress();
  console.log("✅ FunToken deployed:", funTokenAddr);

  // ── 2. Deploy GameHub (fund it with 0.05 ETH seed) ───────────────────────
  console.log("\n▶ Deploying GameHub…");
  const GameHub = await ethers.getContractFactory("GameHub");
  const gameHub = await GameHub.deploy({
    value: ethers.parseEther("0.05"),
  });
  await gameHub.waitForDeployment();
  const gameHubAddr = await gameHub.getAddress();
  console.log("✅ GameHub deployed:", gameHubAddr);
  console.log("   House seed balance: 0.05 ETH");

  // ── 3. Wire them together ─────────────────────────────────────────────────
  console.log("\n▶ Wiring contracts…");

  // Tell GameHub which FunToken to mint from
  const tx1 = await gameHub.setFunToken(funTokenAddr);
  await tx1.wait();
  console.log("   GameHub → FunToken set ✅");

  // Tell FunToken that GameHub is the minter
  const tx2 = await funToken.setMinter(gameHubAddr);
  await tx2.wait();
  console.log("   FunToken → minter = GameHub ✅");

  // ── 4. Summary ────────────────────────────────────────────────────────────
  console.log("\n══════════════════════════════════════════");
  console.log("  ARB FUN HOUSE — DEPLOYMENT COMPLETE");
  console.log("══════════════════════════════════════════");
  console.log("  FunToken :", funTokenAddr);
  console.log("  GameHub  :", gameHubAddr);
  console.log("  Network  : Arbitrum Sepolia (421614)");
  console.log("══════════════════════════════════════════");
  console.log("\nNext steps:");
  console.log("1. Copy addresses into frontend/src/config/contracts.ts");
  console.log("2. Add liquidity on Uniswap v3 (Arbitrum Sepolia):");
  console.log("   https://app.uniswap.org/#/add/ETH/" + funTokenAddr + "?chain=arbitrum-sepolia");
  console.log("3. Run the frontend: cd frontend && npm run dev");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
