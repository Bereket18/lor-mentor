"""Security-focused tests for receipt URL validation."""

from main import ExtractRequest, VerifierError, _reference_hint, _validate_receipt_url


def test_accepts_each_official_bank_host():
    cases = {
        "cbe": "https://apps.cbe.com.et:100/?id=FT123",
        "dashen": "https://receipt.dashensuperapp.com/receipt/ABC",
        "awash": "https://awashpay.awashbank.com:8225/-ABC",
        "boa": "https://cs.bankofabyssinia.com/slip/?trx=ABC",
        "zemen": "https://share.zemenbank.com/rt/ABC/pdf",
        "tele": "https://transactioninfo.ethiotelecom.et/receipt/ABC",
    }
    for bank, url in cases.items():
        assert _validate_receipt_url(bank, url) == url


def test_rejects_non_bank_and_insecure_urls():
    bad_urls = [
        "http://receipt.dashensuperapp.com/receipt/ABC",
        "https://127.0.0.1/admin",
        "https://receipt.dashensuperapp.com@example.com/receipt/ABC",
        "https://receipt.dashensuperapp.com.evil.example/receipt/ABC",
    ]
    for url in bad_urls:
        try:
            _validate_receipt_url("dashen", url)
        except VerifierError as exc:
            assert exc.code == "BAD_INPUT"
        else:
            raise AssertionError(f"unsafe URL was accepted: {url}")


def test_telebirr_url_uses_receipt_id_as_reference_hint():
    req = ExtractRequest(
        bank="tele",
        url="https://transactioninfo.ethiotelecom.et/receipt/CHQ0FJ403O",
    )
    assert _reference_hint(req) == "CHQ0FJ403O"


if __name__ == "__main__":
    test_accepts_each_official_bank_host()
    test_rejects_non_bank_and_insecure_urls()
    test_telebirr_url_uses_receipt_id_as_reference_hint()
    print("all passed")
