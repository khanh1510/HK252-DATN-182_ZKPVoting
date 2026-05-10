# ZK Anonymous Voting — Hệ thống bỏ phiếu ẩn danh trên blockchain

Hệ thống bỏ phiếu điện tử phi tập trung sử dụng **zk-SNARK Groth16** để đảm bảo:

- **Anonymity (Ẩn danh):** không thể liên kết địa chỉ ví với phiếu bầu cụ thể.
- **Ballot Secrecy (Bí mật phiếu):** nội dung phiếu ẩn trong suốt Voting phase nhờ commit-reveal.
- **Verifiability (Xác minh được):** bất kỳ ai cũng kiểm tra kết quả trên blockchain.
- **Double-vote prevention:** nullifier on-chain ngăn bỏ phiếu hai lần.

---

## Tổng quan kiến trúc

```
DATN/
├── code/    ─ Off-chain: Circom circuit + snarkjs Groth16 pipeline
├── evm/     ─ On-chain:  Hardhat smart contracts (Solidity 0.8.20)
└── web/     ─ Frontend:  React 19 + TypeScript + shadcn/ui dApp
```

Luồng tổng thể từ compile đến production:

```
vote.circom
    │
    ├─[circom compile]─► vote.r1cs + vote_js/vote.wasm
    │
    ├─[snarkjs Phase 1]─► pot16_final.ptau   (Powers of Tau, dùng lại được)
    │
    ├─[snarkjs Phase 2]─► vote_final.zkey    (proving key, per-circuit)
    │                  ─► verification_key.json
    │
    └─[snarkjs export]──► Groth16Verifier.sol ──► evm/contracts/
                                                         │
                                              [hardhat deploy Sepolia]
                                                         │
                                              ┌──────────┴────────────┐
                                         PollFactory            Groth16Verifier
                                              │
                                    [createPoll()] ──► VotingPool #1, #2, ...
                                                              │
                                                    [React dApp: /admin + /]
                                                    browser generates Groth16 proof
                                                    via snarkjs WASM (8–12s)
```

---

## Vòng đời một cuộc bầu cử

```
REGISTRATION ──────► VOTING ──────► REVEAL ──────► ENDED
      │                   │               │              │
  Cử tri gửi          Bỏ phiếu:       Tiết lộ:      Kết quả
  commitment          - sinh proof     - gửi          công khai
  vào Merkle          - gửi           candidateIndex  qua
  Tree on-chain       voteCommit      + blinding      getResults()
                      (ẩn phiếu)      - contract
                                      kiểm tra
                                      commitment
```

Admin (owner của VotingPool) điều khiển chuyển giai đoạn thủ công
(`startVoting`, `startReveal`, `endPoll`), hoặc deadline tự động tiến.

---

## Hai chế độ đăng ký

| Chế độ | Cách đăng ký | Trường hợp dùng |
|--------|-------------|-----------------|
| `OPEN (0)` | Bất kỳ địa chỉ nào tự gọi `register()` | DAO governance, mở |
| `ADMIN_APPROVED (1)` | Cần chữ ký EIP-712 `VoterApproval` từ admin | Công ty, tổ chức nhỏ |

Trong cả hai chế độ, commitment được insert vào cùng Merkle Tree và circuit không đổi — chỉ có hàm `register()` kiểm tra thêm chữ ký.

---

## Các thành phần chính

### Circuit (`code/circuits/vote.circom`)

Template `Vote(levels=20, maxCandidates=8)` — 6 ràng buộc:

| # | Ràng buộc | Đảm bảo |
|---|-----------|---------|
| 1 | `2 ≤ numCandidates ≤ 8` | Số ứng viên hợp lệ |
| 2 | `0 ≤ candidateIndex < numCandidates` | Không vote ứng viên ngoài phạm vi |
| 3 | `commitment = Poseidon(secret, nullifier)` + Merkle inclusion | Cử tri đã đăng ký |
| 4 | Merkle path hợp lệ qua 20 tầng Poseidon | Leaf thuộc cây đúng |
| 5 | `nullifierHash = Poseidon(secret)` | Nullifier tính đúng |
| 6 | `voteCommitment = Poseidon(candidateIndex, blinding)` | Commit phiếu đúng |

4 tín hiệu public: `merkleRoot`, `nullifierHash`, `voteCommitment`, `numCandidates`

6 tín hiệu private: `secret`, `nullifier`, `candidateIndex`, `blinding`, `pathElements[20]`, `pathIndices[20]`

### Smart Contracts (`evm/contracts/`)

| Contract | Vai trò |
|----------|---------|
| `PollFactory` | Factory triển khai VotingPool theo yêu cầu; lưu registry poll |
| `VotingPool` | Quản lý 1 cuộc bầu cử: 4 phases, 2 modes, castVote + revealVote |
| `Groth16Verifier` | Auto-generated bởi snarkjs; xác minh pairing trên BN254 |
| `MockGroth16Verifier` | Stub cho test — luôn trả `true` |
| `IGroth16Verifier` | Interface cho cả verifier thật và mock |
| `IncrementalBinaryTree` | Thư viện Merkle Tree incremental (Solidity) |
| `Bn254Poseidon2` | Poseidon T=3 trên BN254 (inline assembly, tối ưu gas) |

### dApp (`web/src/`)

Hai route:
- `/` — **Voter Panel**: duyệt poll, đăng ký (OPEN hoặc nhập coupon EIP-712), cast hidden vote, reveal, xem kết quả.
- `/admin` — **Admin Panel**: tạo poll mới, ký coupon EIP-712 cho cử tri (ADMIN_APPROVED), điều khiển phases.

---

## Hướng dẫn nhanh

```bash
# 1. Cài dependencies cho cả 3 phần
cd code && npm install && cd ..
cd evm  && npm install && cd ..
cd web  && npm install && cd ..

# 2. Compile circuit + trusted setup + sample proof + export verifier
cd code
npm run pipeline
node scripts/export_verifier.js   # sinh Groth16Verifier.sol → evm/contracts/

# 3. Test contracts
cd ../evm
npx hardhat test

# 4. Deploy lên Sepolia
#    (tạo evm/.env trước — xem evm/README.md)
npx hardhat run scripts/deploy.js --network sepolia

# 5. Chạy dApp
cd ../web
npm run copy-zk     # copy vote.wasm + vote_final.zkey vào public/zk/
npm run dev         # http://localhost:5173
```

Hướng dẫn chi tiết: **[SETUP.md](SETUP.md)**

Chi tiết từng module:
- Circuit & pipeline: **[code/README.md](code/README.md)**
- Smart contracts: **[evm/README.md](evm/README.md)**
- dApp frontend: **[web/README.md](web/README.md)**
