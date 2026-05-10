/**
 * VotingPool unit tests — STUB
 *
 * NOTE FOR USER (Khánh):
 *   Các test cases dưới đây đã được phác thảo nhưng cần bạn:
 *     1) Cài đặt circuit để generate proof thực (qua snarkjs.groth16)
 *        và inject vào các test "happy path" (đang dùng MockGroth16Verifier).
 *     2) Bổ sung edge cases mà bạn quan tâm (gas profiling, fuzzing, ...).
 *     3) Chạy: `npx hardhat test` sau khi cài deps đầy đủ.
 *
 * Tests dùng MockGroth16Verifier nên KHÔNG verify proof thật — chúng kiểm tra
 * logic state-machine, EIP-712, và các invariants của contract.
 */
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const MODE_OPEN = 0;
const MODE_ADMIN_APPROVED = 1;

const PHASE = { Registration: 0, Voting: 1, Reveal: 2, Ended: 3 };

// Groth16 proof: pA[2], pB[2][2], pC[2] — zero-filled for mock verifier
const ZERO_PA = [0, 0];
const ZERO_PB = [[0, 0], [0, 0]];
const ZERO_PC = [0, 0];

async function deployStack(mode, candidates) {
  const [admin, alice, bob, eve] = await ethers.getSigners();

  // Poseidon library
  const Poseidon = await ethers.getContractFactory(
    "contracts/merkle/PoseidonT3_Vendor.sol:Bn254Poseidon2",
  );
  const poseidon = await Poseidon.deploy();
  await poseidon.waitForDeployment();

  // Mock verifier
  const Mock = await ethers.getContractFactory("MockGroth16Verifier");
  const verifier = await Mock.deploy(true);
  await verifier.waitForDeployment();

  // Factory
  const Factory = await ethers.getContractFactory("PollFactory", {
    libraries: {
      "contracts/merkle/PoseidonT3_Vendor.sol:Bn254Poseidon2":
        await poseidon.getAddress(),
    },
  });
  const factory = await Factory.deploy(await verifier.getAddress());
  await factory.waitForDeployment();

  // Deadlines: now+1d / now+8d / now+11d
  const now = await time.latest();
  const regDl = now + 86400;
  const voteDl = now + 8 * 86400;
  const revealDl = now + 11 * 86400;

  const tx = await factory
    .connect(admin)
    .createPoll(mode, "Test proposal", candidates, regDl, voteDl, revealDl, 1, 1, true, false);
  const receipt = await tx.wait();
  const ev = receipt.logs
    .map((l) => {
      try {
        return factory.interface.parseLog(l);
      } catch {
        return null;
      }
    })
    .find((p) => p && p.name === "PollCreated");
  const poolAddr = ev.args.pool;

  const VotingPool = await ethers.getContractFactory("VotingPool", {
    libraries: {
      "contracts/merkle/PoseidonT3_Vendor.sol:Bn254Poseidon2":
        await poseidon.getAddress(),
    },
  });
  const pool = VotingPool.attach(poolAddr);

  return { admin, alice, bob, eve, factory, verifier, pool, regDl, voteDl, revealDl };
}

describe("VotingPool — Open mode", function () {
  it("Anyone can register exactly once during Registration phase", async function () {
    const { alice, bob, pool } = await deployStack(MODE_OPEN, ["Alice", "Bob"]);
    await pool.connect(alice).register(123n, 0n, "0x", 0);
    await pool.connect(bob).register(456n, 0n, "0x", 0);
    await expect(pool.connect(alice).register(789n, 0n, "0x", 0)).to.be.revertedWithCustomError(
      pool,
      "AlreadyRegistered",
    );
  });

  it("Cannot register after registration deadline", async function () {
    const { alice, pool, regDl } = await deployStack(MODE_OPEN, ["Alice", "Bob"]);
    await time.increaseTo(regDl + 1);
    await expect(pool.connect(alice).register(1n, 0n, "0x", 0)).to.be.revertedWithCustomError(
      pool,
      "DeadlineExpired",
    );
  });

  it("castVote works with mock verifier and stores commitment", async function () {
    const { alice, admin, pool } = await deployStack(MODE_OPEN, ["A", "B"]);
    await pool.connect(alice).register(11n, 0n, "0x", 0);
    await pool.connect(admin).startVoting();

    const root = await pool.getRoot();
    // pubSignals[7]: [merkleRoot, nullifierHash, voteCommitment, numCandidates, totalVotes, maxPerCandidate, allowAbstain]
    // candidates=["A","B"] → realCandidates=2, numCandidates=3; totalVotes=1, maxPerCandidate=1, allowAbstain=true
    await pool.connect(alice).castVote(ZERO_PA, ZERO_PB, ZERO_PC, [root, 999n, 7777n, 3n, 1n, 1n, 1n]);
    expect(await pool.totalVotesCast()).to.equal(1n);
    expect(await pool.voteCommitmentOf(999n)).to.equal(7777n);
  });

  it("Rejects duplicate nullifier", async function () {
    const { alice, admin, pool } = await deployStack(MODE_OPEN, ["A", "B"]);
    await pool.connect(alice).register(11n, 0n, "0x", 0);
    await pool.connect(admin).startVoting();
    const root = await pool.getRoot();
    await pool.connect(alice).castVote(ZERO_PA, ZERO_PB, ZERO_PC, [root, 999n, 7777n, 3n, 1n, 1n, 1n]);
    await expect(
      pool.connect(alice).castVote(ZERO_PA, ZERO_PB, ZERO_PC, [root, 999n, 8888n, 3n, 1n, 1n, 1n]),
    ).to.be.revertedWithCustomError(pool, "DoubleVote");
  });

  // TODO(Khánh): Add proof-fixture-based tests once snarkjs Groth16 pipeline
  //              produces sample proofs; replace MockGroth16Verifier with
  //              the real one in a separate suite.
});

