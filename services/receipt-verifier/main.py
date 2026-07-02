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

import os
from typing import Optional

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, model_validator

from ethiobank_receipts import extract_receipt
from ethiobank_receipts.extractors.cbe import extract_cbe_receipt_info_from_ft

from normalize import normalize

SUPPORTED_BANKS = {"cbe", "dashen", "awash", "boa", "zemen", "tele"}

# Optional shared secret. When set, callers must send it as `x-verifier-token`.
SHARED_TOKEN = os.environ.get("VERIFIER_SHARED_TOKEN", "").strip()

app = FastAPI(title="receipt-verifier", version="1.0.0")


class ExtractRequest(BaseModel):
    bank: str
    # Provide EITHER a full receipt URL, OR a reference. For CBE, `reference`
    # is the FT number and `account` is the last 8 digits (or full) account no.
    url: Optional[str] = None
    reference: Optional[str] = None
    account: Optional[str] = None

    @model_validator(mode="after")
    def _require_input(self):
        if not (self.url or self.reference):
            raise ValueError("Provide either `url` or `reference`")
        return self


class VerifierError(Exception):
    """Maps to a structured JSON error the Node side switches on."""

    def __init__(self, code: str, message: str, http_status: int = 422):
        self.code = code
        self.message = message
        self.http_status = http_status


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

    if bank == "tele" and req.reference and not req.url:
        # Telebirr accepts the bare receipt id.
        return extract_receipt("tele", req.reference)

    if req.url:
        return extract_receipt(bank, req.url)

    raise VerifierError(
        "URL_REQUIRED",
        f"{bank} lookups need a full receipt URL (only CBE and Telebirr accept a bare reference).",
        http_status=400,
    )


@app.get("/health")
def health():
    return {"status": "ok", "banks": sorted(SUPPORTED_BANKS)}


@app.post("/extract")
def extract(req: ExtractRequest, x_verifier_token: Optional[str] = Header(default=None)):
    if SHARED_TOKEN and x_verifier_token != SHARED_TOKEN:
        raise HTTPException(status_code=401, detail={"code": "UNAUTHORIZED"})

    bank = req.bank.lower()
    if bank not in SUPPORTED_BANKS:
        raise HTTPException(
            status_code=400,
            detail={"code": "UNSUPPORTED_BANK", "message": f"Unsupported bank: {req.bank}"},
        )

    try:
        raw = _run_extractor(req)
        result = normalize(bank, raw, reference_hint=req.reference)
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
