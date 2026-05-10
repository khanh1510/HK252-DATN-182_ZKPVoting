# evm/ — Smart Contracts (Hardhat + Solidity 0.8.20)

Thư mục on-chain: toàn bộ smart contracts, test suite, và deployment scripts.
Mỗi file contract được mô tả chi tiết bên dưới.

---

## Cấu trúc thư mục

```
evm/
├── contracts/
│   ├── PollFactory.sol                  ← Factory triển khai VotingPool
│   ├── VotingPool.sol                   ← Quản lý một cuộc bầu cử (core)
│   ├── Groth16Verifier.sol              ← Auto-generated bởi snarkjs
│   ├── interfaces/
│   │   └── IGroth16Verifier.sol         ← Interface chung cho verifier
│   ├── mocks/
│   │   └── MockGroth16Verifier.sol      ← Stub dùng trong test
│   └── merkle/
│       ├── IncrementalBinaryTree.sol    ← Merkle Tree incremental library
│       └── PoseidonT3_Vendor.sol        ← Poseidon hash on-chain library
├── scripts/
│   ├── deploy.js                        ← Deploy toàn bộ stack
│   └── verify-contracts.js             ← Verify mã nguồn Etherscan
├── test/
│   └── VotingPool.test.js              ← Unit tests
├── deployments/
│   └── <network>.json                  ← Địa chỉ contracts sau deploy
└── hardhat.config.js
```

---

## Cài đặt và cấu hình

```bash
npm install
```

Tạo `evm/.env`:

```env
PRIVATE_KEY=0xabc...
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/<key>
ETHERSCAN_API_KEY=<key>
USE_REAL_GROTH16_VERIFIER=true   # true = verifier thật; false = mock
SAMPLE_POLL=true                  # tạo 1 poll mẫu khi deploy
PROPOSAL=Should we adopt ZKP voting?
CANDIDATES=Yes,No
```

---

## Contracts

### `contracts/merkle/PoseidonT3_Vendor.sol`

**Thư viện** `Bn254Poseidon2` — triển khai hàm băm Poseidon T=3 (2 inputs, 1 output) trên đường cong BN254.

Tại sao cần thư viện này on-chain:
- Merkle Tree lưu voter commitments on-chain cũng dùng Poseidon để hash.
- Phải dùng **cùng hàm băm** với circuit off-chain để root on-chain khớp với root trong proof.
- Keccak-256 (native EVM) không thể dùng vì circuit Poseidon sẽ không match.

Triển khai bằng **inline assembly** tối ưu hóa gas — không dùng vòng lặp Solidity thông thường. Hàm duy nhất:

```solidity
library Bn254Poseidon2 {
    function hash(uint256[2] memory inputs) internal pure returns (uint256)
}
```

Thư viện phải được **deploy riêng** và **linked** khi compile `IncrementalBinaryTree` (vì Solidity library linking). Script deploy xử lý việc này tự động.

---

### `contracts/merkle/IncrementalBinaryTree.sol`

**Thư viện** `IncrementalBinaryTree` quản lý Merkle Tree nhị phân incremental on-chain.

Tại sao incremental: voter đăng ký theo thời gian, mỗi lần insert một leaf mới. Cây phải cập nhật hiệu quả mà không lưu toàn bộ $2^{depth}$ nút.

Cấu trúc dữ liệu `IncrementalTreeData`:

```solidity
struct IncrementalTreeData {
    uint8   depth;                  // độ sâu cây (20)
    uint256 root;                   // root hiện tại
    uint256 numberOfLeaves;         // số leaf đã insert
    uint256[MAX_DEPTH] zeroes;      // zero hash tại mỗi tầng (precomputed)
    uint256[MAX_DEPTH] lastSubtrees; // node trái cuối cùng tại mỗi tầng
}
```

Hai hàm chính:

```solidity
// Khởi tạo cây, tính sẵn zero hash tại mỗi tầng
function init(IncrementalTreeData storage self, uint8 depth, uint256 zero) internal

// Insert một leaf mới, cập nhật O(log N) nodes dọc path lên root
function insert(IncrementalTreeData storage self, uint256 leaf) internal
```

