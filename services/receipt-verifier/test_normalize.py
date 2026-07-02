"""Unit tests for the per-bank normalizer. Run: python -m pytest (or python test_normalize.py)."""

from normalize import normalize, parse_amount


def test_parse_amount_variants():
    assert parse_amount("1,234.50") == 1234.5
    assert parse_amount("ETB 1,234.50") == 1234.5
    assert parse_amount("1234.5 ETB") == 1234.5
    assert parse_amount(None) is None
    assert parse_amount("N/A") is None


def test_cbe_maps_fields_and_has_no_status():
    raw = {
        "reference_no": "FT25211G11JQ",
        "transferred_amount": "1,200.00",
        "receiver_account": "1000123456789",
        "receiver": "LORCAN MEDICAL COLLEGE",
        "payer": "ABEBE KEBEDE",
        "payer_account": "1000987654321",
        "payment_date": "2026-06-30T10:11:12",
    }
    out = normalize("cbe", raw)
    assert out["reference"] == "FT25211G11JQ"
    assert out["amount"] == 1200.0
    assert out["receiverAccount"] == "1000123456789"
    assert out["payerName"] == "ABEBE KEBEDE"
    assert out["statusKnown"] is False  # CBE has no status field


def test_boa_has_no_receiver_account():
    raw = {
        "Transaction Reference": "BOA123",
        "Transferred Amount": "500.00",
        "Source Account Name": "ABEBE KEBEDE",
        "Source Account": "0011",
    }
    out = normalize("boa", raw)
    assert out["reference"] == "BOA123"
    assert out["amount"] == 500.0
    assert out["receiverAccount"] is None  # critical: BOA can't be auto-approved
    assert out["statusKnown"] is False


def test_zemen_and_tele_expose_status():
    zemen = normalize("zemen", {
        "Reference No": "ZM1",
        "Total Amount Paid": "ETB 300.00",
        "Recipient Account No": "222",
        "Transaction Status": "Completed",
    })
    assert zemen["amount"] == 300.0
    assert zemen["statusKnown"] is True and zemen["statusOk"] is True

    tele = normalize("tele", {
        "credited_party_number": "0900112233",
        "total_paid": "150.00",
        "status": "Completed",
    }, reference_hint="CHQ0FJ403O")
    assert tele["reference"] == "CHQ0FJ403O"  # id echoed as reference
    assert tele["receiverAccount"] == "0900112233"
    assert tele["statusOk"] is True


def test_awash_spaced_keys():
    out = normalize("awash", {
        "Transaction ID": "AW9",
        "Amount": "42.00",
        "Beneficiary Account": "333",
        "Beneficiary name": "LORCAN",
        "Sender Name": "SAM",
    })
    assert out["reference"] == "AW9"
    assert out["receiverAccount"] == "333"
    assert out["amount"] == 42.0


if __name__ == "__main__":
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print(f"ok  {name}")
    print("all passed")
