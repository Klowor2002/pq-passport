#!/usr/bin/env node
/**
 * PQ Passport — deploy via the OFFICIAL coin-60 lane (Phase 4, 2026-11-26).
 *
 * Why this shape (see fest/BUILD-LOG.md Phase 3 + Phase 4):
 * the fest account is a QoreX **coin-118 (native)** account. Its EVM
 * rendering (0x2fda…) is the bech32 payload, NOT the keccak address of its
 * key (0xFA52…), so it cannot sign for the EVM lane — QoreChain's own docs
 * ("Deploy on QoreChain in 5 Minutes", docs.qorechain.io) state a coin-118
 * account "cannot sign for its EVM address" and prescribe: derive the
 * **coin-60 (eth_secp256k1) account from the same recovery phrase**, fund
 * it, register ITS ML-DSA-87 key, open an EVM authorisation window, then
 * deploy with ordinary EVM tooling. That sibling account here is
 * `deriveUnifiedAccount(mnemonic)` (qor133vn… / 0x8C593F…).
 *
 * Stages (each checks live state first; re-runs resume):
 *   1. fund    fest --MsgSend 9 QOR--> unified        (hybrid, fest keys)
 *   2. register unified's ML-DSA-87 key              (classical bootstrap)
 *   3. window  open EVM authorisation window         (hybrid, unified keys)
 *   4. deploy  PQAttestation via viem from 0x8C593F… (assessor = deployer)
 *   5. lifecycle attest(fest 0x2fda…, 80) · attest(deployer, 90) · claimBadge()
 *   6. verify  code at address, attestationOf/isReady/hasBadge read-backs
 *
 * Secrets: the mnemonic is loaded in-process only (same wallet file as the
 * lane's probes). Only addresses, tx hashes, balances and flags are printed.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { StargateClient } from "@cosmjs/stargate";
import {
  createPublicClient,
  createWalletClient,
  http,
  defineChain,
  getContractAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const REST = "https://api-testnet.qore.host";
const RPC = "https://rpc-testnet.qore.host";
const EVM_RPC = "https://evm-testnet.qore.host";
const CHAIN_ID = "qorechain-diana";
const FEST_COSMOS = "qor19ldpnpcwrp2ys40pqzwzpxhquldgk4sn80n4ur";
const FEST_EVM = "0x2fda19870e18544855e1009c209ae0e7da8b5613";
const FUND_UQOR = "9000000"; // 9 QOR
const FEE = { amount: [{ denom: "uqor", amount: "100000" }], gas: "800000" };
const WINDOW = { blocks: 6000, maxTxs: 10 };

const sdk = await import("@qorechain/sdk");
const evmSdk = await import("@qorechain/evm");

const WALLET_FILE =
  process.env.QOREX_WALLET_FILE ||
  join(homedir(), "workspace/qorechain/qorex_wallet.json");
const wallet = JSON.parse(readFileSync(WALLET_FILE, "utf8"));
const mnemonic = wallet.mnemonic;
wallet.mnemonic = undefined;
if (!mnemonic) {
  console.error("deploy: wallet file has no mnemonic field — abort");
  process.exit(1);
}

const festNative = await sdk.deriveNativeAccount(mnemonic, { accountIndex: 0 });
const unified = await sdk.deriveUnifiedAccount(mnemonic, 0);
const UNI_COSMOS = unified.cosmos;
const UNI_EVM = unified.evm;
console.log("fest    :", FEST_COSMOS, FEST_EVM);
console.log("unified :", UNI_COSMOS, UNI_EVM);
if (festNative.address !== FEST_COSMOS) throw new Error("fest derivation mismatch");

// ---------- helpers -------------------------------------------------------
async function bankBalance(address) {
  const res = await fetch(
    `${REST}/cosmos/bank/v1beta1/balances/${address}/by_denom?denom=uqor`,
  );
  if (!res.ok) return 0n;
  const j = await res.json();
  return BigInt(j.balance?.amount ?? "0");
}
async function accountSequence(address) {
  const res = await fetch(`${REST}/cosmos/auth/v1beta1/accounts/${address}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`account query failed: HTTP ${res.status}`);
  const body = await res.json();
  const acc = body.account?.base_account ?? body.account ?? {};
  return {
    accountNumber: BigInt(acc.account_number ?? "0"),
    sequence: BigInt(acc.sequence ?? "0"),
  };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitBalance(address, min, tries = 30) {
  for (let i = 0; i < tries; i++) {
    const b = await bankBalance(address);
    if (b >= min) return b;
    await sleep(4000);
  }
  throw new Error(`balance for ${address} did not reach ${min} uqor`);
}

const results = {};

// ---------- stage 1: fund the unified account from fest -------------------
{
  const uniBal = await bankBalance(UNI_COSMOS);
  console.log(`stage 1: unified balance ${uniBal} uqor`);
  if (uniBal >= 8_000_000n) {
    console.log("stage 1: already funded — skip");
  } else {
    const festSeq = await accountSequence(FEST_COSMOS);
    if (!festSeq) throw new Error("fest account not found on chain");
    const signer = await sdk.directSignerFromPrivateKey(
      festNative.privateKey,
      "qor",
    );
    const pqcKeypair = sdk.derivePqcCanonical(FEST_COSMOS, mnemonic);
    const transport = await StargateClient.connect(RPC);
    try {
      const res = await sdk.signAndBroadcastHybrid({
        registry: sdk.qorechainRegistry(),
        signer,
        pqcKeypair,
        messages: [
          sdk.msg.bank.send({
            fromAddress: FEST_COSMOS,
            toAddress: UNI_COSMOS,
            amount: [{ denom: "uqor", amount: FUND_UQOR }],
          }),
        ],
        fee: FEE,
        chainId: CHAIN_ID,
        accountNumber: festSeq.accountNumber,
        sequence: festSeq.sequence,
        rest: REST,
        transport,
      });
      results.fundTx = res.transactionHash;
      console.log("stage 1: fund tx", res.transactionHash, "code", res.code);
      if (res.code !== 0) throw new Error(`fund tx failed: ${res.rawLog}`);
    } finally {
      transport.disconnect();
    }
    await waitBalance(UNI_COSMOS, 8_000_000n);
    console.log("stage 1: unified balance now", (await bankBalance(UNI_COSMOS)).toString());
  }
}

// ---------- stage 2: register the unified account's PQC key ---------------
{
  const st = await sdk.fetchPqcStatus({ rest: REST, address: UNI_COSMOS });
  const mine = st.registered
    ? sdk.isRegisteredPqcKey(st, unified.pqc.publicKey)
    : false;
  console.log("stage 2: unified pqc registered:", st.registered, "ours:", mine);
  if (!mine) {
    if (st.registered) throw new Error("unified account has a DIFFERENT PQC key registered");
    const seq = await accountSequence(UNI_COSMOS);
    if (!seq) throw new Error("unified account not on chain yet (fund first)");
    const signer = new sdk.EthNativeSigner(unified, {
      signMode: "classical",
      rest: REST,
    });
    const transport = await StargateClient.connect(RPC);
    try {
      const proofOfPossession = sdk.signProofOfPossession({
        chainId: CHAIN_ID,
        account: UNI_COSMOS,
        keypair: unified.pqc,
      });
      const msg = sdk.buildRegisterPqcKeyMsg(UNI_COSMOS, {
        pqcKeypair: unified.pqc,
        proofOfPossession,
      });
      const res = await signer.signAndBroadcast(transport, {
        chainId: CHAIN_ID,
        accountNumber: seq.accountNumber,
        sequence: seq.sequence,
        fee: FEE,
        messages: [msg],
      });
      results.registerTx = res.transactionHash;
      console.log("stage 2: register tx", res.transactionHash, "code", res.code);
      if (res.code !== 0) throw new Error(`register tx failed: ${res.rawLog}`);
    } finally {
      transport.disconnect();
    }
    const st2 = await sdk.fetchPqcStatus({ rest: REST, address: UNI_COSMOS });
    console.log(
      "stage 2: after — registered:",
      st2.registered,
      "ours:",
      st2.registered ? sdk.isRegisteredPqcKey(st2, unified.pqc.publicKey) : false,
    );
  } else {
    console.log("stage 2: already registered — skip");
  }
}

// ---------- stage 3: open the EVM authorisation window --------------------
{
  const w = await evmSdk.evmWindowStatus({ rest: REST, address: UNI_COSMOS });
  console.log(
    "stage 3: window found:",
    w.found,
    w.found ? `live=${w.live} txs=${w.remainingTxs} value=${w.remainingValue} blocks=${w.remainingBlocks}` : "",
  );
  if (!(w.found && w.live && BigInt(w.remainingTxs) >= 4n)) {
    const seq = await accountSequence(UNI_COSMOS);
    const perTx = evmSdk.evmWindowCost({
      gas: 3_000_000n,
      maxFeePerGas: 250_000_000_000n,
    });
    const maxValue = (perTx * BigInt(WINDOW.maxTxs)).toString();
    const signer = new sdk.EthNativeSigner(unified, { rest: REST });
    const transport = await StargateClient.connect(RPC);
    try {
      const res = await signer.signAndBroadcast(transport, {
        chainId: CHAIN_ID,
        accountNumber: seq.accountNumber,
        sequence: seq.sequence,
        fee: FEE,
        messages: [
          sdk.openEvmWindowMsg({
            sender: UNI_COSMOS,
            blocks: WINDOW.blocks,
            maxTxs: WINDOW.maxTxs,
            maxValue,
          }),
        ],
      });
      results.windowTx = res.transactionHash;
      console.log(
        `stage 3: window tx ${res.transactionHash} code ${res.code} (blocks=${WINDOW.blocks} txs=${WINDOW.maxTxs} maxValue=${maxValue} uqor)`,
      );
      if (res.code !== 0) throw new Error(`window tx failed: ${res.rawLog}`);
    } finally {
      transport.disconnect();
    }
    const w2 = await evmSdk.evmWindowStatus({ rest: REST, address: UNI_COSMOS });
    console.log("stage 3: after — live:", w2.live, "remainingTxs:", String(w2.remainingTxs));
  } else {
    console.log("stage 3: live window with room — skip");
  }
}

// ---------- stage 4+5: deploy + lifecycle over the EVM lane ---------------
const chain = defineChain({
  id: 9800,
  name: "QoreChain Testnet",
  nativeCurrency: { name: "QOR", symbol: "QOR", decimals: 18 },
  rpcUrls: { default: { http: [EVM_RPC] } },
});
const pub = createPublicClient({ chain, transport: http(EVM_RPC) });
const evmAccount = privateKeyToAccount(unified.privateKey);
const wal = createWalletClient({ account: evmAccount, chain, transport: http(EVM_RPC) });

const artifactPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../out/PQAttestation.sol/PQAttestation.json",
);
const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
const bytecode =
  typeof artifact.bytecode === "string"
    ? artifact.bytecode
    : artifact.bytecode.object;

let contract = process.env.PQ_CONTRACT || null;
{
  const nonce = await pub.getTransactionCount({ address: UNI_EVM });
  console.log("stage 4: deployer EVM nonce", nonce);
  if (!contract) {
    const predicted = getContractAddress({ from: UNI_EVM, nonce: BigInt(nonce) });
    const hash = await wal.deployContract({
      abi: artifact.abi,
      bytecode,
      args: [UNI_EVM], // assessor = deployer
    });
    console.log("stage 4: deploy tx", hash);
    const receipt = await pub.waitForTransactionReceipt({ hash });
    contract = receipt.contractAddress;
    results.deployTx = hash;
    results.contract = contract;
    console.log(
      "stage 4: contract",
      contract,
      "status",
      receipt.status,
      "predicted match:",
      contract?.toLowerCase() === predicted.toLowerCase(),
    );
    if (receipt.status !== "success") throw new Error("deploy reverted");
  } else {
    console.log("stage 4: reusing PQ_CONTRACT", contract);
    results.contract = contract;
  }
}

const evidence = (obj) =>
  ("0x" + createHash("sha256").update(JSON.stringify(obj)).digest("hex"));
async function callEvm(label, fn, args) {
  const hash = await wal.writeContract({
    address: contract,
    abi: artifact.abi,
    functionName: fn,
    args,
  });
  const receipt = await pub.waitForTransactionReceipt({ hash });
  console.log(`stage 5: ${label} tx ${hash} status ${receipt.status}`);
  if (receipt.status !== "success") throw new Error(`${label} reverted`);
  return hash;
}
{
  const festAtt = await pub.readContract({
    address: contract,
    abi: artifact.abi,
    functionName: "attestationOf",
    args: [FEST_EVM],
  });
  if (!festAtt.active) {
    // Rubric (CONCEPT.md): PQC key 50 · window 20 · hybrid activity 20 · key age >=7d 10.
    // Fest live state: PQC registered (50), no window (0), hybrid activity (20),
    // key registered 2026-11-18 -> 8 days (10) = 80.
    results.attestFestTx = await callEvm("attest(fest)", "attest", [
      FEST_EVM,
      80n,
      evidence({ subject: FEST_COSMOS, pqc: 50, window: 0, hybrid: 20, age: 10, at: "2026-11-26" }),
    ]);
  } else console.log("stage 5: fest already attested — skip");
  const selfAtt = await pub.readContract({
    address: contract,
    abi: artifact.abi,
    functionName: "attestationOf",
    args: [UNI_EVM],
  });
  if (!selfAtt.active) {
    // Deployer: PQC 50 · window live 20 · hybrid activity 20 · key age 0 = 90.
    results.attestSelfTx = await callEvm("attest(deployer)", "attest", [
      UNI_EVM,
      90n,
      evidence({ subject: UNI_COSMOS, pqc: 50, window: 20, hybrid: 20, age: 0, at: "2026-11-26" }),
    ]);
  } else console.log("stage 5: deployer already attested — skip");
  const has = await pub.readContract({
    address: contract,
    abi: artifact.abi,
    functionName: "hasBadge",
    args: [UNI_EVM],
  });
  if (!has) {
    results.claimTx = await callEvm("claimBadge()", "claimBadge", []);
  } else console.log("stage 5: badge already claimed — skip");
}

// ---------- stage 6: verify ----------------------------------------------
{
  const code = await pub.getCode({ address: contract });
  const festReady = await pub.readContract({ address: contract, abi: artifact.abi, functionName: "isReady", args: [FEST_EVM] });
  const festTier = await pub.readContract({ address: contract, abi: artifact.abi, functionName: "tierOf", args: [FEST_EVM] });
  const selfBadge = await pub.readContract({ address: contract, abi: artifact.abi, functionName: "hasBadge", args: [UNI_EVM] });
  const totalBadges = await pub.readContract({ address: contract, abi: artifact.abi, functionName: "totalBadges" });
  const owner = await pub.readContract({ address: contract, abi: artifact.abi, functionName: "owner" });
  console.log("stage 6: code bytes:", code ? (code.length - 2) / 2 : 0);
  console.log("stage 6: owner:", owner);
  console.log("stage 6: isReady(fest 0x2fda):", festReady, "tier:", festTier);
  console.log("stage 6: hasBadge(deployer):", selfBadge, "totalBadges:", totalBadges.toString());
  console.log("RESULTS", JSON.stringify(results, null, 2));
}