Cách `insert` hoạt động: dùng `lastSubtrees[]` lưu node trái cuối ở mỗi tầng. Khi insert leaf mới, đi từ dưới lên, hash theo cặp cho đến khi cập nhật root. Chỉ cần $O(\log N)$ phép Poseidon thay vì rebuild toàn bộ cây.

**Tương thích:** triển khai khớp chính xác với `@zk-kit/incremental-merkle-tree` JavaScript — root tính off-chain (trong browser) và on-chain luôn giống nhau.

---

### `contracts/interfaces/IGroth16Verifier.sol`

**Interface** định nghĩa signature của hàm verify dùng bởi `VotingPool`:

```solidity
interface IGroth16Verifier {
    function verifyProof(
        uint256[2] calldata _pA,      // G1 point
        uint256[2][2] calldata _pB,   // G2 point
        uint256[2] calldata _pC,      // G1 point
        uint256[4] calldata _pubSignals  // [merkleRoot, nullifierHash, voteCommitment, numCandidates]
    ) external view returns (bool);
}
```

`VotingPool` và `PollFactory` chỉ giữ tham chiếu kiểu `IGroth16Verifier` — không phụ thuộc vào implementation cụ thể. Cho phép swap giữa verifier thật và mock mà không sửa contract.

---

### `contracts/Groth16Verifier.sol`

**Auto-generated** bởi lệnh:

```bash
snarkjs zkey export solidityverifier build/vote_final.zkey Groth16Verifier.sol
```

**Không sửa file này thủ công** — mọi thay đổi sẽ bị ghi đè khi chạy lại export.

Nội dung:
- Verification key constants nhúng cứng: $vk\_\alpha \in G_1$, $vk\_\beta, vk\_\gamma, vk\_\delta \in G_2$.
- 5 điểm IC (Input Commitment) $\in G_1$: IC[0] (hằng số), IC[1..4] (mỗi public signal).
- Hàm `verifyProof(pA, pB, pC, pubSignals)` thực hiện kiểm tra pairing:

$$e(A, B) = e(\alpha, \beta) \cdot e(\text{vk\_x}, \gamma) \cdot e(C, \delta)$$

- Gọi EVM precompiled contracts: `0x06` (bn256Add), `0x07` (bn256ScalarMul), `0x08` (bn256Pairing).
- Proof size: 192 bytes (3 phần tử nhóm: pA ∈ G1 = 64B, pB ∈ G2 = 128B, pC ∈ G1 = 64B nhưng chỉ truyền tọa độ).

**Lưu ý pB coordinate reversal:** snarkjs xuất `pi_b = [[x0,y0],[x1,y1]]`, nhưng EVM precompile 0x08 cần `[[y0,x0],[y1,x1]]`. `proof.ts` trong web/ xử lý việc đảo này trước khi gọi `castVote`.

---

### `contracts/mocks/MockGroth16Verifier.sol`

**Stub** dùng trong test và development, implement `IGroth16Verifier`:

```solidity
contract MockGroth16Verifier is IGroth16Verifier {
    bool public immutable alwaysValid;

    constructor(bool _alwaysValid) {
        alwaysValid = _alwaysValid;
    }

    function verifyProof(
        uint256[2] calldata,
        uint256[2][2] calldata,
        uint256[2] calldata,
        uint256[4] calldata
    ) external view returns (bool) {
        return alwaysValid;
    }
}
```

Deploy với `alwaysValid = true`: mọi proof đều được chấp nhận → test logic contract mà không cần sinh proof thật (tiết kiệm 8–15s mỗi test case). Deploy với `alwaysValid = false`: mọi proof bị reject → test đường dẫn lỗi `InvalidProof`.

---

### `contracts/VotingPool.sol`

**Contract cốt lõi** quản lý toàn bộ vòng đời một cuộc bầu cử. Kế thừa `Ownable` (OpenZeppelin) và `EIP712` (OpenZeppelin).

#### State machine

```
Phase.Registration
    │
    │  startVoting()   [onlyOwner]
    ▼
Phase.Voting
    │
    │  startReveal()   [onlyOwner]
    ▼
Phase.Reveal
    │
    │  endPoll()       [onlyOwner]
    ▼
Phase.Ended
```

