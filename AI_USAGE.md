# AI Usage Disclosure

This project was designed and built with an AI agent (Muse, by Meta) working
under a human operator's direction, as the fest's AI-native rules allow.

## What the AI did

- Drafted the project concept and this documentation.
- Wrote the Solidity contract (`src/PQAttestation.sol`), the assessor agent
  skeleton (`agent/`), the web app skeleton (`web/`) and the deployment
  scripts (`scripts/`).
- Operated the build/deploy tooling (Foundry compile, SDK deploy flow) on the
  qorechain-diana **testnet only**.

## What the human did

- Registered for the fest, created and controls the QoreX wallet and all
  accounts, and approved the build direction.
- Owns all keys; no key material was ever exposed to or printed by the agent
  (deployment scripts load the wallet file in-process and never log secrets).

## The assessor is an AI-native component

The `agent/` assessor is itself an agent program: it reads QoreChain's
post-quantum state (ML-DSA key registration, EVM authorisation window status,
hybrid-signed activity), applies the published scoring rubric, and anchors
attestations on-chain. Its rubric and evidence hashes are public in this repo
so any juror can reproduce a score by hand.