describe("VotingPool — Admin-approved mode (EIP-712)", function () {
  async function eip712Sign(admin, pool, voter, deadline) {
    const domain = {
      name: "VotingPool",
      version: "1",
      chainId: (await admin.provider.getNetwork()).chainId,
      verifyingContract: await pool.getAddress(),
    };
    const types = {
      VoterApproval: [
        { name: "voter", type: "address" },
        { name: "pool", type: "address" },
        { name: "deadline", type: "uint256" },
      ],
    };
    const value = { voter, pool: await pool.getAddress(), deadline };
    return admin.signTypedData(domain, types, value);
  }

  it("Voter with valid admin signature can register", async function () {
    const { admin, alice, pool, regDl } = await deployStack(
      MODE_ADMIN_APPROVED,
      ["A", "B"],
    );
    const sig = await eip712Sign(admin, pool, alice.address, regDl);
    await expect(pool.connect(alice).register(123n, 0n, sig, regDl)).to.emit(
      pool,
      "LeafInserted",
    );
  });

  it("Voter without signature is rejected", async function () {
    const { alice, pool, regDl } = await deployStack(
      MODE_ADMIN_APPROVED,
      ["A", "B"],
    );
    await expect(pool.connect(alice).register(123n, 0n, "0x", regDl))
      .to.be.reverted; // ECDSA recover on empty bytes throws
  });

  it("Replay protection: each signature usable once", async function () {
    const { admin, alice, bob, pool, regDl } = await deployStack(
      MODE_ADMIN_APPROVED,
      ["A", "B"],
    );
    const sig = await eip712Sign(admin, pool, alice.address, regDl);
    await pool.connect(alice).register(11n, 0n, sig, regDl);
    // Bob tries to use Alice's signature
    await expect(
      pool.connect(bob).register(22n, 0n, sig, regDl),
    ).to.be.revertedWithCustomError(pool, "InvalidApproval");
  });

  it("Expired signature is rejected", async function () {
    const { admin, alice, pool } = await deployStack(
      MODE_ADMIN_APPROVED,
      ["A", "B"],
    );
    const past = (await time.latest()) - 1;
    const sig = await eip712Sign(admin, pool, alice.address, past);
    await expect(
      pool.connect(alice).register(11n, 0n, sig, past),
    ).to.be.revertedWithCustomError(pool, "ApprovalExpired");
  });
});

describe("VotingPool — Phase machine", function () {
  it("startVoting / startReveal / endPoll can only be called by owner in order", async function () {
    const { admin, alice, pool } = await deployStack(MODE_OPEN, ["A", "B"]);
    await expect(pool.connect(alice).startVoting()).to.be.reverted;
    await pool.connect(admin).startVoting();
    await expect(pool.connect(admin).startVoting()).to.be.revertedWithCustomError(
      pool,
      "InvalidPhaseTransition",
    );
    await pool.connect(admin).startReveal();
    await pool.connect(admin).endPoll();
    expect(await pool.currentPhase()).to.equal(PHASE.Ended);
  });

  it("getResults reverts before Ended", async function () {
    const { admin, pool } = await deployStack(MODE_OPEN, ["A", "B"]);
    await expect(pool.getResults()).to.be.revertedWithCustomError(
      pool,
      "ResultsNotAvailable",
    );
    await pool.connect(admin).startVoting();
    await pool.connect(admin).startReveal();
    await expect(pool.getResults()).to.be.revertedWithCustomError(
      pool,
      "ResultsNotAvailable",
    );
  });
});

// TODO(Khánh): full reveal-phase integration test requires a real Poseidon
// computation in JS (circomlibjs) to produce expectedCommit. Add fixture file
// `test/fixtures/sample_proof.json` and a helper to load it.