`currentPhaseActual()` trả về phase hiệu lực thực tế: nếu đã qua deadline nhưng owner chưa gọi transition, view này tự tiến phase — dApp dùng để hiển thị đúng trạng thái.

#### Immutable config (set trong constructor, không đổi)

```solidity
IGroth16Verifier public immutable verifier;       // shared verifier address
EligibilityMode  public immutable mode;           // OPEN hoặc ADMIN_APPROVED
uint8            public immutable realCandidates; // số ứng viên thực (không kể abstain)
```

#### Hàm `register(commitment, adminSig, sigDeadline)`

Đăng ký cử tri bằng cách insert commitment vào Merkle Tree:

**OPEN mode:** chỉ kiểm tra phase, deadline, và chưa đăng ký (`hasRegistered[msg.sender]`). Không cần chữ ký.

**ADMIN_APPROVED mode:** gọi thêm `_verifyAdminApproval()`:
1. Kiểm tra `block.timestamp <= sigDeadline`.
2. Tính EIP-712 digest: `hash(VOTER_APPROVAL_TYPEHASH, voter, pool, deadline)`.
3. Kiểm tra digest chưa dùng (`usedApproval[digest]`), đánh dấu đã dùng.
4. Recover signer từ signature → phải bằng `owner()`.

Thứ tự kiểm tra ngăn replay: digest binding với `address(this)` (pool address) → chữ ký cho pool A không dùng được cho pool B.

#### Hàm `castVote(pA, pB, pC, pubSignals)`

Commit phiếu ẩn danh trong Voting phase. Kiểm tra theo thứ tự:

1. `currentPhase == Voting` và `block.timestamp <= votingDeadline`.
2. `pubSignals[0]` (merkleRoot) == `_tree.root` — cử tri dùng root tại thời điểm vote, nếu ai đăng ký sau thì root đổi → phải sync lại.
3. `pubSignals[3]` (numCandidates) == `realCandidates + 1` — circuit phải dùng đúng số ứng viên của poll này.
4. `nullifierUsed[nf] == false` — ngăn double vote.
5. `verifier.verifyProof(pA, pB, pC, pubSignals) == true` — Groth16 proof hợp lệ.

Sau khi pass:
```solidity
nullifierUsed[nf] = true;         // đánh dấu nullifier đã dùng
voteCommitmentOf[nf] = vc;        // lưu commitment để kiểm tra khi reveal
++totalVotesCast;
emit VoteCast(nf, vc);
```

Pattern **Checks-Effects-Interactions**: tất cả kiểm tra trước, effects sau, không có external call sau effects.

#### Hàm `revealVote(nullifierHash, candidateIndex, expectedCommit)`

Tiết lộ phiếu trong Reveal phase. Kiểm tra:

1. Phase, deadline, chưa reveal, đã castVote.
2. `candidateIndex <= realCandidates`.
3. `voteCommitmentOf[nullifierHash] == expectedCommit`.

Kiểm tra 3 là quan trọng nhất: `expectedCommit = Poseidon(candidateIndex, blinding)` được tính off-chain bởi cử tri. Nếu cử tri khai `candidateIndex = 1` nhưng lúc vote đã commit `Poseidon(2, blinding)` → expectedCommit không khớp → revert `CommitmentMismatch`. Collision-resistance của Poseidon đảm bảo không thể tìm `(candidateIndex', blinding')` khác mà `Poseidon(candidateIndex', blinding') == voteCommitmentOf`.

Sau khi pass:
```solidity
revealed[nullifierHash] = true;
++_voteCounts[candidateIndex];
++totalRevealed;
emit VoteRevealed(nullifierHash, candidateIndex);
```

#### EIP-712 domain

```solidity
EIP712("VotingPool", "1")

bytes32 public constant VOTER_APPROVAL_TYPEHASH = keccak256(
    "VoterApproval(address voter,address pool,uint256 deadline)"
);
```

Domain separator tự động bao gồm `address(this)` (địa chỉ pool) → mỗi VotingPool có domain separator riêng → chữ ký không replayable cross-pool.

#### View functions

```solidity
function currentPhaseActual() public view returns (Phase)
function getResults() external view returns (uint256[] memory)   // chỉ khi Ended
function getRoot() external view returns (uint256)
function getNumberOfLeaves() external view returns (uint256)
function getCandidates() external view returns (string[] memory) // slot 0 = "Abstain"
function domainSeparator() external view returns (bytes32)
```

