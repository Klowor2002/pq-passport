#!/usr/bin/env node
/**
 * Phase 4 probe (READ-ONLY): state of the SDK *unified* (60'-path) EVM
 * address derived from the fest mnemonic — the third candidate address.
 * Prints only the derived public addresses + EVM RPC state. Keys stay
 * in-process; nothing secret is printed.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const EVM_RPC = "https://evm-testnet.qore.host";
const sdk = await import("@qorechain/sdk");

const WALLET_FILE =
  process.env.QOREX_WALLET_FILE ||
  join(homedir(), "workspace/qorechain/qorex_wallet.json");
const wallet = JSON.parse(readFileSync(WALLET_FILE, "utf8"));
const mnemonic = wallet.mnemonic;
wallet.mnemonic = undefined;
if (!mnemonic) {
  console.error("probe4: no mnemonic — abort");
  process.exit(1);
}

const unified = await sdk.deriveUnifiedAccount(mnemonic);
console.log("unified cosmos:", unified.cosmos ?? unified.address);
console.log("unified evm   :", unified.evm);

async function rpc(method, params) {
  const res = await fetch(EVM_RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const j = await res.json();
  return j.error ? "ERROR " + JSON.stringify(j.error) : j.result;
}
const addr = unified.evm;
console.log("balance:", await rpc("eth_getBalance", [addr, "latest"]));
console.log("nonce  :", await rpc("eth_getTransactionCount", [addr, "latest"]));
console.log("code   :", await rpc("eth_getCode", [addr, "latest"]));
