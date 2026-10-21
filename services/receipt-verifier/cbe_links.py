"""
CBE receipt links — both generations.

Legacy (internet-banking PDF receipts):
    https://apps.cbe.com.et:100/?id=<FT number><last 8 account digits>

New ("mbreciept") system: a short link renders a public receipt page which
itself calls a public JSON API:
    https://mbreciept.cbe.com.et/<signed-token>
    -> GET https://mb.cbe.com.et/api/v1/transactions/public/transaction-detail/<token>
       with two public application-header constants shipped in that page's JS.

The <token> is signed server-side — it cannot be constructed — so this path
only works when the student pastes the link from their receipt/SMS/QR.
"""

import re
from typing import Any, Dict, Optional, Tuple
from urllib.parse import parse_qs, urlparse

import requests

MBRECEIPT_HOST = "mbreciept.cbe.com.et"
MBRECEIPT_API = (
    "https://mb.cbe.com.et/api/v1/transactions/public/transaction-detail"
)
# Public application identifiers the mbreciept page itself uses (constants
# shipped in its JS bundle) — not secrets.
MBRECEIPT_HEADERS = {
    "X-App-ID": "d1292e42-7400-49de-a2d3-9731caa4c819",
    "X-App-Version": "0a01980b-9859-1369-8198-59f403820000",
}
REQUEST_TIMEOUT_SECONDS = 30

_LEGACY_ID_RE = re.compile(r"^(FT[0-9A-Za-z]{10})(\d{8,})$", re.IGNORECASE)


def extract_mbreciept_token(url: str) -> Optional[str]:
    """Return the short-link token from an mbreciept URL, else None."""
    parsed = urlparse((url or "").strip())
    hostname = (parsed.hostname or "").lower().rstrip(".")
    if hostname != MBRECEIPT_HOST:
        return None
    token = (parsed.path or "").strip("/").split("/")[0]
    return token or None


def parse_legacy_receipt_url(url: str) -> Optional[Tuple[str, str]]:
    """Parse `?id=<FT><digits>` from a legacy CBE link → (FT, account digits)."""
    parsed = urlparse((url or "").strip())
    hostname = (parsed.hostname or "").lower().rstrip(".")
    if hostname != "apps.cbe.com.et":
        return None
    raw_id = (parse_qs(parsed.query).get("id") or [""])[0].strip()
    match = _LEGACY_ID_RE.match(raw_id)
    if not match:
        return None
    return match.group(1).upper(), match.group(2)


def fetch_mbreciept_receipt(token: str) -> Dict[str, Any]:
    """GET the public transaction JSON for a short-link token."""
    response = requests.get(
        f"{MBRECEIPT_API}/{token}",
        headers=MBRECEIPT_HEADERS,
        timeout=REQUEST_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    return response.json()
