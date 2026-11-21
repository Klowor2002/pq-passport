#!/usr/bin/env node
/**
 * PQ Passport assessor agent (skeleton — phase 2 wires the write path).
 *
 * Reads a QoreChain account's post-quantum state from the Diana testnet REST
 * API, applies the published rubric, and (in phase 2) anchors the attestation
 * in PQAttestation.sol via @qorechain/evm.
 *
 * Rubric v1 (max 100):
 *   ML-DSA-87 key registered            50  (mandatory gate for "ready")
 *   EVM authorisation window healthy    20
 *   Hybrid-signed tx activity           20
 *   Key registration age >= 7 days      10
 *
 * Usage: node assessor.mjs <qor1-address>
 * Secrets: none needed for reads. The write path loads the fest wallet file
 * in-process (see scripts/) and never logs secret material.
 */
const REST = "https://api-testnet.qore.host";

async function getJson(path) {
  const r = await fetch(REST + path);
  if (!r.ok) throw new Error(`${path} -> HTTP ${r.status}`);
  return r.json();
}

export async function scoreAccount(qorAddress) {
  const evidence = {};
  let score = 0;

  // Bank balances prove the account exists on-chain (known-good endpoint).
  const bal = await getJson(
    `/cosmos/bank/v1beta1/balances/${qorAddress}?pagination.limit=50`
  );
  evidence.balances = (bal.balances || []).map((b) => b.denom);

  // TODO(phase-2): x/pqc key registration read. The module query path is
  // confirmed against the SDK's typed bindings (@qorechain/sdk fetchEvmWindow
  // covers the window half); key state + registration height land here and
  // set evidence.keyRegistered / evidence.keyRegisteredAt, worth 50 + the
  // 10-point age bonus.
  evidence.keyRegistered = null; // unknown until the pqc read is wired
  evidence.window = null; // filled by scripts/probe.mjs surface (SDK window helpers)
  evidence.hybridActivity = null; // tx-history scan, phase 2

  // Score only what is proven; unknown signals contribute 0 in v1 scoring.
  if (evidence.keyRegistered === true) score += 50;
  return { address: qorAddress, score, evidence };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const addr = process.argv[2];
  if (!addr) {
    console.error("usage: node assessor.mjs <qor1-address>");
    process.exit(2);
  }
  scoreAccount(addr)
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .catch((e) => {
      console.error("assessor error:", e.message);
      process.exit(1);
    });
}
