# Security Review (Threat Modeling + Code-Level Findings)

Date: 2026-04-09
Scope: `contracts/`, deployment scripts, frontend dApp logic in `index.html`, and config files in repo root.

## Critical findings

> Update: The original insecure single-tx randomness path in `GameHub` has now
> been replaced with a commit-reveal flow (`commitPlay` + `revealPlay`) in a
> later patch. Keep this section for audit history.

1. **Insecure on-chain randomness in `GameHub` allows MEV/validator advantage.**
   - `GameHub._rand()` derives outcomes from `block.timestamp`, `block.prevrandao`, `msg.sender`, and an internal nonce.
   - This is predictable/manipulable enough for adversarial ordering and selective inclusion in public mempools.
   - Impact: outcome bias against users, expected value extraction by sophisticated actors.
   - Fix: use commit-reveal or Chainlink VRF (or equivalent secure randomness oracle).

2. **Frontend XSS surface via unsanitized `innerHTML` from dynamic values.**
   - Multiple places render dynamic values with `innerHTML` (status/errors/history rows).
   - Some values can come from external sources (wallet/provider error messages, Supabase data).
   - Impact: script injection/phishing in user browser if DB or provider messages are poisoned.
   - Fix: replace with `textContent`/DOM node building, sanitize untrusted strings, enforce strict CSP.

## High findings

3. **AMM swap functions have no slippage protection (`minOut`), enabling sandwich/MEV extraction.**
   - `swapEthForFun()` and `swapFunForEth()` execute at whatever price is current at inclusion time.
   - Impact: users receive much worse price than expected under front-running and price movement.
   - Fix: add `minFunOut` / `minEthOut` parameters and deadline checks.

4. **Pool token transfer calls are unchecked (`IERC20.transfer*` without `SafeERC20`).**
   - `addLiquidity`, `removeLiquidity`, `swapEthForFun`, `swapFunForEth` assume standard ERC-20 behavior.
   - Impact: silent failures or reserve-accounting drift with non-compliant/fee-on-transfer tokens.
   - Fix: use `SafeERC20` and reconcile reserves from actual balances where appropriate.

5. **Owner can re-point critical token address post-deploy (`setTokens`) in pool.**
   - No one-time lock or timelock around token address mutation.
   - Impact: governance key compromise or malicious owner can rug by changing paired token.
   - Fix: make token immutable after first set, or guard with delayed timelock + multisig.

6. **Centralized admin controls in game contracts increase rug/abuse risk.**
   - Owner can withdraw house funds and alter reward rates/bet limits; token owner can change minter.
   - Impact: users must trust key holder not to change economics or drain funds.
   - Fix: multisig owner, timelocked parameter changes, transparent ops policy.

## Medium findings

7. **Liquidity add path can over-deposit one side without refund (economic value leakage).**
   - Current logic mints LP using min ratio, but still transfers full `funAmount` provided.
   - Impact: user donates excess tokens to pool unintentionally; exploitable via UX confusion.
   - Fix: compute required token amount from reserves and either enforce exact amount or refund excess.

8. **External JS from CDNs is loaded without SRI pinning.**
   - Ethers and Supabase scripts are pulled from CDN at runtime.
   - Impact: supply-chain risk if CDN path is hijacked/compromised.
   - Fix: self-host pinned versions or add Subresource Integrity + strict CSP.

9. **Public anonymous Supabase key in client with likely writable tables can enable data poisoning/spam.**
   - Client writes directly to tables from browser.
   - Impact: fake history entries, storage abuse, potential XSS chain if unsanitized rendering remains.
   - Fix: enforce row-level security, write policies tied to wallet auth, server-side validation.

10. **Hardcoded deployment addresses can cause wrong-network/wrong-contract interaction mistakes.**
    - Pool deploy script and frontend constants are static.
    - Impact: accidental trust in stale addresses or malicious replacement in copied builds.
    - Fix: environment-based config, checksum validation, deployment manifest per network.

## Code hygiene issue (availability)

11. **`contracts.ts` contains malformed template literal interpolation for Camelot URLs.**
    - Unquoted hex literal inside template interpolation can break frontend builds/runtime.
    - Impact: app instability and weakened security posture from brittle release process.
    - Fix: interpolate string constants (`FUN_TOKEN_ADDRESS`) rather than raw literal.

## Prioritized remediation plan

1. Replace game randomness with VRF/commit-reveal before any mainnet value.
2. Remove all unsafe `innerHTML` paths and enforce CSP/SRI.
3. Add slippage+deadline guards for swaps and liquidity actions.
4. Refactor pool transfers to `SafeERC20`; add reserve reconciliation tests.
5. Governance hardening: multisig + timelock + immutable/one-time critical setters.
6. Lock down Supabase with strict RLS and sanitized rendering.
7. Move addresses/keys to per-env typed config and CI checks.
