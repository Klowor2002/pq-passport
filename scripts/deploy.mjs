#!/usr/bin/env node
/**
 * PQ Passport — deploy PQAttestation.sol to Diana via QoreChain's native flow.
 *
 * Flow (chain v3.2.x rules):
 *   1. Derive the unified account from the fest wallet file (in-process only;
 *      the mnemonic is never printed or persisted by this script).
 *   2. Confirm the account's ML-DSA-87 key is registered (it was registered
 *      during fest registration — the 0.09 QOR one-time key-registration fee).
 *   3. Open an EVM authorisation window (hybrid-signed MsgOpenEVMWindow) sized
 *      to cover the deploy, if none is open.
 *   4. Deploy the Foundry-compiled bytecode with @qorechain/evm deployContract.
 *   5. Print ONLY: window tx hash, contract address, deploy tx hash.
 *
 * Bytecode source: ../out/PQAttestation.sol/PQAttestation.json (forge build).
 *
 * STATUS: phase-2 execution. probe.mjs must pass first (it validates the SDK
 * surface this script relies on: deriveUnifiedAccount / fetchEvmWindow /
 * openEvmWindowMsg / EthNativeSigner export shapes).
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const WALLET_FILE =
  process.env.QOREX_WALLET_FILE ||
  join(homedir(), "workspace/qorechain/qorex_wallet.json");

const artifact = JSON.parse(
  readFileSync(join(here, "..", "out", "PQAttestation.sol", "PQAttestation.json"), "utf8")
);

const wallet = JSON.parse(readFileSync(WALLET_FILE, "utf8"));
const sdk = await import("@qorechain/sdk");
const account = await sdk.deriveUnifiedAccount(wallet.mnemonic);
wallet.mnemonic = undefined;

// TODO(phase-2): 
//   const status = await sdk.fetchEvmWindow(account);
//   if (!status?.open) { build sdk.openEvmWindowMsg(...), sign hybrid with
//     sdk.EthNativeSigner / the SDK's signing client, broadcast, wait. }
//   const { deployContract } = await import("@qorechain/evm");
//   const address = await deployContract(walletClient, {
//     abi: artifact.abi, bytecode: artifact.bytecode.object, args: [assessor],
//   });
console.log(
  "deploy.mjs skeleton ready — window-open + broadcast wiring is phase 2.",
  "artifact bytes:",
  artifact.bytecode.object.length / 2 - 1
);
console.log("derived (public):", account.qorAddress || account.address || "(see probe)");
