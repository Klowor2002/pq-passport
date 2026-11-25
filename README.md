# PQ Passport

**Prove you're ready for Q-Day.** PQ Passport is a soulbound, on-chain
attestation that a QoreChain account is *actually* post-quantum protected —
its ML-DSA-87 key registered, its EVM authorisation window healthy, its
activity hybrid-signed — scored by an AI assessor and anchored on-chain for
any dApp to read.

Built for the **QoreChain "Build Before Q-Day" Developer Fest** on the
qorechain-diana testnet (EVM chain ID 9800).

## Why

QoreChain's promise is post-quantum security, but an account is only protected
*after* it registers its ML-DSA-87 key, and EVM-lane use additionally needs an
open authorisation window. Until now there was no simple, verifiable answer to
**"is this account ready for Q-Day?"** — the state is buried across two VMs.
PQ Passport turns it into one check, one score, one badge.

## How it works

1. **Check** — enter any account (`qor1…` or `0x…`; the app converts between
   the two encodings of the same account) and see its live PQ-protection
   status read from chain state.
2. **Score** — the assessor agent evaluates the account against the published
   rubric and anchors the result in `PQAttestation.sol` (score + evidence
   hash + timestamp). Attestations expire after 30 days: a passport reflects
   *current* protection.
3. **Claim** — at score ≥ 70 with a registered key, the owner claims a
   **soulbound** PQ Passport badge. dApps gate on `isReady(address)`.

### Scoring rubric (v1)

| Signal | Points | Source |
|---|---|---|
| ML-DSA-87 key registered | 50 (mandatory gate) | x/pqc state via REST |
| EVM authorisation window open & healthy | 20 | window status via REST |
| Hybrid-signed transaction activity | 20 | tx history via REST |
| Key registration age ≥ 7 days | 10 | registration height/time |

## Repository layout

- `src/PQAttestation.sol` — the registry + soulbound badge (dependency-free Solidity).
- `agent/` — the assessor agent (Node, `@qorechain/sdk`): reads PQ state, scores, attests.
- `web/` — zero-build static app (viem via CDN, QoreX / MetaMask).
- `scripts/` — deployment through QoreChain's native flow (see below).
- `AI_USAGE.md` — how AI was used to build this project (fest disclosure).

## Deploying (QoreChain's native flow)

An EVM transaction on QoreChain is admitted only from an account that has
**(1)** a registered ML-DSA-87 key and **(2)** an open EVM authorisation
window. The window is opened with a hybrid-signed Cosmos-lane message
(`MsgOpenEVMWindow`) — `scripts/` performs the whole flow in-process with
`@qorechain/sdk` + `@qorechain/evm`.

One subtlety matters: the fest registration wallet is a QoreX **coin-118**
account, and per QoreChain's own deploy guide a coin-118 key *cannot sign
for its EVM address* (its `0x…` form is the bech32 payload, not the keccak
address of the key). The documented route — followed here — is to derive
the **coin-60 (eth_secp256k1) account from the same recovery phrase**,
fund it from the registered wallet, register *its* ML-DSA-87 key, open
its window, and deploy from it. `scripts/deploy.mjs` runs all six stages
(fund → register → window → deploy → attest → verify) and is resumable;
`scripts/probe*.mjs` are the read-only probes used to establish the lane.

```bash
cd scripts && npm install
node probe.mjs    # read-only: key registered? window open? balances?
node deploy.mjs   # full deploy + lifecycle, prints every tx hash
```

## On-chain (testnet)

- Contract: `0xc838beac0a32a15e04e95aaa00525e882d147383` (Diana, EVM chain ID 9800)
- Deployer (coin-60 account of the registered wallet's phrase):
  `qor133vn7yc98una7zfj8g3whssatc7kvf6slcffa5` / `0x8C593F13053f27DF09323A22ebc21D5e3d662750`
- Registered fest wallet (attested subject): `qor19ldpnpcwrp2ys40pqzwzpxhquldgk4sn80n4ur` / `0x2fda19870e18544855e1009c209ae0e7da8b5613`
- Funding tx (fest → deployer, 9 QOR): `0CD87643B2904248C46FBD59DD59F381BD5832A6A71B4D221E64EFBDDBACD08A`
- PQC register tx: `DD21E22FEA3E43EAB5DF1C90DAEA238376C76487483BD413CA729647D70AC953`
- Window tx: `B9F2F4750EC8E7AD513BF2A153DFA4783C34BC54C524F9E9DC4A2024C974A9DB`
- Deploy tx: `0x7370ee6e011ac1baf80b7ab1ab287d30df06a7d98516fa69cb8e186946c7ee87`
- Lifecycle proof: attest(fest, 80) `0x156479feda4c1057bf5af6af0902aea41560cd0470c215385097ccc1b605ec6e` ·
  attest(deployer, 90) `0x4ab9719ffb9d6b5538d70480e4e10965306d69ab2f06b19b6f11f07c76fd4302` ·
  claimBadge() `0x5fa38c5d5e2cfcaa1a979021bdaa3d49d0b7d7c942df8321124a455f57ef408b`
- Verified on-chain: `isReady(fest) == true` (tier 2), `hasBadge(deployer) == true`, `totalBadges == 1`

## Demo

Video (≤3 min): `TBD`

## License

MIT
