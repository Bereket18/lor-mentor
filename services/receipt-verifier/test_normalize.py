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


def test_cbe_falls_back_to_lookup_reference_when_reference_unparsed():
    # Live example: the CBE-Birr "VAT Invoice / Customer Receipt" layout
    # parses "Reference No." as "VAT"; the FT the caller looked up wins.
    raw = {
        "reference_no": "VAT",
        "transferred_amount": "500.00",
        "receiver_account": "1****3036",
        "receiver": "LORCAN MEDICAL COLLEGE",
        "payment_date": "2026-10-13T20:02:00",
    }
    out = normalize("cbe", raw, reference_hint="ft26287cztg9")
    assert out["reference"] == "FT26287CZTG9"
    assert out["amount"] == 500.0
    assert out["receiverAccount"] == "1****3036"


def test_cbe_keeps_a_valid_parsed_reference():
    out = normalize(
        "cbe", {"reference_no": "FT25211G11JQ"}, reference_hint="FT0000000000"
    )
    assert out["reference"] == "FT25211G11JQ"


def test_cbe_drops_garbage_reference_when_no_valid_hint():
    out = normalize("cbe", {"reference_no": "VAT", "transferred_amount": "10.00"})
    assert out["reference"] is None


def test_cbe_new_style_maps_public_api_payload():
    # Shape of the mbreciept public API payload (fields the CBE web page reads).
    raw = {
        "id": "FT26287CZTG9",
        "creditAccountNo": "1000423923036",
        "creditAccountHolder": "LORCAN MEDICAL COLLEGE",
        "debitAccountHolder": "ABEBE KEBEDE",
        "debitAccountNo": "251910593394",
        "amountCredited": "500.00",
        "status": "SUCCESS",
        "dateTimes": ["20261013200200"],
    }
    out = normalize("cbe", raw)
    assert out["reference"] == "FT26287CZTG9"
    assert out["amount"] == 500.0
    assert out["receiverAccount"] == "1000423923036"
    assert out["receiverName"] == "LORCAN MEDICAL COLLEGE"
    assert out["payerName"] == "ABEBE KEBEDE"
    assert out["payerAccount"] == "251910593394"
    assert out["statusKnown"] is True and out["statusOk"] is True
    assert out["date"] == "2026-10-13T20:02:00"


def test_cbe_new_style_recognizes_a_failed_status():
    out = normalize("cbe", {"id": "FT0000000000", "amountCredited": 10, "status": "FAILED"})
    assert out["statusKnown"] is True and out["statusOk"] is False


def test_cbe_new_style_missing_status_and_dates_stay_safe():
    out = normalize("cbe", {"id": "FT0000000000", "amountCredited": "500.00"})
    assert out["statusKnown"] is False  # no status field → caller weighs it
    assert out["date"] is None


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
