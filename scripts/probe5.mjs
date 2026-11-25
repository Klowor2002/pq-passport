#!/usr/bin/env node
/**
 * Phase 4 probe (READ-ONLY): abstractaccount state for the fest account —
 * linked authenticators list + abstract-account entry. No secrets involved
 * (public REST reads only).
 */
const REST = "https://api-testnet.qore.host";
const FEST = "qor19ldpnpcwrp2ys40pqzwzpxhquldgk4sn80n4ur";
const sdk = await import("@qorechain/sdk");

try {
  const auths = await sdk.fetchAuthenticators({ rest: REST, address: FEST });
  console.log("fetchAuthenticators:", JSON.stringify(auths));
} catch (e) {
  console.log("fetchAuthenticators error:", e.message);
}
const res = await fetch(
  `${REST}/qorechain/abstractaccount/v1/account/${FEST}`,
);
console.log("GET /account/{fest}:", res.status, await res.text());
const res2 = await fetch(`${REST}/qorechain/abstractaccount/v1/accounts`);
console.log(
  "GET /accounts (first 400 chars):",
  res2.status,
  (await res2.text()).slice(0, 400),
);
