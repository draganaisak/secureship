import pytest
from fastapi import HTTPException

import auth


def test_empty_allowlist_denies_everyone(monkeypatch):
    monkeypatch.setattr(auth, "ADMIN_SUBS", set())
    with pytest.raises(HTTPException) as exc:
        auth._assert_admin({"sub": "auth0|anyone"})
    assert exc.value.status_code == 403


def test_non_allowlisted_subject_denied(monkeypatch):
    monkeypatch.setattr(auth, "ADMIN_SUBS", {"auth0|admin"})
    with pytest.raises(HTTPException) as exc:
        auth._assert_admin({"sub": "auth0|intruder"})
    assert exc.value.status_code == 403


def test_missing_sub_denied(monkeypatch):
    monkeypatch.setattr(auth, "ADMIN_SUBS", {"auth0|admin"})
    with pytest.raises(HTTPException):
        auth._assert_admin({})


def test_allowlisted_subject_allowed(monkeypatch):
    monkeypatch.setattr(auth, "ADMIN_SUBS", {"auth0|admin"})
    auth._assert_admin({"sub": "auth0|admin"})
