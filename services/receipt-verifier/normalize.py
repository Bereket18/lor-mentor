"""
Per-bank normalization for ethiobank-receipts.

Each bank's extractor returns a differently-shaped dict (different keys, some
with spaces, different money formats). This module maps every bank onto ONE
common contract the Node/NestJS side can reason about:

    {
      "bank":            "cbe",
      "reference":       "FT25211G11JQ",   # transaction / reference number
      "amount":          1234.50,          # ETB credited to the receiver, float
      "receiverAccount": "1000123456789",  # may be None (BOA never exposes it)
      "receiverName":    "LORCAN MEDICAL COLLEGE",
      "payerName":       "ABEBE KEBEDE",
      "payerAccount":    "1000...",
      "status":          "success" | "<raw>" | None,
      "statusKnown":     True,             # False when the bank has no status field
      "date":            "2026-06-30T10:11:12",
      "raw":             { ...original extractor dict... }
    }

IMPORTANT trust notes encoded here (see README):
  - BOA receipts do NOT contain a beneficiary/receiver account, so
    `receiverAccount` is None and auto-approval is impossible for BOA.
  - Only Telebirr and Zemen return an explicit transaction status. For the
    others `statusKnown` is False and the caller must weigh that.
"""

import re
from typing import Any, Dict, Optional

# Values the various banks use to mean "the transfer completed".
_SUCCESS_TOKENS = {
    "success",
    "successful",
    "completed",
    "complete",
    "paid",
    "done",
    "approved",
}


def parse_amount(value: Any) -> Optional[float]:
    """Turn '1,234.50', 'ETB 1,234.50', '1234.5 ETB' → 1234.5. None if unparseable."""
    if value is None:
        return None
    text = str(value)
    # Strip currency words and any non-numeric noise except . and digits.
    cleaned = re.sub(r"[^\d.]", "", text.replace(",", ""))
    if not cleaned:
        return None
    try:
        return float(cleaned)
    except ValueError:
        return None


def normalize_status(value: Optional[str]) -> Dict[str, Any]:
    """Return {status, statusKnown, statusOk}. statusKnown=False when bank omits it."""
    if value is None:
        return {"status": None, "statusKnown": False, "statusOk": None}
    ok = str(value).strip().lower() in _SUCCESS_TOKENS
    return {"status": str(value).strip(), "statusKnown": True, "statusOk": ok}


def _first(raw: Dict[str, Any], *keys: str) -> Optional[str]:
    """First non-empty value among the given keys."""
    for key in keys:
        val = raw.get(key)
        if val not in (None, ""):
            return val
    return None


def _base(bank: str, raw: Dict[str, Any], status_value: Optional[str]) -> Dict[str, Any]:
    status = normalize_status(status_value)
    return {
        "bank": bank,
        "reference": None,
        "amount": None,
        "receiverAccount": None,
        "receiverName": None,
        "payerName": None,
        "payerAccount": None,
        "date": None,
        "raw": raw,
        **status,
    }


def normalize(bank: str, raw: Dict[str, Any], reference_hint: Optional[str] = None) -> Dict[str, Any]:
    """Map a raw extractor dict onto the common contract. `bank` is lowercase."""
    bank = bank.lower()
    if not isinstance(raw, dict):
        raise ValueError("Extractor returned no data")

    if bank == "cbe":
        out = _base(bank, raw, None)
        out.update(
            reference=_first(raw, "reference_no"),
            amount=parse_amount(_first(raw, "transferred_amount", "total_debited")),
            receiverAccount=_first(raw, "receiver_account"),
            receiverName=_first(raw, "receiver"),
            payerName=_first(raw, "payer", "customer_name"),
            payerAccount=_first(raw, "payer_account"),
            date=_first(raw, "payment_date"),
        )

    elif bank == "dashen":
        out = _base(bank, raw, None)
        out.update(
            reference=_first(raw, "transaction_reference", "transfer_reference"),
            amount=parse_amount(_first(raw, "amount", "total")),
            receiverAccount=_first(raw, "beneficiary_account"),
            receiverName=_first(raw, "beneficiary_name"),
            payerName=_first(raw, "sender_name"),
            date=_first(raw, "transaction_date"),
        )

    elif bank == "awash":
        out = _base(bank, raw, None)
        out.update(
            reference=_first(raw, "Transaction ID"),
            amount=parse_amount(_first(raw, "Amount")),
            receiverAccount=_first(raw, "Beneficiary Account"),
            receiverName=_first(raw, "Beneficiary name"),
            payerName=_first(raw, "Sender Name"),
            payerAccount=_first(raw, "Sender Account"),
            date=_first(raw, "Transaction Time"),
        )

    elif bank == "boa":
        # BOA receipts expose only the SOURCE (payer) side — there is no
        # beneficiary/receiver account in the data. receiverAccount stays None,
        # which the caller treats as "cannot auto-verify → manual review".
        out = _base(bank, raw, None)
        out.update(
            reference=_first(raw, "Transaction Reference"),
            amount=parse_amount(_first(raw, "Transferred Amount", "Total Amount")),
            payerName=_first(raw, "Source Account Name"),
            payerAccount=_first(raw, "Source Account"),
            date=_first(raw, "Transaction Date"),
        )

    elif bank == "zemen":
        out = _base(bank, raw, _first(raw, "Transaction Status"))
        out.update(
            reference=_first(raw, "Reference No"),
            amount=parse_amount(_first(raw, "Total Amount Paid", "Settled Amount")),
            receiverAccount=_first(raw, "Recipient Account No"),
            receiverName=_first(raw, "Recipient Name"),
            payerName=_first(raw, "Payer Name"),
            payerAccount=_first(raw, "Payer Account No"),
            date=_first(raw, "Date"),
        )

    elif bank == "tele":
        # Telebirr's data has no reference field — the receipt id IS the
        # reference, so we fall back to the id the caller passed in.
        out = _base(bank, raw, _first(raw, "status"))
        out.update(
            reference=reference_hint,
            amount=parse_amount(_first(raw, "total_paid")),
            receiverAccount=_first(raw, "credited_party_number"),
            receiverName=_first(raw, "credited_party"),
            payerName=_first(raw, "payer_name"),
            payerAccount=_first(raw, "payer_number"),
        )

    else:
        raise ValueError(f"Unsupported bank: {bank}")

    return out
