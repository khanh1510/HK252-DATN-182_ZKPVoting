# Phân tích chi tiết VotingPool.sol (EVM Smart Contract)

## 1. Mục đích & Kiến trúc tổng quan
- Quản lý một poll bỏ phiếu ẩn danh, hỗ trợ single/multiple/cumulative voting, weighted voting.
- Mapping trực tiếp với circuit vote.circom: xác thực proof, chống double-vote, reveal phiếu, đếm kết quả.
- 4 phase: Registration → Voting → Reveal → Ended.

## 2. Biến state chính

| Biến | Ý nghĩa |
|------|--------|
| verifier | Địa chỉ contract Groth16Verifier (xác thực proof ZK) |
| mode | EligibilityMode: OPEN hoặc ADMIN_APPROVED |
| realCandidates | Số ứng viên thực (không tính abstain) |
| totalVotes, maxPerCandidate, allowAbstain, isWeighted | Tham số voting, mapping với circuit |
| proposal, _candidateNames | Nội dung poll, tên ứng viên |
| _tree | Merkle tree lưu commitment cử tri |
| hasRegistered | Đánh dấu địa chỉ đã đăng ký |
| nullifierUsed | Đánh dấu nullifierHash đã vote (chống double-vote) |
| voteCommitmentOf | Mapping nullifierHash → voteCommitment (cam kết phiếu) |
| revealed | Đánh dấu đã reveal phiếu |
| voterWeight | Mapping nullifierHash → weight (nếu weighted poll) |
| _voteCounts | Mảng đếm phiếu cho từng slot (abstain + ứng viên) |
| totalVotesCast, totalRevealed | Thống kê tổng số phiếu đã vote/reveal |
| registrationDeadline, votingDeadline, revealDeadline | Mốc thời gian từng phase |
| currentPhase | Phase hiện tại |

## 3. Hàm chính & flow sử dụng

### 3.1. Đăng ký cử tri (register)
```solidity
function register(
    uint256 commitment,        // Poseidon(secret, nullifier)
    uint256 nullifierHash,     // Poseidon(secret) (bắt buộc nếu weighted poll)
    bytes calldata adminSig,   // Chữ ký admin (nếu ADMIN_APPROVED)
    uint256 sigDeadline
) external returns (uint256 leafIndex)
```
- Kiểm tra phase, deadline, đã đăng ký chưa.
- Nếu mode=ADMIN_APPROVED: xác thực chữ ký admin.
- Lưu commitment vào Merkle tree, emit event.
- Nếu weighted poll: emit nullifierHash để admin gán weight.

### 3.2. Gán weight cho cử tri (setWeight)
```solidity
function setWeight(uint256 nullifierHash, uint256 weight) external onlyOwner
```
- Chỉ dùng cho weighted poll.
- Gán weight cho nullifierHash (mặc định 1 nếu chưa set).

### 3.3. Bỏ phiếu (castVote)
```solidity
function castVote(
    uint256[2] calldata _pA,
    uint256[2][2] calldata _pB,
    uint256[2] calldata _pC,
    uint256[7] calldata _pubSignals
) external
```
- Kiểm tra phase, deadline, Merkle root, tham số poll (mapping với circuit).
- Kiểm tra nullifierHash chưa vote.
- Gọi verifier.verifyProof để xác thực proof ZK.
- Đánh dấu nullifierUsed, lưu voteCommitment, emit event.

**Mapping với circuit:**
- _pubSignals = [merkleRoot, nullifierHash, voteCommitment, numCandidates, totalVotes, maxPerCandidate, allowAbstain]
- nullifierHash = Poseidon(secret)
- voteCommitment = Poseidon(votes[0..7], blinding)

### 3.4. Reveal phiếu (revealVote)
```solidity
function revealVote(
    uint256 nullifierHash,
    uint256[8] calldata votes,
    uint256 expectedCommit
) external
```
- Kiểm tra phase, deadline, đã reveal chưa, đã vote chưa, cam kết phiếu đúng.
- Kiểm tra hợp lệ votes (giới hạn, abstain, tổng phiếu, ...).
- Lấy weight (nếu có), cộng phiếu vào _voteCounts.
- Đánh dấu đã reveal, emit event.

**Công thức:**
- expectedCommit = Poseidon(votes[0..7], blinding) (tính off-chain, so với voteCommitmentOf)
- votes[0] = abstain, votes[1..N] = phiếu cho ứng viên
- Tổng phiếu ≤ totalVotes, mỗi slot ≤ maxPerCandidate, abstain exclusive với real votes

### 3.5. Chuyển phase
- startVoting(), startReveal(), endPoll(): Chỉ owner gọi, chuyển phase theo thứ tự Registration → Voting → Reveal → Ended.

### 3.6. Xem kết quả
```solidity
function getResults() external view returns (uint256[] memory counts)
```
- Chỉ trả về khi phase=Ended.
- counts[0] = abstain, counts[1..N] = phiếu từng ứng viên.

### 3.7. Các hàm view khác
- getRoot(): Merkle root hiện tại.
- getNumberOfLeaves(): Số cử tri đã đăng ký.
- getCandidates(): Danh sách ứng viên (bao gồm abstain).
- currentPhaseActual(): Tự động chuyển phase nếu quá deadline.

## 4. Công thức & logic mapping với circuit

- nullifierHash = Poseidon(secret) (chống double-vote)
- voteCommitment = Poseidon(votes[0..7], blinding) (cam kết phiếu)
- Merkle root: xác thực cử tri hợp lệ
- Các tham số poll (numCandidates, totalVotes, maxPerCandidate, allowAbstain) mapping 1-1 với circuit
- revealVote: kiểm tra lại các ràng buộc đã enforced trong proof (belt-and-suspenders)

## 5. Ví dụ flow sử dụng

### Single choice, 3 ứng viên, không abstain
- Tạo poll: totalVotes=1, maxPerCandidate=1, allowAbstain=0
- Cử tri đăng ký: gửi commitment, nullifierHash
- Bỏ phiếu: tạo proof với votes=[0,0,1,0], blinding, gửi castVote với proof + pubSignals
- Reveal: gửi votes=[0,0,1,0], expectedCommit=Poseidon([0,0,1,0,0,0,0,0], blinding)
- Kết quả: getResults() trả về counts[0]=abstain, counts[1]=A, counts[2]=B, counts[3]=C

### Multiple choice, weighted voting
- Tạo poll: isWeighted=true, totalVotes=2, maxPerCandidate=1, allowAbstain=1
- Admin gán weight cho từng nullifierHash
- Cử tri bỏ phiếu: votes=[0,1,0,1], weight=3 → phiếu cộng 3 lần cho mỗi ứng viên được chọn

## 6. Sơ đồ phase & event

- Registration → Voting → Reveal → Ended
- Event: LeafInserted, VoterRegistered, WeightAssigned, VoteCast, VoteRevealed, PhaseChanged

---

## 7. Tóm tắt
VotingPool.sol là contract trung tâm, mapping trực tiếp với circuit vote.circom, hỗ trợ nhiều kiểu voting, weighted voting, đảm bảo ẩn danh, chống double-vote, kiểm soát phase, và audit kết quả minh bạch. Tất cả logic kiểm tra proof, reveal, đếm phiếu đều mapping chặt chẽ với các ràng buộc trong circuit.