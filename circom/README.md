# code/ — Circom Circuit & Groth16 Pipeline

Thư mục off-chain: mạch ZKP viết bằng Circom 2.0, các script Node.js tự động
hóa toàn bộ pipeline từ compile → trusted setup → prove → export Solidity verifier.

---

## Cấu trúc thư mục

```
code/
├── circuits/
│   ├── hasher.circom        ← Poseidon hash components
│   ├── merkleTree.circom    ← Merkle inclusion proof
│   └── vote.circom          ← Mạch chính (entry point)
├── scripts/
│   ├── pipeline.js          ← Orchestrator: chạy bước 1–6 liền mạch
│   ├── compile.js           ← Bước 1: circom → R1CS + WASM
│   ├── trusted_setup.js     ← Bước 2: Powers of Tau + Groth16 Phase 2
│   ├── generate_input.js    ← Bước 3: sinh input.json mẫu
│   ├── compute_witness.js   ← Bước 4: tính witness
│   ├── prove.js             ← Bước 5: tạo Groth16 proof
│   ├── verify.js            ← Bước 6: verify proof off-chain
│   └── export_verifier.js   ← Sinh Groth16Verifier.sol (chạy riêng sau pipeline)
├── inputs/                  ← input.json sinh ra
└── build/                   ← Tất cả artifacts (gitignored)
```

---

## Cài đặt

```bash
npm install
```

Yêu cầu Circom 2.0+ cài sẵn (`circom --version`). Xem [SETUP.md](../SETUP.md) nếu chưa cài.

---

## Chạy pipeline

```bash
npm run pipeline                    # compile + setup + input + witness + prove + verify
node scripts/export_verifier.js     # sinh Groth16Verifier.sol → copy sang evm/contracts/
```

---

## Circuits

### `circuits/hasher.circom`

File định nghĩa các template hash dùng chung trong mạch:

**`Hasher()`**

Hash hai field element bằng Poseidon:

```
inputs: left, right
output: hash = Poseidon(left, right)
```

Dùng tại mỗi tầng của MerkleTreeChecker để tính hash nút cha từ hai nút con.

**`CommitmentHasher()`**

Tính voter commitment từ bí mật cử tri:

```
inputs:  secret, nullifier
output:  commitment = Poseidon(secret, nullifier)
```

Commitment này là leaf trong Merkle Tree on-chain — đại diện cho danh tính ẩn danh của cử tri. Template này dùng trong `vote.circom` ở constraint 3.

> **Lý do dùng Poseidon thay Keccak-256:** Poseidon cần ~240 constraints trong Circom, Keccak-256 cần ~150.000 constraints — đắt hơn 600 lần. Poseidon được thiết kế tối ưu cho zk-SNARK trên trường hữu hạn.

---

### `circuits/merkleTree.circom`

File định nghĩa các template kiểm tra Merkle inclusion proof:

**`DualMux()`**

Chọn thứ tự (trái, phải) của hai nút dựa trên bit chỉ hướng:

```
inputs:  in0, in1, sel
outputs: outL, outR

sel = 0 → (outL, outR) = (in0, in1)  -- nút hiện tại bên trái
sel = 1 → (outL, outR) = (in1, in0)  -- nút hiện tại bên phải
```

Ràng buộc `sel * (1 - sel) === 0` đảm bảo `sel` là bit nhị phân.

**`MerkleTreeChecker(levels)`**

Template cốt lõi: xác minh một leaf thuộc cây Merkle với root cho trước.

```
inputs:
  leaf              ← voter commitment cần kiểm tra
  root              ← Merkle root công khai (PUBLIC signal trong vote.circom)
  pathElements[levels]  ← sibling nodes tại mỗi tầng
  pathIndices[levels]   ← hướng (0=trái, 1=phải) tại mỗi tầng

Hoạt động:
  currentHash[0] = leaf
  for i in 0..levels-1:
      (L, R) = DualMux(currentHash[i], pathElements[i], pathIndices[i])
      currentHash[i+1] = Hasher(L, R)
  CONSTRAINT: root === currentHash[levels]
```

Sau `levels = 20` tầng hash, ràng buộc cuối cùng đảm bảo kết quả tính được phải bằng `merkleRoot` public. Nếu leaf không thuộc cây hoặc path sai → ràng buộc không thỏa → proof không thể sinh.

**`MerkleTreeInclusionProof(levels)`**

Wrapper nhẹ của `MerkleTreeChecker`, thêm output `isValid = 1`. Dùng khi nhúng vào circuit lớn hơn cần output boolean.

---

### `circuits/vote.circom`

