#!/usr/bin/env node
/**
 * PQ Passport — read-only probe of the fest account's deploy readiness.
 *
 * Loads the QoreX wallet file IN-PROCESS (path from QOREX_WALLET_FILE or the
 * lane default) and derives the unified account with @qorechain/sdk. Prints
 * ONLY public data: derived addresses, PQ-key/window status, EVM balance.
 * The mnemonic is never printed, logged, or written anywhere.
 *
 * Expected derivations (public, from the lane STATE.md):
 *   qor1: qor19ldpnpcwrp2ys40pqzwzpxhquldgk4sn80n4ur
 *   evm : 0x2fda19870e18544855e1009c209ae0e7da8b5613
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const WALLET_FILE =
  process.env.QOREX_WALLET_FILE ||
  join(homedir(), "workspace/qorechain/qorex_wallet.json");

const wallet = JSON.parse(readFileSync(WALLET_FILE, "utf8"));
if (!wallet.mnemonic) {
  console.error("probe: wallet file has no mnemonic field — cannot derive");
  process.exit(1);
}

const sdk = await import("@qorechain/sdk");
const account = await sdk.deriveUnifiedAccount(wallet.mnemonic);
// Scrub our reference ASAP; the SDK keeps its own derived keys.
wallet.mnemonic = undefined;

console.log("derived account (public fields only):");
console.log(JSON.stringify(account, (k, v) =>
  /mnemonic|seed|priv|secret/i.test(k) ? "[redacted]" : v, 2));

// Window status over REST (no signing, no secrets).
try {
  const status = await sdk.fetchEvmWindow(account);
  console.log("evm window status:", JSON.stringify(status));
} catch (e) {
  console.log("evm window status: FETCH FAILED —", e.message);
}

// EVM balance via the public JSON-RPC (reads need no key/window).
try {
  const { createPublicClient, http } = await import("viem");
  const { qorechainTestnet } = await import("@qorechain/evm");
  const pub = createPublicClient({ chain: qorechainTestnet, transport: http() });
  const evmAddr = account.evmAddress || account.ethAddress || account.address?.evm;
  if (evmAddr) {
    const bal = await pub.getBalance({ address: evmAddr });
    console.log("evm balance (wei):", bal.toString());
  } else {
    console.log("evm balance: derived EVM address field not found on account object");
  }
} catch (e) {
  console.log("evm balance: READ FAILED —", e.message);
}
