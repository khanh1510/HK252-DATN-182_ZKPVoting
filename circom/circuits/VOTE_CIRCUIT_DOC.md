# Thiết kế chi tiết mạch vote.circom (Universal Anonymous Voting Circuit)

## 1. Mục đích
- Hỗ trợ nhiều kiểu bỏ phiếu: single choice, multiple choice, cumulative, hybrid.
- Đảm bảo ẩn danh cử tri, chống double-vote, bảo mật phiếu.
- Tùy biến qua các tham số runtime: số ứng viên, số phiếu tối đa, cho phép abstain, ...

## 2. Public signals (7)
| Tên             | Ý nghĩa                                                        |
|-----------------|---------------------------------------------------------------|
| merkleRoot      | Merkle root on-chain của danh sách cử tri                      |
| nullifierHash   | Poseidon(secret), chống double-vote                            |
| voteCommitment  | Poseidon(votes[0..7], blinding), cam kết lá phiếu (ẩn)         |
| numCandidates   | Số slot (bao gồm abstain ở index 0)                            |
| totalVotes      | Số phiếu tối đa mỗi cử tri (1..255)                            |
| maxPerCandidate | Số phiếu tối đa cho 1 ứng viên (1..totalVotes)                 |
| allowAbstain    | 1 nếu cho phép bỏ trắng (abstain), 0 nếu không                |

## 3. Private signals
| Tên             | Ý nghĩa                                                        |
|-----------------|---------------------------------------------------------------|
| secret, nullifier | Định danh bí mật của cử tri                                  |
| votes[8]        | Mảng số phiếu cho từng slot (0..maxPerCandidate)              |
| blinding        | Số ngẫu nhiên để ẩn lá phiếu                                   |
| pathElements[20], pathIndices[20] | Merkle proof xác minh cử tri hợp lệ         |

## 4. Công thức & ràng buộc chính

### 4.1. Ràng buộc tham số
- 2 ≤ numCandidates ≤ maxCandidates (maxCandidates=8)
- 1 ≤ totalVotes ≤ 255
- 1 ≤ maxPerCandidate ≤ totalVotes
- allowAbstain ∈ {0,1}

### 4.2. Ràng buộc từng slot votes[i]
- 0 ≤ votes[i] ≤ 255
- votes[i] ≤ maxPerCandidate
- votes[i] = 0 với i ≥ numCandidates (slot không hợp lệ)
- Nếu !allowAbstain thì votes[0] = 0

### 4.3. Tổng phiếu & logic abstain
- realSum = tổng votes[1..7] (bỏ abstain)
- totalUsed = votes[0] + realSum
- votes[0] * realSum = 0 (hoặc abstain hoặc vote thật, không đồng thời)
- totalUsed ≥ 1 (phải dùng ít nhất 1 phiếu)
- totalUsed ≤ totalVotes (không vượt ngân sách phiếu)

### 4.4. Merkle proof & nullifier
- commitment = Poseidon(secret, nullifier)
- MerkleTreeChecker xác minh commitment ∈ Merkle tree (cử tri hợp lệ)
- nullifierHash = Poseidon(secret) (chống double-vote)

### 4.5. Vote commitment
- voteCommitment = Poseidon(votes[0..7], blinding) (cam kết lá phiếu, ẩn nội dung)

## 5. Flow dữ liệu (ví dụ)

### Ví dụ: Single choice, 3 ứng viên (A, B, C), không cho abstain
- numCandidates = 4 (0: abstain, 1: A, 2: B, 3: C)
- totalVotes = 1
- maxPerCandidate = 1
- allowAbstain = 0

Cử tri chọn B:
- votes = [0, 0, 1, 0] (votes[2]=1 là chọn B)
- secret, nullifier: số bí mật riêng của cử tri
- blinding: số ngẫu nhiên
- pathElements, pathIndices: Merkle proof cho commitment

Output proof:
- merkleRoot: root Merkle tree hiện tại
- nullifierHash: Poseidon(secret)
- voteCommitment: Poseidon([0,0,1,0,0,0,0,0], blinding)
- numCandidates=4, totalVotes=1, maxPerCandidate=1, allowAbstain=0

### Ví dụ: Multiple choice, chọn tối đa 2 trong 3 ứng viên, cho phép abstain
- numCandidates = 4
- totalVotes = 2
- maxPerCandidate = 1
- allowAbstain = 1

Cử tri chọn A và C:
- votes = [0, 1, 0, 1] (votes[1]=1 chọn A, votes[3]=1 chọn C)

Cử tri bỏ trắng:
- votes = [2, 0, 0, 0] (votes[0]=2, realSum=0, totalUsed=2)

## 6. Ý nghĩa từng biến chính

- **merkleRoot**: Đảm bảo chỉ cử tri hợp lệ mới bỏ phiếu (Merkle proof).
- **nullifierHash**: Mỗi cử tri chỉ bỏ phiếu 1 lần (chống double-vote).
- **voteCommitment**: Ẩn nội dung phiếu, chỉ reveal khi cần.
- **votes[8]**: Mỗi slot là số phiếu cho 1 ứng viên (hoặc abstain).
- **blinding**: Ngẫu nhiên hóa cam kết phiếu, chống lộ thông tin.
- **pathElements, pathIndices**: Chứng minh Merkle tree.

## 7. Hàm/Component chính trong circuit

- **Poseidon(2), Poseidon(9)**: Hàm băm Poseidon (hash 2 hoặc 9 input).
- **Num2Bits(8)**: Ràng buộc biến nằm trong 8 bit (0..255).
- **GreaterEqThan, LessEqThan, LessThan**: So sánh, ràng buộc logic.
- **MerkleTreeChecker**: Kiểm tra commitment thuộc Merkle tree.

## 8. Công thức tổng quát

- commitment = Poseidon(secret, nullifier)
- nullifierHash = Poseidon(secret)
- voteCommitment = Poseidon(votes[0..7], blinding)
- votes[0] * realSum = 0
- totalUsed = votes[0] + sum(votes[1..7])
- totalUsed ≥ 1, totalUsed ≤ totalVotes
- votes[i] = 0 với i ≥ numCandidates

---

## 9. Tóm tắt
Mạch vote.circom là universal, hỗ trợ nhiều kiểu voting, đảm bảo ẩn danh, chống double-vote, kiểm soát ngân sách phiếu, và có thể mở rộng cho weighted/multiple/cumulative voting. Tất cả ràng buộc đều được kiểm tra trong proof, đảm bảo tính đúng đắn và bảo mật của hệ thống bỏ phiếu ẩn danh.