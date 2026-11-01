"""
security.py — validation and authentication helpers for the receipt verifier.

This module exists for two reasons.

1. **Testability without the heavy stack.** `main.py` imports
   `ethiobank_receipts`, which pulls Selenium and expects a Chromium binary.
   The security tests only need URL allow-listing, reference hints and the
   shared-token check, so those live here, importing nothing heavier than
   pydantic (already required by FastAPI) and `requests` (already required by
   cbe_links). CI can therefore exercise the real production code paths
   without installing Selenium or a browser.

2. **Fail-closed authentication in one place.** The verifier previously
   authenticated only when `VERIFIER_SHARED_TOKEN` happened to be set —
   an unset or empty token silently disabled the check. `load_shared_token`
   now refuses to start, and `is_authorized` refuses on every request that
   does not present the exact token.
"""

import hmac
import os
from typing import Mapping, Optional
from urllib.parse import urlparse

from pydantic import BaseModel, model_validator

from cbe_links import parse_legacy_receipt_url

SUPPORTED_BANKS = {"cbe", "dashen", "awash", "boa", "zemen", "tele"}

RECEIPT_HOSTS = {
    # CBE receipts exist in two generations: the legacy FT link and the new
    # "mbreciept" short link (see cbe_links.py).
    "cbe": {"apps.cbe.com.et", "mbreciept.cbe.com.et"},
    "dashen": {"receipt.dashensuperapp.com"},
    "awash": {"awashpay.awashbank.com"},
    "boa": {"cs.bankofabyssinia.com"},
    "zemen": {"share.zemenbank.com"},
    "tele": {"transactioninfo.ethiotelecom.et"},
}

#: Environment variable holding the secret every /extract caller must present.
TOKEN_ENV_VAR = "VERIFIER_SHARED_TOKEN"


class VerifierError(Exception):
    """Maps to a structured JSON error the Node side switches on."""

    def __init__(self, code: str, message: str, http_status: int = 422):
        self.code = code
        self.message = message
        self.http_status = http_status


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


def validate_receipt_url(bank: str, url: str) -> str:
    """Restrict scraper traffic to the selected bank's real HTTPS host."""
    if bank not in RECEIPT_HOSTS:
        raise VerifierError("BAD_INPUT", f"Unsupported bank: {bank}", 400)

    try:
        parsed = urlparse(url.strip())
    except ValueError as exc:
        raise VerifierError("BAD_INPUT", "Receipt URL is invalid.", 400) from exc

    hostname = (parsed.hostname or "").lower().rstrip(".")
    if (
        parsed.scheme.lower() != "https"
        or not hostname
        or parsed.username
        or parsed.password
        or hostname not in RECEIPT_HOSTS[bank]
    ):
        raise VerifierError(
            "BAD_INPUT",
            f"Receipt URL must use the official {bank.upper()} receipt domain.",
            400,
        )
    return url.strip()


def reference_hint(req: ExtractRequest) -> Optional[str]:
    """Return a stable transaction ID rather than storing a full receipt URL."""
    value = (req.reference or req.url or "").strip()
    if req.bank.lower() == "tele" and value.lower().startswith("https://"):
        return urlparse(value).path.rstrip("/").split("/")[-1] or None
    if req.bank.lower() == "cbe" and req.url:
        # Legacy CBE links carry the FT inside ?id=<FT><digits>. New-style
        # mbreciept links expose their transaction id in the API payload only,
        # so there is no hint to give here.
        legacy = parse_legacy_receipt_url(req.url)
        return legacy[0] if legacy else None
    return req.reference


def load_shared_token(environ: Optional[Mapping[str, str]] = None) -> str:
    """Return the configured shared token, or refuse to run.

    Fails **closed**: an unset, empty or whitespace-only token raises. This is
    called at import time by `main.py`, so a misconfigured container cannot
    start and therefore cannot serve `/extract` unauthenticated. Callers must
    not catch this to "keep the service up" — that would undo the guarantee.

    The error message names the variable and never echoes a value.
    """
    env = os.environ if environ is None else environ
    token = (env.get(TOKEN_ENV_VAR) or "").strip()
    if not token:
        raise RuntimeError(
            f"{TOKEN_ENV_VAR} must be set to a non-empty value. "
            "The receipt verifier refuses to start without it: an "
            "unauthenticated verifier would accept /extract from anything "
            "that can reach it."
        )
    return token


def is_authorized(configured_token: str, presented_token: Optional[str]) -> bool:
    """True only when the caller presents the configured token exactly.

    Fails closed in every other case, including when `configured_token` is
    empty — callers therefore cannot accidentally re-enable the old
    "authenticate only if configured" behaviour by passing an empty string.

    Comparison is constant-time and operates on UTF-8 bytes so a non-ASCII
    header value cannot raise out of `hmac.compare_digest`.
    """
    if not configured_token or not presented_token:
        return False
    return hmac.compare_digest(
        presented_token.encode("utf-8"),
        configured_token.encode("utf-8"),
    )