-- Phase 3 (P3-A): OAuth transaction store for Google sign-in.
--
-- One row per authorization start. It is the browser-bound, single-use
-- anti-CSRF `state` for the authorization-code flow. Nothing about the caller
-- is verified at start, so no email, subject or user reference is stored.
--
-- Stored material sealed under AUTH_TRANSIENT_ENCRYPTION_KEY:
--   - encryptedVerifier is the S256 PKCE code verifier.
--   - encryptedNonce is the OIDC nonce compared against the ID token claim.
-- The row handle `id` doubles as the OAuth `state`; it is 256 random bits and
-- needs no encryption because it round-trips through the browser anyway.
CREATE TABLE "AuthOAuthTransaction" (
    "id" TEXT NOT NULL,
    "browserNonceHash" TEXT NOT NULL,
    "encryptedVerifier" TEXT NOT NULL,
    "encryptedNonce" TEXT NOT NULL,
    "returnPath" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthOAuthTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuthOAuthTransaction_expiresAt_idx" ON "AuthOAuthTransaction"("expiresAt");
