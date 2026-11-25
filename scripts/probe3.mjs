#!/usr/bin/env node
/**
 * PQ Passport — Phase 4 investigation probe (READ-ONLY, no chain writes).
 *
 * 1. Derives the fest account's classical key in-process (Phase-2 recipe:
 *    deriveNativeAccount(mnemonic, { accountIndex: 0 })) and prints ONLY
 *    the keccak/ecrecover address of that key (the "0xfa52..." address) —
 *    the mnemonic and key bytes never leave this process.
 * 2. Runs EVM JSON-RPC probes (eth_getBalance, eth_getTransactionCount,
 *    eth_getCode) against https://evm-testnet.qore.host for BOTH the
 *    funded bech32-payload address (0x2fda...) and the ecrecover address,
 *    to establish which address the EVM module funds/keys state by.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { privateKeyToAccount } from "viem/accounts";

const EVM_RPC = "https://evm-testnet.qore.host";
const FEST_EVM = "0x2fda19870e18544855e1009c209ae0e7da8b5613";

const sdk = await import("@qorechain/sdk");

const WALLET_FILE =
  process.env.QOREX_WALLET_FILE ||
  join(homedir(), "workspace/qorechain/qorex_wallet.json");
const wallet = JSON.parse(readFileSync(WALLET_FILE, "utf8"));
const mnemonic = wallet.mnemonic;
wallet.mnemonic = undefined;
if (!mnemonic) {
  console.error("probe3: wallet file has no mnemonic field — abort");
  process.exit(1);
}

const native = await sdk.deriveNativeAccount(mnemonic, { accountIndex: 0 });
// deriveNativeAccount may expose the key under different field names across
// SDK versions; resolve defensively without printing anything but the address.
const pk =
  native.privateKey ?? native.privKey ?? native.secretKey ?? native.key;
if (!pk) {
  console.error(
    "probe3: could not locate private key field on deriveNativeAccount result; keys present:",
    Object.keys(native).join(","),
  );
  process.exit(1);
}
const pkHex =
  typeof pk === "string" ? pk : "0x" + Buffer.from(pk).toString("hex");
const ecrecoverAddr = privateKeyToAccount(pkHex).address;
console.log("ecrecover address (full):", ecrecoverAddr);
console.log("native cosmos address  :", native.address ?? native.cosmos ?? "(n/a)");

async function rpc(method, params) {
  const res = await fetch(EVM_RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const j = await res.json();
  if (j.error) return "ERROR: " + JSON.stringify(j.error);
  return j.result;
}

for (const [label, addr] of [
  ["fest bech32-payload", FEST_EVM],
  ["ecrecover of key   ", ecrecoverAddr],
]) {
  const bal = await rpc("eth_getBalance", [addr, "latest"]);
  const nonce = await rpc("eth_getTransactionCount", [addr, "latest"]);
  const code = await rpc("eth_getCode", [addr, "latest"]);
  console.log(`\n[${label}] ${addr}`);
  console.log(
    "  balance (wei hex):",
    bal,
    bal && !String(bal).startsWith("ERROR")
      ? `= ${Number(BigInt(bal)) / 1e18} QOR`
      : "",
  );
  console.log("  tx count (nonce) :", nonce);
  console.log(
    "  code             :",
    code === "0x" ? "0x (EOA / no code)" : String(code).slice(0, 66),
  );
}
