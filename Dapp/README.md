# web/ — React dApp (Voter + Admin Panel)

Ứng dụng phi tập trung viết bằng **React 19 + TypeScript + Vite + Ethers.js v6 + shadcn/ui**.
Sinh Groth16 proof hoàn toàn trong trình duyệt qua WebAssembly — private data
(`secret`, `nullifier`, `candidateIndex`, `blinding`) không bao giờ rời khỏi thiết bị.

---

## Cài đặt và chạy

```bash
npm install

# Copy ZK artifacts từ code/build/ vào public/zk/
npm run copy-zk

# Dev server
npm run dev        # http://localhost:5173

# Build production
npm run build
```

---

## Cấu hình (.env)

```env
VITE_CHAIN_ID=11155111
VITE_FACTORY_ADDRESS=0x...     # PollFactory từ evm/deployments/sepolia.json
VITE_DEPLOYMENT_BLOCK=0        # Block deploy của PollFactory — tăng tốc event query
```

---

## Hai route chính

**`/` — Voter Panel**

Cử tri duyệt danh sách poll, chọn một poll và thực hiện 4 bước qua 4 tab:

1. **Register** — sinh identity (`secret + nullifier`), tính `commitment = Poseidon(secret, nullifier)`, gọi `register()`. ADMIN_APPROVED mode: paste coupon EIP-712 từ admin vào trước khi submit.
2. **Vote** — sync Merkle Tree từ events on-chain, chọn ứng viên, sinh Groth16 proof trong browser (~8–12s), gọi `castVote(pA, pB, pC, pubSignals)`. Ballot backup tự động lưu localStorage.
3. **Reveal** — load ballot backup, gọi `revealVote(nullifierHash, candidateIndex, voteCommitment)`.
4. **Results** — hiển thị kết quả bằng progress bar khi poll kết thúc.

**`/admin` — Admin Panel**

Admin quản lý poll qua 3 tab:

1. **Create Poll** — điền proposal, chọn mode (OPEN/ADMIN_APPROVED), nhập ứng viên, đặt deadlines, gọi `factory.createPoll()`.
2. **Approve Voter** (ADMIN_APPROVED mode) — nhập địa chỉ cử tri, ký EIP-712 `VoterApproval`, copy coupon JSON gửi cho cử tri.
3. **Manage Polls** — điều khiển phases: `startVoting()`, `startReveal()`, `endPoll()`.

---

## Cấu trúc mã nguồn

```
web/src/
├── App.tsx                 ← Router: / → PollPage, /admin → AdminPage
├── config.ts               ← Đọc VITE_* env vars
├── components/             ← Header, Layout, shadcn/ui primitives
├── context/                ← WalletContext (provider + signer)
├── hooks/                  ← useWallet (MetaMask), usePolls (factory query)
├── lib/
│   ├── abi.ts              ← ABI + enums Phase, EligibilityMode
│   ├── proof.ts            ← buildCircuitInput, generateVoteProof, proofToCastVoteArgs
│   ├── merkleSync.ts       ← Rebuild Merkle Tree từ LeafInserted events
│   ├── eip712.ts           ← Ký + parse VoterApproval coupon
│   ├── identity.ts         ← Quản lý identity + ballot trong localStorage
│   ├── poseidon.ts         ← Lazy-load circomlibjs
│   ├── random.ts           ← randomFieldElement() via crypto.getRandomValues
│   └── wallet.ts           ← MetaMask connect + chain switch
└── pages/
    ├── HomePage.tsx
    ├── PollPage.tsx         ← 4 tabs voter
    ├── AdminPage.tsx        ← 3 tabs admin
    ├── poll/               ← RegisterPanel, VotePanel, RevealPanel, ResultsPanel
    └── admin/              ← CreatePollPanel, ApproveVoterPanel, ManagePollsPanel
```

---

## ZK Proof trong browser

Module `lib/proof.ts` xử lý toàn bộ quá trình sinh proof:

1. **Build input** từ state cử tri (merkleRoot, secret, nullifier, candidateIndex, blinding, Merkle path).
2. **Generate proof** — gọi `snarkjs.groth16.fullProve(input, '/zk/vote.wasm', '/zk/vote_final.zkey')`.
3. **Convert format** — đảo tọa độ `pB` từ `[x,y]` sang `[y,x]` vì EVM pairing precompile 0x08 dùng encoding ngược với snarkjs.
4. **Submit** — gọi `pool.castVote(pA, pB, pC, pubSignals)`.

---

## Lưu ý bảo mật

- `secret`, `nullifier`, `candidateIndex`, `blinding` không bao giờ gửi ra ngoài — proof tính locally.
- Identity lưu trong `localStorage` — người dùng nên download backup JSON.
- Ballot backup cần để reveal — tự động lưu sau `castVote`, cần import nếu dùng thiết bị khác.

---

## Dependencies

| Package | Phiên bản | Vai trò |
|---------|-----------|---------|
| `react` + `react-dom` | 19 | UI framework |
| `typescript` | 5.9 | Type safety |
| `vite` | 8.0 | Build tool + Node.js polyfills |
| `ethers` | 6.16 | BrowserProvider, Contract, ABI |
| `snarkjs` | 0.7.5 | Groth16 proof (browser WASM) |
| `circomlibjs` | 0.1.7 | Poseidon hash trong browser |
| `@zk-kit/incremental-merkle-tree` | 1.1.0 | Merkle Tree JS |
| `tailwindcss` + `@radix-ui/*` | — | shadcn/ui |
