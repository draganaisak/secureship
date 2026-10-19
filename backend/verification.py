import random
import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from models import ChatSession, Customer

STATE_ANONYMOUS = "anonymous"
STATE_COLLECTING_IDENTITY = "collecting_identity"
STATE_CODE_SENT = "code_sent"
STATE_VERIFIED = "verified"
STATE_ESCALATED = "escalated_to_human"

CODE_TTL = timedelta(minutes=5)
MAX_ATTEMPTS = 3


def _now() -> datetime:
    return datetime.now(timezone.utc)


def normalize_phone(raw: str) -> str:
    return re.sub(r"\D", "", raw or "")


def generate_code() -> str:
    return f"{random.randint(0, 999999):06d}"


async def match_customer(
    db: AsyncSession, last_name: str, phone: str
) -> Customer | None:
    if not last_name or not phone:
        return None
    stmt = select(Customer).where(
        func.lower(Customer.last_name) == last_name.strip().lower()
    )
    wanted = normalize_phone(phone)
    for customer in (await db.execute(stmt)).scalars().all():
        if normalize_phone(customer.phone_number) == wanted:
            return customer
    return None


def issue_code(session: ChatSession, customer: Customer) -> str:
    code = generate_code()
    session.pending_customer_id = customer.id
    session.code = code
    session.code_expires_at = _now() + CODE_TTL
    session.code_attempts = 0
    return code


@dataclass
class CodeCheck:
    ok: bool
    reason: str
    attempts_remaining: int = 0


def code_expired(session: ChatSession) -> bool:
    return (
        session.code is None
        or session.code_expires_at is None
        or _now() > session.code_expires_at
    )


def verify_code(session: ChatSession, submitted: str) -> CodeCheck:
    if session.code is None or session.code_expires_at is None:
        return CodeCheck(ok=False, reason="expired")
    if _now() > session.code_expires_at:
        _clear_code(session)
        return CodeCheck(ok=False, reason="expired")

    if (submitted or "").strip() == session.code:
        session.customer_id = session.pending_customer_id
        _clear_code(session)
        return CodeCheck(ok=True, reason="verified")

    session.code_attempts += 1
    remaining = MAX_ATTEMPTS - session.code_attempts
    if remaining <= 0:
        _clear_code(session)
        return CodeCheck(ok=False, reason="locked", attempts_remaining=0)
    return CodeCheck(ok=False, reason="wrong", attempts_remaining=remaining)


def _clear_code(session: ChatSession) -> None:
    session.pending_customer_id = None
    session.code = None
    session.code_expires_at = None
    session.code_attempts = 0
