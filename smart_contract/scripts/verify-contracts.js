/**
 * Verify deployed contracts on Etherscan/Arbiscan.
 * Run after deploy:  npx hardhat run scripts/verify-contracts.js --network sepolia
 */
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function verify(address, constructorArgs, contractFQN, libraries) {
  console.log("Verifying", address, "...");
  try {
    const opts = {
      address,
      constructorArguments: constructorArgs || [],
      contract: contractFQN,
    };
    if (libraries && Object.keys(libraries).length) {
      opts.libraries = libraries;
    }
    await hre.run("verify:verify", opts);
  } catch (e) {
    if (e.message && e.message.includes("Already Verified")) {
      console.log("  Already verified:", address);
    } else {
      console.error("  Verify error:", e.message || e);
    }
  }
}

async function main() {
  const networkName = hre.network.name;
  const depPath = path.join(__dirname, "..", "deployments", `${networkName}.json`);
  if (!fs.existsSync(depPath)) {
    console.error("Missing", depPath, "— run deploy first.");
    process.exit(1);
  }
  const dep = JSON.parse(fs.readFileSync(depPath, "utf8"));

  const libAddr = dep.libraries.Bn254Poseidon2;
  const libKey = "contracts/merkle/PoseidonT3_Vendor.sol:Bn254Poseidon2";

  // 1. Poseidon library
  await verify(libAddr, [], libKey);

  // 2. Verifier
  const isReal = dep.verifierKind === "Groth16Verifier";
  const verifierAddr = isReal
    ? dep.contracts.Groth16Verifier
    : dep.contracts.MockGroth16Verifier;
  if (isReal) {
    await verify(verifierAddr, [], "contracts/Groth16Verifier.sol:Groth16Verifier");
  } else {
    await verify(
      verifierAddr,
      [true],
      "contracts/mocks/MockGroth16Verifier.sol:MockGroth16Verifier",
    );
  }

  // 3. PollFactory
  await verify(
    dep.contracts.PollFactory,
    [verifierAddr],
    "contracts/PollFactory.sol:PollFactory",
    { [libKey]: libAddr },
  );

  // 4. VotingPool instances (only those captured in deployment file)
  for (const poll of dep.polls || []) {
    console.log(`\n— Poll #${poll.id}: ${poll.proposal}`);
    await verify(
      poll.pool,
      [
        verifierAddr,
        poll.admin || dep.deployer || hre.ethers.ZeroAddress,
        poll.mode === "ADMIN_APPROVED" ? 1 : 0,
        poll.proposal,
        poll.candidates,
        BigInt(poll.registrationDeadline),
        BigInt(poll.votingDeadline),
        BigInt(poll.revealDeadline),
      ],
      "contracts/VotingPool.sol:VotingPool",
      { [libKey]: libAddr },
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
