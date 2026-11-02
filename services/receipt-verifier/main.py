"""
receipt-verifier — a thin FastAPI wrapper around `ethiobank-receipts`.

This is the ONLY place Python runs in the stack. The NestJS API calls
POST /extract with a bank + transaction reference (or receipt URL) and gets
back a normalized receipt dict. It is stateless and never touches the app DB —
all verification policy (amount/receiver/reuse) lives in the Node side.

Deployment notes (see README):
  - Host in Ethiopia: Telebirr 403s foreign IPs.
  - BOA needs Chrome/WebDriver in the image.
  - Protect with SHARED_TOKEN so only the API can call it.
"""

from typing import Optional

from fastapi import FastAPI, Header, HTTPException

from ethiobank_receipts import extract_receipt
from ethiobank_receipts.extractors.cbe import extract_cbe_receipt_info_from_ft

from cbe_links import (
    extract_mbreciept_token,
    fetch_mbreciept_receipt,
    parse_legacy_receipt_url,
)
from normalize import normalize

# Validation, reference-hint and authentication helpers live in security.py so
# the test suite can exercise them without Selenium/Chromium. See that module
# for why.
from security import (
    SUPPORTED_BANKS,
    ExtractRequest,
    VerifierError,
    is_authorized,
    load_shared_token,
    reference_hint,
    validate_receipt_url,
)

# Shared secret every /extract caller must present as `x-verifier-token`.
#
# Fails CLOSED at import: an unset or empty token raises here, so the process
# (and therefore the container) refuses to start rather than serving requests
# unauthenticated. The previous behaviour checked the token only when it
# happened to be set, which meant a misconfigured deployment was openly
# reachable by anything that could reach the port.
SHARED_TOKEN = load_shared_token()

app = FastAPI(title="receipt-verifier", version="1.0.0")


def _run_extractor(req: ExtractRequest) -> dict:
    """Call the right ethiobank-receipts entry point and return its raw dict."""
    bank = req.bank.lower()

    if bank == "cbe" and req.reference and not req.url:
        # CBE FT + account path. Requires the account digits.
        if not req.account:
            raise VerifierError(
                "MISSING_ACCOUNT",
                "CBE reference lookup requires the last 8 account digits.",
                http_status=400,
            )
        try:
            return extract_cbe_receipt_info_from_ft(req.reference, req.account)
        except ValueError as exc:  # e.g. fewer than 8 digits
            raise VerifierError("BAD_INPUT", str(exc), http_status=400)

    if bank == "cbe" and req.url:
        # Both CBE receipt generations are accepted when a student pastes a
        # link; the host allowlist is enforced before any network call.
        url = validate_receipt_url(bank, req.url)
        token = extract_mbreciept_token(url)
        if token:
            raw = fetch_mbreciept_receipt(token)
            if not raw.get("id"):
                raise VerifierError(
                    "EXTRACT_FAILED",
                    "CBE returned a receipt without a transaction id.",
                    http_status=502,
                )
            return raw
        legacy = parse_legacy_receipt_url(url)
        if legacy:
            ft, account = legacy
            try:
                return extract_cbe_receipt_info_from_ft(ft, account)
            except ValueError as exc:
                raise VerifierError("BAD_INPUT", str(exc), http_status=400) from exc
        raise VerifierError(
            "BAD_INPUT",
            "CBE receipt link must be a legacy FT link (?id=FT...) or an mbreciept short link.",
            http_status=400,
        )

    if bank == "tele" and req.reference and not req.url:
        # Telebirr accepts the bare receipt id.
        reference = req.reference.strip()
        if reference.lower().startswith(("http://", "https://")):
            reference = validate_receipt_url(bank, reference)
        return extract_receipt("tele", reference)

    if req.url:
        return extract_receipt(bank, validate_receipt_url(bank, req.url))

    raise VerifierError(
        "URL_REQUIRED",
        f"{bank} lookups need a full receipt URL (only CBE and Telebirr accept a bare reference).",
        http_status=400,
    )


@app.get("/health")
def health():
    """Liveness only — used by the container healthcheck.

    Deliberately unauthenticated (the healthcheck has no credential) and
    deliberately free of any configuration or secret material.
    """
    return {"status": "ok", "banks": sorted(SUPPORTED_BANKS)}


@app.post("/extract")
def extract(req: ExtractRequest, x_verifier_token: Optional[str] = Header(default=None)):
    # Defence in depth. `load_shared_token()` already refused to start the
    # process when no token is configured, so SHARED_TOKEN is non-empty by the
    # time we get here; checking per request anyway means a future refactor
    # that makes startup conditional cannot silently reopen the endpoint.
    #
    # The 401 body carries a code and nothing else: no token, no hint about
    # the configured value, and no distinction between "missing" and "wrong".
    if not is_authorized(SHARED_TOKEN, x_verifier_token):
        raise HTTPException(status_code=401, detail={"code": "UNAUTHORIZED"})

    bank = req.bank.lower()
    if bank not in SUPPORTED_BANKS:
        raise HTTPException(
            status_code=400,
            detail={"code": "UNSUPPORTED_BANK", "message": f"Unsupported bank: {req.bank}"},
        )

    try:
        raw = _run_extractor(req)
        result = normalize(bank, raw, reference_hint=reference_hint(req))
    except VerifierError as exc:
        raise HTTPException(
            status_code=exc.http_status,
            detail={"code": exc.code, "message": exc.message},
        )
    except Exception as exc:  # network/parse/webdriver failures
        # Telebirr foreign-IP blocks, banks changing their page layout, dead
        # links, etc. The caller falls back to manual admin review on these.
        text = f"{type(exc).__name__}: {exc}"
        code = "BLOCKED" if any(t in text for t in ("403", "ERR_FAILED", "Timeout", "timed out")) else "EXTRACT_FAILED"
        raise HTTPException(status_code=502, detail={"code": code, "message": text})

    if not result.get("reference") and not result.get("amount"):
        # Extractor "succeeded" but found nothing usable — treat as not found.
        raise HTTPException(
            status_code=404,
            detail={"code": "NOT_FOUND", "message": "No receipt data could be extracted."},
        )

    return result
