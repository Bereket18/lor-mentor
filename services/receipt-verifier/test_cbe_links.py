"""Unit tests for CBE receipt-link parsing (legacy + mbreciept)."""

from cbe_links import extract_mbreciept_token, parse_legacy_receipt_url


def test_mbreciept_token_extraction():
    assert (
        extract_mbreciept_token("https://mbreciept.cbe.com.et/AbC123xyz")
        == "AbC123xyz"
    )
    # Host is case-insensitive; extra path segments are ignored.
    assert (
        extract_mbreciept_token("https://Mbreciept.cbe.com.et/tok/en/details")
        == "tok"
    )
    assert extract_mbreciept_token("https://mbreciept.cbe.com.et/") is None
    assert extract_mbreciept_token("https://apps.cbe.com.et:100/?id=X") is None
    assert extract_mbreciept_token("") is None


def test_legacy_receipt_url_parsing():
    ft, account = parse_legacy_receipt_url(
        "https://apps.cbe.com.et:100/?id=FT26287CZTG923923036"
    )
    assert ft == "FT26287CZTG9"
    assert account == "23923036"

    # Lowercase FT is canonicalized; full account numbers also work.
    ft, account = parse_legacy_receipt_url(
        "https://apps.cbe.com.et:100/?id=ft26287cztg91000423923036"
    )
    assert ft == "FT26287CZTG9"
    assert account == "1000423923036"


def test_legacy_parser_rejects_other_shapes():
    assert parse_legacy_receipt_url("https://mbreciept.cbe.com.et/tok") is None
    # No account digits appended.
    assert (
        parse_legacy_receipt_url("https://apps.cbe.com.et:100/?id=FT26287CZTG9")
        is None
    )
    # Id that is not an FT number.
    assert (
        parse_legacy_receipt_url("https://apps.cbe.com.et:100/?id=ABC23923036")
        is None
    )


if __name__ == "__main__":
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print(f"ok  {name}")
    print("all passed")