Mạch chính — entry point. Định nghĩa toàn bộ logic mà cử tri phải chứng minh.

**Template `Vote(levels, maxCandidates)`**

Khởi tạo với `levels = 20` (độ sâu Merkle Tree) và `maxCandidates = 8` (giới hạn cứng số ứng viên).

**Tín hiệu:**

```
PUBLIC (4 signals):
  merkleRoot      ← root Merkle Tree hiện tại on-chain
  nullifierHash   ← Poseidon(secret) — định danh ẩn danh, ngăn double vote
  voteCommitment  ← Poseidon(candidateIndex, blinding) — cam kết ẩn phiếu
  numCandidates   ← số lựa chọn của poll này (2..maxCandidates)

PRIVATE (46 signals):
  secret          ← bí mật 254-bit của cử tri
  nullifier       ← 254-bit random kết hợp với secret
  candidateIndex  ← 0=abstain, 1..numCandidates-1=ứng viên thực
  blinding        ← 254-bit random che voteCommitment
  pathElements[20]← sibling nodes trên đường từ leaf đến root
  pathIndices[20] ← 0=trái / 1=phải tại mỗi tầng
```

**6 ràng buộc:**

```
C1  numCandidates >= 2
    Dùng GreaterEqThan(8) — đảm bảo poll có ít nhất abstain + 1 ứng viên.

C2  numCandidates <= maxCandidates (8)
    Dùng LessEqThan(8) — giữ trong giới hạn cứng của circuit.

C3  candidateIndex < numCandidates
    Dùng LessThan(8) — cử tri không thể vote ứng viên ngoài phạm vi poll.

C4  commitment = Poseidon(secret, nullifier)
    + MerkleTreeChecker: commitment ∈ tree với root = merkleRoot
    Kết hợp hai kiểm tra: tính đúng commitment và xác minh nó tồn tại trong cây.

C5  nullifierHash == Poseidon(secret)
    Ràng buộc nullifierHash public phải khớp với secret private.
    Contract dùng nullifierHash để đánh dấu "đã vote" mà không biết secret.

C6  voteCommitment == Poseidon(candidateIndex, blinding)
    Trái tim của commit-reveal: ràng buộc voteCommitment public gắn chặt
    với candidateIndex private — nhưng không tiết lộ candidateIndex.
```

**Khai báo main:**

```circom
component main {public [merkleRoot, nullifierHash, voteCommitment, numCandidates]}
    = Vote(20, 8);
```

4 tín hiệu `{}` là public — xuất ra `public.json` khi prove. Phần còn lại là private.

---

## Scripts

### `scripts/compile.js`

Gọi Circom CLI biên dịch `circuits/vote.circom`:

```
circom circuits/vote.circom --r1cs --wasm --sym --output build/
```

Đầu ra:
- `build/vote.r1cs` — hệ ràng buộc R1CS (Rank-1 Constraint System).
- `build/vote_js/vote.wasm` — witness generator WebAssembly.
- `build/vote.sym` — debug symbols (tên signal → index).

---

### `scripts/trusted_setup.js`

Thực hiện Groth16 trusted setup hai giai đoạn. Có cơ chế cache: so sánh SHA-256 của `vote.r1cs` với lần trước, bỏ qua Phase 2 nếu không đổi.

**Phase 1 — Powers of Tau (universal):**

```
snarkjs powersoftau new bn128 16 pot16_0000.ptau
snarkjs powersoftau contribute pot16_0000.ptau pot16_0001.ptau -e="<random entropy>"
snarkjs powersoftau prepare phase2 pot16_0001.ptau pot16_final.ptau
```

- `bn128` = đường cong BN254 (cùng với EVM).
- `power = 16` → hỗ trợ tối đa $2^{16} = 65.536$ constraints.
- File `pot16_final.ptau` (~4 MB) không phụ thuộc circuit, tái sử dụng mãi mãi.
- Entropy ngẫu nhiên được sinh bằng `crypto.randomBytes(32)`.

**Phase 2 — Groth16 circuit-specific:**

```
snarkjs groth16 setup vote.r1cs pot16_final.ptau vote_0000.zkey
snarkjs zkey contribute vote_0000.zkey vote_final.zkey -e="<random entropy>"
snarkjs zkey export verificationkey vote_final.zkey verification_key.json
```

- `vote_final.zkey` (~10–15 MB) là proving key, gắn chặt với `vote.circom`.
- **Phải chạy lại khi sửa `vote.circom`**: `node scripts/trusted_setup.js --force`

---

### `scripts/generate_input.js`

Sinh `inputs/input.json` mẫu cho một cử tri và một lựa chọn.