#### Custom errors (tiết kiệm gas so với revert string)

| Error | Khi nào |
|-------|---------|
| `InvalidPhase` | Gọi hàm sai phase |
| `DeadlineExpired` | Quá deadline |
| `AlreadyRegistered` | Đăng ký hai lần |
| `InvalidApproval` | Chữ ký EIP-712 sai signer |
| `ApprovalExpired` | Chữ ký hết hạn |
| `ApprovalAlreadyUsed` | Replay chữ ký |
| `InvalidProof` | Groth16 verify = false |
| `MerkleRootMismatch` | Root trong proof ≠ root on-chain |
| `NumCandidatesMismatch` | numCandidates trong proof ≠ poll |
| `DoubleVote` | Dùng nullifier đã dùng |
| `AlreadyRevealed` | Reveal hai lần |
| `CommitmentMismatch` | expectedCommit ≠ stored commitment |
| `InvalidCandidateIndex` | candidateIndex > realCandidates |
| `ResultsNotAvailable` | getResults() trước khi Ended |
| `InvalidPhaseTransition` | startVoting/startReveal/endPoll sai thứ tự |
| `InvalidConfig` | Constructor args không hợp lệ |

---

### `contracts/PollFactory.sol`

**Factory contract** — triển khai VotingPool mới theo yêu cầu và lưu registry.

```solidity
IGroth16Verifier public immutable verifier;  // shared cho tất cả pool

struct PollInfo {
    address pool;
    address admin;
    VotingPool.EligibilityMode mode;
    string proposal;
    uint256 createdAt;
}
```

Hàm chính:

```solidity
function createPoll(
    VotingPool.EligibilityMode mode,
    string calldata proposal,
    string[] calldata candidateNames,   // chỉ real candidates; abstain tự thêm
    uint256 registrationDeadline,
    uint256 votingDeadline,
    uint256 revealDeadline
) external returns (uint256 pollId, address pool)
```

`msg.sender` trở thành `owner` của VotingPool mới. Emit `PollCreated(pollId, pool, admin, mode, proposal)`.

Registry query:
```solidity
function getAllPolls() external view returns (PollInfo[] memory)
function getPoll(uint256 id) external view returns (PollInfo memory)
function pollCount() external view returns (uint256)
```

**Thiết kế chia sẻ verifier:** một `Groth16Verifier` dùng cho tất cả pool → deploy một lần, tiết kiệm gas so với mỗi pool deploy verifier riêng (~1.5M gas).

---

## Deploy

```bash
npx hardhat run scripts/deploy.js --network sepolia
```

Thứ tự trong `scripts/deploy.js`:
1. Deploy `Bn254Poseidon2` library.
2. Deploy `Groth16Verifier` hoặc `MockGroth16Verifier` (theo `USE_REAL_GROTH16_VERIFIER`).
3. Deploy `PollFactory` với library linking + verifier address.
4. Nếu `SAMPLE_POLL=true`: gọi `factory.createPoll()`.
5. Lưu tất cả địa chỉ vào `deployments/<network>.json`.

---

## Test

```bash
npx hardhat test
REPORT_GAS=true npx hardhat test
```

`test/VotingPool.test.js` dùng `MockGroth16Verifier(true)`. Bao phủ:

- **OPEN mode:** register, no double register, deadline enforcement, castVote, double-vote prevention.
- **ADMIN_APPROVED mode:** valid EIP-712 coupon, missing signature rejected, replay attack, expired coupon.
- **Phase machine:** owner-only transitions, correct ordering, `getResults` gated by Ended.
- **revealVote:** commitment match, mismatch, double reveal, invalid candidateIndex.

---

## Dependencies

| Package | Phiên bản | Vai trò |
|---------|-----------|---------|
| `hardhat` | 2.22.17 | Framework |
| `@openzeppelin/contracts` | 5.6.1 | `Ownable`, `EIP712`, `ECDSA` |
| `@nomicfoundation/hardhat-toolbox` | — | ethers, chai, gas-reporter, verify |
| `dotenv` | 16.4.5 | Đọc `.env` |
