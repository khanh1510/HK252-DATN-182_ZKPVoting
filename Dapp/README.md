# Dapp/ — React dApp (Voter + Admin Panel)

Decentralized application built with **React 19 + TypeScript + Vite + Ethers.js v6 + shadcn/ui**.
Groth16 proofs are generated entirely in the browser via WebAssembly — private data
(`secret`, `nullifier`, `votes`, `blinding`) never leaves the device.

---

## Installation and Running

```bash
npm install

# Copy ZK artifacts from circom/build/ into public/zk/
npm run copy-zk

# Dev server
npm run dev        # http://localhost:5173

# Production build
npm run build
```

---

## Configuration (.env)

```env
VITE_CHAIN_ID=11155111
VITE_FACTORY_ADDRESS=0x...     # PollFactory from smart_contract/deployments/sepolia.json
VITE_DEPLOYMENT_BLOCK=0        # PollFactory deploy block — speeds up event queries
VITE_USE_DUMMY_PROOF=false     # true = skip real proof generation (dev only)
VITE_FAUCET_URL=               # optional faucet for social-login wallets
```

---

## Two Main Routes

**`/` — Voter Panel**

Voters browse the poll list, select a poll, and complete 4 steps across 4 tabs:

1. **Register** — generate identity (`secret + nullifier`), compute `commitment = Poseidon(secret, nullifier)`, call `register()`. In ADMIN_APPROVED mode: paste the EIP-712 coupon from the admin before submitting.
2. **Vote** — sync the Merkle Tree from on-chain events, choose how to allocate votes (single / multiple / cumulative depending on poll type), generate a Groth16 proof in the browser (~8–12s), call `castVote(pA, pB, pC, pubSignals)`. Ballot backup is automatically saved to localStorage.
3. **Reveal** — load ballot backup, call `revealVote(nullifierHash, votes[8], voteCommitment)`.
4. **Results** — display results with a progress bar once the poll has ended.

**`/admin` — Admin Panel**

Admin manages polls across 3 tabs:

1. **Create Poll** — fill in proposal, choose mode (OPEN / ADMIN_APPROVED), enter candidates, set voting type (`totalVotes` + `maxPerCandidate`), set deadlines, call `factory.createPoll()`.
2. **Approve Voter** (ADMIN_APPROVED mode) — enter voter address, sign EIP-712 `VoterApproval`, copy the coupon JSON to send to the voter.
3. **Manage Polls** — control phases: `startVoting()`, `startReveal()`, `endPoll()`; assign voter weights for weighted polls.

---

## Source Structure

```
Dapp/src/
├── App.tsx                 ← Router: / → PollPage, /admin → AdminPage
├── config.ts               ← Reads VITE_* env vars
├── components/             ← Header, Layout, shadcn/ui primitives
├── context/                ← WalletContext (provider + signer)
├── hooks/                  ← useWallet (MetaMask), usePolls (factory query)
├── lib/
│   ├── abi.ts              ← ABI + Phase/EligibilityMode enums
│   ├── proof.ts            ← buildCircuitInput, generateVoteProof, proofToCastVoteArgs
│   ├── merkleSync.ts       ← Rebuild Merkle Tree from LeafInserted events
│   ├── eip712.ts           ← Sign + parse VoterApproval coupon
│   ├── identity.ts         ← Manage identity + ballot in localStorage
│   ├── poseidon.ts         ← Lazy-load circomlibjs
│   ├── random.ts           ← randomFieldElement() via crypto.getRandomValues
│   └── wallet.ts           ← MetaMask connect + chain switch
└── pages/
    ├── HomePage.tsx
    ├── PollPage.tsx         ← 4 voter tabs
    ├── AdminPage.tsx        ← 3 admin tabs
    ├── poll/               ← RegisterPanel, VotePanel, RevealPanel, ResultsPanel
    └── admin/              ← CreatePollPanel, ApproveVoterPanel, ManagePollsPanel
```

---

## ZK Proof in the Browser

`lib/proof.ts` handles the full proof flow:

1. **Build input** from voter state (merkleRoot, secret, nullifier, votes[8], blinding, Merkle path).
2. **Detect voting mode** from `totalVotes` + `maxPerCandidate` → `single | multiple | cumulative`.
3. **Generate proof** — calls `snarkjs.groth16.fullProve(input, '/zk/vote.wasm', '/zk/vote_final.zkey')`.
4. **Convert format** — swaps `pB` coordinates from `[x,y]` to `[y,x]` because EVM pairing precompile 0x08 uses the reverse encoding from snarkjs.
5. **Submit** — calls `pool.castVote(pA, pB, pC, pubSignals)`.

`votes[8]` layout:
- `votes[0]` = abstain weight (0 unless the voter chooses to abstain)
- `votes[1..N]` = weight allocated to real candidate at slot i

---

## Security Notes

- `secret`, `nullifier`, `votes`, `blinding` are never sent off-device — proofs are computed locally.
- Identity is stored in `localStorage` — users should download the backup JSON file.
- Ballot backup is required to reveal — saved automatically after `castVote`, must be imported when using a different device.

---

## Dependencies

| Package | Version | Role |
|---------|---------|------|
| `react` + `react-dom` | 19 | UI framework |
| `typescript` | 5.9 | Type safety |
| `vite` | 8.0 | Build tool + Node.js polyfills |
| `ethers` | 6.16 | BrowserProvider, Contract, ABI |
| `snarkjs` | 0.7.5 | Groth16 proof (browser WASM) |
| `circomlibjs` | 0.1.7 | Poseidon hash in browser |
| `@zk-kit/incremental-merkle-tree` | 1.1.0 | JS Merkle Tree |
| `tailwindcss` + `@radix-ui/*` | — | shadcn/ui |