```bash
node scripts/generate_input.js                          # 3 ứng viên, vote=1
CANDIDATE=0 NUM_CANDIDATES=5 node scripts/generate_input.js   # abstain, 5 ứng viên
CANDIDATE=3 NUM_CANDIDATES=4 node scripts/generate_input.js   # vote=3
```

Quá trình:
1. Sinh ngẫu nhiên `secret`, `nullifier`, `blinding` (254-bit via `crypto.randomBytes(31)`).
2. Tính `commitment = Poseidon(secret, nullifier)`.
3. Insert commitment vào `IncrementalMerkleTree` (depth 20, từ @zk-kit).
4. Lấy Merkle proof tại index 0 → `pathElements[]`, `pathIndices[]`.
5. Tính `nullifierHash = Poseidon(secret)`.
6. Tính `voteCommitment = Poseidon(candidateIndex, blinding)`.
7. Ghi tất cả vào `inputs/input.json`.

---

### `scripts/compute_witness.js`

Chạy WASM witness generator với input:

```
node build/vote_js/generate_witness.js build/vote_js/vote.wasm inputs/input.json build/witness.wtns
```

Đầu ra `witness.wtns` là tập hợp tất cả giá trị tín hiệu (public + private) thỏa tất cả ràng buộc.

---

### `scripts/prove.js`

Sinh Groth16 proof từ witness và proving key:

```
snarkjs groth16 prove build/vote_final.zkey build/witness.wtns build/proof.json build/public.json
```

- `proof.json` chứa `{pi_a, pi_b, pi_c}` — ba phần tử nhóm (G1, G2, G1) trên BN254.
- `public.json` chứa 4 public signals: `[merkleRoot, nullifierHash, voteCommitment, numCandidates]`.

---

### `scripts/verify.js`

Xác minh proof off-chain và in 4 public signals:

```
snarkjs groth16 verify build/verification_key.json build/public.json build/proof.json
```

In từng public signal kèm tên để kiểm tra thủ công, sau đó in `Proof is VALID` hoặc `INVALID`.

---

### `scripts/export_verifier.js`

Sinh Solidity verifier từ proving key:

```
snarkjs zkey export solidityverifier build/vote_final.zkey build/Groth16Verifier.sol
```

Sau đó **tự động copy** `build/Groth16Verifier.sol` → `evm/contracts/Groth16Verifier.sol`.

File sinh ra (~200 dòng) chứa:
- Verification key constants nhúng cứng (các điểm G1/G2 của `vk_alpha`, `vk_beta`, `vk_gamma`, `vk_delta`, 5 điểm IC).
- Hàm `verifyProof(pA, pB, pC, pubSignals)` gọi EVM precompile bn256Pairing (0x08).

---

## Artifacts sau pipeline

| File | Kích thước | Mục đích |
|------|-----------|---------|
| `build/vote.r1cs` | ~1–2 MB | Constraint system |
| `build/vote_js/vote.wasm` | ~500 KB | Witness generator (dùng ở browser) |
| `build/pot16_final.ptau` | ~4 MB | Phase 1 — tái sử dụng được |
| `build/vote_final.zkey` | ~10–15 MB | Proving key (dùng ở browser) |
| `build/verification_key.json` | ~5 KB | Nhúng vào Groth16Verifier.sol |
| `build/Groth16Verifier.sol` | ~200 dòng | Solidity verifier |
| `build/proof.json` | ~1 KB | Proof mẫu `{pi_a, pi_b, pi_c}` |
| `build/public.json` | <1 KB | 4 public signals mẫu |

---

## npm scripts

| Script | Lệnh | Mô tả |
|--------|------|-------|
| `pipeline` | `node scripts/pipeline.js` | Chạy cả 6 bước liên tiếp |
| `compile` | `node scripts/compile.js` | Chỉ compile circuit |
| `setup` | `node scripts/trusted_setup.js` | Chỉ trusted setup (có cache) |
| `input` | `node scripts/generate_input.js` | Chỉ sinh input mẫu |
| `witness` | `node scripts/compute_witness.js` | Chỉ tính witness |
| `prove` | `node scripts/prove.js` | Chỉ sinh proof |
| `verify` | `node scripts/verify.js` | Chỉ verify proof |

---

## Dependencies

| Package | Phiên bản | Dùng cho |
|---------|-----------|---------|
| `snarkjs` | 0.7.5 | Toàn bộ pipeline Groth16 |
| `circomlibjs` | 0.1.7 | Tính Poseidon trong Node.js (`generate_input`) |
| `@zk-kit/incremental-merkle-tree` | 1.1.0 | Merkle Tree JS tương thích với Solidity |
