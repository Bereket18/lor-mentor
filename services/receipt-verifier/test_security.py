"""Security tests: receipt URL validation and verifier authentication.

These import from `security.py`, not `main.py`. `main.py` imports
`ethiobank_receipts` (Selenium + Chromium), which CI does not install; the
tests only need the validation and auth helpers, which live in the
dependency-light module. The startup gate — the part that really needs
`main.py` — is covered by importing it in a subprocess with the heavy
package stubbed out (see `test_main_refuses_to_start_without_a_token`).
"""

import os
import subprocess
import sys

from security import (
    TOKEN_ENV_VAR,
    ExtractRequest,
    VerifierError,
    is_authorized,
    load_shared_token,
    reference_hint,
    validate_receipt_url,
)

HERE = os.path.dirname(os.path.abspath(__file__))


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
        assert validate_receipt_url(bank, url) == url


def test_rejects_non_bank_and_insecure_urls():
    bad_urls = [
        "http://receipt.dashensuperapp.com/receipt/ABC",
        "https://127.0.0.1/admin",
        "https://receipt.dashensuperapp.com@example.com/receipt/ABC",
        "https://receipt.dashensuperapp.com.evil.example/receipt/ABC",
    ]
    for url in bad_urls:
        try:
            validate_receipt_url("dashen", url)
        except VerifierError as exc:
            assert exc.code == "BAD_INPUT"
        else:
            raise AssertionError(f"unsafe URL was accepted: {url}")


def test_rejects_unknown_bank():
    # A bank outside the allowlist must not raise KeyError (a 500) — it is
    # input, so it is a 400.
    try:
        validate_receipt_url("notabank", "https://example.com/x")
    except VerifierError as exc:
        assert exc.code == "BAD_INPUT"
        assert exc.http_status == 400
    else:
        raise AssertionError("unknown bank was accepted")


def test_telebirr_url_uses_receipt_id_as_reference_hint():
    req = ExtractRequest(
        bank="tele",
        url="https://transactioninfo.ethiotelecom.et/receipt/CHQ0FJ403O",
    )
    assert reference_hint(req) == "CHQ0FJ403O"


def test_accepts_mbreciept_host_for_cbe():
    url = "https://mbreciept.cbe.com.et/AbC123xyz"
    assert validate_receipt_url("cbe", url) == url


def test_cbe_url_uses_ft_as_reference_hint():
    req = ExtractRequest(
        bank="cbe",
        url="https://apps.cbe.com.et:100/?id=FT26287CZTG923923036",
    )
    assert reference_hint(req) == "FT26287CZTG9"


def test_mbreciept_url_has_no_reference_hint():
    req = ExtractRequest(bank="cbe", url="https://mbreciept.cbe.com.et/AbC123")
    assert reference_hint(req) is None


# ── Authentication ────────────────────────────────────────────────


def test_missing_token_refuses_to_start():
    # Unset is the case that used to disable authentication entirely.
    try:
        load_shared_token({})
    except RuntimeError as exc:
        assert TOKEN_ENV_VAR in str(exc)
        assert "refuses to start" in str(exc)
    else:
        raise AssertionError("an unset token was accepted")


def test_empty_token_refuses_to_start():
    for value in ("", "   ", "\t\n"):
        try:
            load_shared_token({TOKEN_ENV_VAR: value})
        except RuntimeError:
            pass
        else:
            raise AssertionError(f"blank token {value!r} was accepted")


def test_configured_token_is_returned_trimmed():
    assert load_shared_token({TOKEN_ENV_VAR: "  s3cret-value  "}) == "s3cret-value"


def test_missing_request_credential_is_rejected():
    assert is_authorized("s3cret-value", None) is False
    assert is_authorized("s3cret-value", "") is False


def test_incorrect_request_credential_is_rejected():
    assert is_authorized("s3cret-value", "s3cret-valuf") is False
    assert is_authorized("s3cret-value", "s3cret-value ") is False
    assert is_authorized("s3cret-value", "S3CRET-VALUE") is False


def test_correct_request_credential_is_accepted():
    assert is_authorized("s3cret-value", "s3cret-value") is True


def test_empty_configured_token_never_authorizes():
    # Defence in depth: even if startup validation were bypassed, an empty
    # configured token must not authenticate anybody.
    assert is_authorized("", None) is False
    assert is_authorized("", "") is False
    assert is_authorized("", "anything") is False


def test_non_ascii_credential_is_rejected_without_raising():
    # hmac.compare_digest raises TypeError on non-ASCII str; the helper must
    # compare bytes so hostile header values produce 401, not 500.
    assert is_authorized("s3cret-value", "pässword") is False
    assert is_authorized("pässword", "pässword") is True


# ── Startup gate (real main.py, heavy dependency stubbed) ─────────

_STUBBED_IMPORT = r"""
import sys, types

pkg = types.ModuleType("ethiobank_receipts")
pkg.extract_receipt = lambda bank, ref: {}
extractors = types.ModuleType("ethiobank_receipts.extractors")
cbe = types.ModuleType("ethiobank_receipts.extractors.cbe")
cbe.extract_cbe_receipt_info_from_ft = lambda ft, account: {}
pkg.extractors = extractors
sys.modules["ethiobank_receipts"] = pkg
sys.modules["ethiobank_receipts.extractors"] = extractors
sys.modules["ethiobank_receipts.extractors.cbe"] = cbe

import main

print("started")
"""


def _import_main_with_env(**overrides):
    env = dict(os.environ)
    for key in list(env):
        if key == TOKEN_ENV_VAR:
            del env[key]
    env.update(overrides)
    return subprocess.run(
        [sys.executable, "-c", _STUBBED_IMPORT],
        cwd=HERE,
        env=env,
        capture_output=True,
        text=True,
        timeout=120,
    )


def test_main_refuses_to_start_without_a_token():
    result = _import_main_with_env()
    assert result.returncode != 0, f"main.py started without a token: {result.stdout}"
    assert TOKEN_ENV_VAR in result.stderr
    assert "started" not in result.stdout


def test_main_refuses_to_start_with_an_empty_token():
    result = _import_main_with_env(**{TOKEN_ENV_VAR: "   "})
    assert result.returncode != 0, f"main.py started with a blank token: {result.stdout}"
    assert "started" not in result.stdout


def test_main_starts_with_a_token():
    result = _import_main_with_env(**{TOKEN_ENV_VAR: "s3cret-value"})
    assert result.returncode == 0, result.stderr
    assert "started" in result.stdout


if __name__ == "__main__":
    failures = 0
    checks = [(n, f) for n, f in sorted(globals().items()) if n.startswith("test_")]
    for name, fn in checks:
        try:
            fn()
            print(f"ok   {name}")
        except Exception as exc:  # noqa: BLE001 — report every failure, not just the first
            failures += 1
            print(f"FAIL {name}: {type(exc).__name__}: {exc}")
    if failures:
        raise SystemExit(f"{failures}/{len(checks)} security checks failed")
    print(f"all {len(checks)} passed")