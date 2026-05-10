/**
 * Deploy: Bn254Poseidon2 (library) → Groth16Verifier → PollFactory.
 * The first poll must be created by the admin via the Admin Panel
 * (or the createSamplePoll helper below if SAMPLE_POLL=true).
 *
 * Environment variables:
 *   PRIVATE_KEY                        — deployer key
 *   SEPOLIA_RPC_URL / ARBITRUM_SEPOLIA_RPC_URL
 *   USE_REAL_GROTH16_VERIFIER=true     — deploy snarkjs-exported Groth16Verifier
 *   SAMPLE_POLL=true                   — also create a sample poll for smoke testing
 *   PROPOSAL, CANDIDATES (comma-separated), REGISTRATION_DEADLINE,
 *     VOTING_DEADLINE, REVEAL_DEADLINE — only used when SAMPLE_POLL=true
 */
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

const MODE_OPEN = 0;
const MODE_ADMIN_APPROVED = 1;

async function deployPoseidon() {
  // Reuse an already-deployed library if available.
  // Check network-specific key first (e.g. POSEIDON_ADDRESS_ARBITRUMSEPOLIA),
  // then fall back to generic POSEIDON_ADDRESS.
  // Network-specific key takes priority (even empty = deploy fresh for this network).
  // Fall back to generic POSEIDON_ADDRESS only when network-specific key is absent.
  const networkKey = `POSEIDON_ADDRESS_${hre.network.name.toUpperCase().replace(/-/g, "")}`;
  const existing = (networkKey in process.env
    ? process.env[networkKey]
    : process.env.POSEIDON_ADDRESS || ""
  ).trim();
  if (existing) {
    console.log("Reusing existing Bn254Poseidon2 library:", existing);
    return existing;
  }
  const Lib = await hre.ethers.getContractFactory(
    "contracts/merkle/PoseidonT3_Vendor.sol:Bn254Poseidon2",
  );
  const lib = await Lib.deploy();
  await lib.waitForDeployment();
  return lib.getAddress();
}

async function deployVerifier() {
  const useReal =
    String(process.env.USE_REAL_GROTH16_VERIFIER || "").toLowerCase() === "true";
  if (useReal) {
    const Real = await hre.ethers.getContractFactory("Groth16Verifier");
    const v = await Real.deploy();
    await v.waitForDeployment();
    return { addr: await v.getAddress(), kind: "Groth16Verifier" };
  }
  const Mock = await hre.ethers.getContractFactory("MockGroth16Verifier");
  const v = await Mock.deploy(true);
  await v.waitForDeployment();
  return { addr: await v.getAddress(), kind: "MockGroth16Verifier" };
}

function writeDeployment(networkName, data) {
  const dir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${networkName}.json`);
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
  console.log("Written:", file);
}

async function main() {
  const networkName = hre.network.name;
  const net = await hre.ethers.provider.getNetwork();

  // 1. Poseidon library
  const poseidonAddr = await deployPoseidon();
  console.log("Bn254Poseidon2 library:", poseidonAddr);

  // 2. Groth16 verifier (mock or real)
  const verifier = await deployVerifier();
  console.log(`${verifier.kind}:`, verifier.addr);

  // 3. PollFactory
  const linkLibs = {
    "contracts/merkle/PoseidonT3_Vendor.sol:Bn254Poseidon2": poseidonAddr,
  };
  const Factory = await hre.ethers.getContractFactory("PollFactory", {
    libraries: linkLibs,
  });
  const factory = await Factory.deploy(verifier.addr);
  await factory.waitForDeployment();
  const factoryAddr = await factory.getAddress();
  console.log("PollFactory:", factoryAddr);

  const deployment = {
    network: networkName,
    chainId: net.chainId.toString(),
    deployedAt: new Date().toISOString(),
    libraries: { Bn254Poseidon2: poseidonAddr },
    verifierKind: verifier.kind,
    contracts: {
      [verifier.kind]: verifier.addr,
      PollFactory: factoryAddr,
    },
    polls: [],
  };

  // 4. (Optional) sample poll for smoke testing
  if (String(process.env.SAMPLE_POLL || "").toLowerCase() === "true") {
    const proposal = process.env.PROPOSAL || "Should we adopt this proposal?";
    const candidates = (process.env.CANDIDATES || "Yes,No")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const now = Math.floor(Date.now() / 1000);
    const regDl = BigInt(process.env.REGISTRATION_DEADLINE || (now + 3 * 86400));
    const voteDl = BigInt(process.env.VOTING_DEADLINE || (now + 10 * 86400));
    const revealDl = BigInt(process.env.REVEAL_DEADLINE || (now + 13 * 86400));

    const maxChoices  = parseInt(process.env.MAX_CHOICES  || "1", 10);
    const allowAbstain = String(process.env.ALLOW_ABSTAIN || "true").toLowerCase() !== "false";
    const tx = await factory.createPoll(
      MODE_OPEN,
      proposal,
      candidates,
      regDl,
      voteDl,
      revealDl,
      maxChoices,
      allowAbstain,
    );
    const receipt = await tx.wait();

    const iface = factory.interface;
    let poolAddr;
    for (const log of receipt.logs) {
      try {
        const parsed = iface.parseLog(log);
        if (parsed && parsed.name === "PollCreated") {
          poolAddr = parsed.args.pool;
          break;
        }
      } catch {}
    }
    console.log("Sample VotingPool:", poolAddr);
    deployment.polls.push({
      id: 0,
      pool: poolAddr,
      mode: "OPEN",
      proposal,
      candidates,
      registrationDeadline: regDl.toString(),
      votingDeadline: voteDl.toString(),
      revealDeadline: revealDl.toString(),
    });
  }

  writeDeployment(networkName, deployment);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
