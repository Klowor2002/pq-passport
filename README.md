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
`@qorechain/sdk` + `@qorechain/evm`:

```bash
cd scripts && npm install
node probe.mjs    # read-only: key registered? window open? balances?
node deploy.mjs   # opens a window if needed, deploys, prints the address
```

## On-chain (testnet)

- Contract: `TBD after deploy` (Diana, chain ID 9800)
- Deploy tx: `TBD`
- Lifecycle proof (attest → claim → isReady): `TBD`

## Demo

Video (≤3 min): `TBD`

## License

MIT
