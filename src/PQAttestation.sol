// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title PQAttestation — PQ Passport registry (QoreChain "Build Before Q-Day" Fest)
/// @notice Anchors Q-Day readiness attestations for QoreChain accounts and issues
///         soulbound PQ Passport badges. An account is "Q-Day Ready" when an
///         assessor has anchored a fresh attestation whose score clears the
///         threshold; the score itself is computed off-chain from QoreChain's
///         native post-quantum state (ML-DSA-87 key registration in x/pqc and
///         the EVM authorisation window) — state that exists on no other chain.
/// @dev Dependency-free by design. Badges are soulbound: there is deliberately
///      no transfer function. Attestations expire after `ATTESTATION_TTL` so a
///      passport reflects *current* protection, not a one-off registration.
contract PQAttestation {
    struct Attestation {
        uint64 score; // 0..100, see the published rubric in README.md
        uint64 issuedAt; // block.timestamp of the anchoring
        bytes32 evidenceHash; // hash of the rubric inputs the score came from
        bool active;
    }

    uint64 public constant READY_THRESHOLD = 70;
    uint64 public constant ATTESTATION_TTL = 30 days;

    address public owner;
    address public assessor;

    mapping(address => Attestation) private _attestations;
    mapping(address => bool) private _badgeClaimed;
    uint256 public totalBadges;

    event AssessorUpdated(address indexed newAssessor);
    event Attested(address indexed account, uint64 score, bytes32 evidenceHash);
    event AttestationRevoked(address indexed account);
    event BadgeClaimed(address indexed account, uint256 badgeId);

    modifier onlyOwner() {
        require(msg.sender == owner, "PQ: not owner");
        _;
    }

    modifier onlyAssessor() {
        require(msg.sender == assessor, "PQ: not assessor");
        _;
    }

    constructor(address assessor_) {
        owner = msg.sender;
        assessor = assessor_ != address(0) ? assessor_ : msg.sender;
        emit AssessorUpdated(assessor);
    }

    function setAssessor(address newAssessor) external onlyOwner {
        require(newAssessor != address(0), "PQ: zero address");
        assessor = newAssessor;
        emit AssessorUpdated(newAssessor);
    }

    /// @notice Anchor (or refresh) the readiness attestation for an account.
    function attest(address account, uint64 score, bytes32 evidenceHash) external onlyAssessor {
        require(account != address(0), "PQ: zero address");
        require(score <= 100, "PQ: score > 100");
        _attestations[account] = Attestation({
            score: score,
            issuedAt: uint64(block.timestamp),
            evidenceHash: evidenceHash,
            active: true
        });
        emit Attested(account, score, evidenceHash);
    }

    function revoke(address account) external onlyAssessor {
        _attestations[account].active = false;
        emit AttestationRevoked(account);
    }

    /// @notice Claim the soulbound PQ Passport badge. Requires a live,
    ///         unexpired attestation for the caller at or above the threshold.
    function claimBadge() external {
        Attestation memory a = _attestations[msg.sender];
        require(a.active, "PQ: no attestation");
        require(a.score >= READY_THRESHOLD, "PQ: below threshold");
        require(block.timestamp <= uint256(a.issuedAt) + ATTESTATION_TTL, "PQ: attestation stale");
        require(!_badgeClaimed[msg.sender], "PQ: badge already claimed");
        _badgeClaimed[msg.sender] = true;
        totalBadges += 1;
        emit BadgeClaimed(msg.sender, badgeIdOf(msg.sender));
    }

    // --- Views ---------------------------------------------------------------

    function attestationOf(address account) external view returns (Attestation memory) {
        return _attestations[account];
    }

    function hasBadge(address account) external view returns (bool) {
        return _badgeClaimed[account];
    }

    /// @notice The badge id is derived from the account itself: one account,
    ///         one passport, forever bound to it.
    function badgeIdOf(address account) public pure returns (uint256) {
        return uint256(uint160(account));
    }

    /// @notice True when the account holds a fresh attestation at/above the
    ///         ready threshold. This is the gate dApps should read.
    function isReady(address account) external view returns (bool) {
        Attestation memory a = _attestations[account];
        return a.active && a.score >= READY_THRESHOLD
            && block.timestamp <= uint256(a.issuedAt) + ATTESTATION_TTL;
    }

    /// @notice Readiness tier: 0 = none/stale, 1 = attested, 2 = Q-Day Ready.
    function tierOf(address account) external view returns (uint8) {
        Attestation memory a = _attestations[account];
        if (!a.active || block.timestamp > uint256(a.issuedAt) + ATTESTATION_TTL) return 0;
        return a.score >= READY_THRESHOLD ? 2 : 1;
    }
}
