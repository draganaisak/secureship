import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from db.session import get_session, init_db
from llm.extract import classify_intent, extract_identity
from llm.ollama_client import chat
from models import ChatSession, Customer
from verification import (
    STATE_ANONYMOUS,
    STATE_CODE_SENT,
    STATE_COLLECTING_IDENTITY,
    STATE_ESCALATED,
    STATE_VERIFIED,
    issue_code,
    match_customer,
    verify_code,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(title="SecureShip API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SYSTEM_PROMPT = (
    "You are SecureShip's shipment-support assistant. "
    "Be concise, friendly, and professional. "
    "Help customers with questions about parcel shipments and deliveries."
)

VERIFIED_SYSTEM = SYSTEM_PROMPT + (
    " The customer's identity is verified. You cannot look up specific shipment "
    "records yet - that feature is coming soon - so never invent tracking numbers, "
    "statuses, or delivery dates. Acknowledge the request and let them know "
    "shipment lookups are not available yet."
)

ASK_IDENTITY = (
    "I can help with that, but first I need to verify your identity. Could you "
    "share your first name, last name, address, and phone number?"
)
ASK_MISSING = "Thanks. I still need your {missing} to continue."
NEUTRAL_REJECT = (
    "I'm sorry, but I couldn't verify those details against our records. Please "
    "double-check your name and phone number and try again."
)
CODE_SENT_MSG = (
    "Thanks - I've sent a 6-digit verification code. Please enter it in the box "
    "that just appeared."
)
ENTER_CODE_NUDGE = "Please enter the 6-digit code in the verification box to continue."
VERIFIED_GREETING = "You're verified{name}. How can I help you with your shipments today?"
WRONG_CODE = "That code wasn't correct. You have {n} attempt(s) left."
LOCKED_MSG = (
    "That's too many incorrect attempts, so I've cancelled that code. Let's start "
    "over - please share your name and phone number again."
)
EXPIRED_MSG = (
    "That code has expired. Let's start over - please share your name and phone "
    "number again."
)
ESCALATION_ACK = "Thanks for your patience - connecting you with a member of our team."

_FIELD_LABELS = {
    "first_name": "first name",
    "last_name": "last name",
    "address": "address",
    "phone": "phone number",
}

_RESET_MARKERS = (LOCKED_MSG, EXPIRED_MSG)


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _log_mock_sms(session_id: uuid.UUID, code: str) -> None:
    print(f"[mock-sms] verification code for session {session_id}: {code}", flush=True)


class ChatRequest(BaseModel):
    message: str
    session_id: uuid.UUID | None = None


class ChatResponse(BaseModel):
    reply: str
    session_id: uuid.UUID
    state: str
    show_code_modal: bool = False
    escalate: bool = False
    first_name: str | None = None


class VerifyCodeRequest(BaseModel):
    session_id: uuid.UUID
    code: str


class VerifyCodeResponse(BaseModel):
    verified: bool
    state: str
    attempts_remaining: int = 0
    reply: str


@app.get("/health")
def health():
    return {"status": "ok"}


async def _known_first_name(
    db: AsyncSession, session: ChatSession, transcript: list[dict]
) -> str | None:
    cid = session.customer_id or session.pending_customer_id
    if cid is not None:
        customer = await db.get(Customer, cid)
        if customer is not None:
            return customer.first_name
    return (await extract_identity(transcript)).get("first_name")


async def _faq_reply(transcript: list[dict], system: str) -> str:
    messages = [{"role": "system", "content": system}]
    messages += [{"role": m["role"], "content": m["content"]} for m in transcript]
    return await chat(messages)


def _identity_scope(transcript: list[dict]) -> list[dict]:
    start = 0
    for i, m in enumerate(transcript):
        if m["role"] == "assistant" and m["content"] in _RESET_MARKERS:
            start = i + 1
    return transcript[start:]


@app.post("/chat", response_model=ChatResponse, operation_id="sendChat")
async def chat_endpoint(req: ChatRequest, db: AsyncSession = Depends(get_session)):
    session = None
    if req.session_id is not None:
        session = await db.get(ChatSession, req.session_id)
    if session is None:
        session = ChatSession()
        db.add(session)

    transcript = list(session.transcript or [])
    transcript.append(
        {"role": "user", "content": req.message, "timestamp": _utcnow_iso()}
    )

    if session.state == STATE_ESCALATED:
        session.state = STATE_VERIFIED if session.customer_id else STATE_ANONYMOUS

    show_code_modal = False
    escalate = False
    first_name = None

    intent = await classify_intent(transcript)

    if intent["wants_human"]:
        first_name = await _known_first_name(db, session, transcript)
        session.state = STATE_ESCALATED
        escalate = True
        reply = ESCALATION_ACK

    elif session.state == STATE_ANONYMOUS:
        if intent["wants_shipment"]:
            session.state = STATE_COLLECTING_IDENTITY
            reply = ASK_IDENTITY
        else:
            reply = await _faq_reply(transcript, SYSTEM_PROMPT)

    elif session.state == STATE_COLLECTING_IDENTITY:
        fields = await extract_identity(_identity_scope(transcript))
        if fields["last_name"] and fields["phone"]:
            customer = await match_customer(db, fields["last_name"], fields["phone"])
            if customer is not None:
                code = issue_code(session, customer)
                _log_mock_sms(session.id, code)
                session.state = STATE_CODE_SENT
                show_code_modal = True
                first_name = customer.first_name
                reply = CODE_SENT_MSG
            else:
                reply = NEUTRAL_REJECT
        else:
            missing = ", ".join(
                _FIELD_LABELS[k]
                for k in ("first_name", "last_name", "address", "phone")
                if not fields[k]
            )
            reply = ASK_MISSING.format(missing=missing)

    elif session.state == STATE_CODE_SENT:
        show_code_modal = True
        reply = ENTER_CODE_NUDGE

    else:
        reply = await _faq_reply(transcript, VERIFIED_SYSTEM)

    transcript.append(
        {"role": "assistant", "content": reply, "timestamp": _utcnow_iso()}
    )
    session.transcript = transcript

    await db.commit()
    return ChatResponse(
        reply=reply,
        session_id=session.id,
        state=session.state,
        show_code_modal=show_code_modal,
        escalate=escalate,
        first_name=first_name,
    )


@app.post("/verify-code", response_model=VerifyCodeResponse, operation_id="verifyCode")
async def verify_code_endpoint(
    req: VerifyCodeRequest, db: AsyncSession = Depends(get_session)
):
    session = await db.get(ChatSession, req.session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="session not found")

    result = verify_code(session, req.code)

    if result.ok:
        session.state = STATE_VERIFIED
        customer = await db.get(Customer, session.customer_id)
        name = f", {customer.first_name}" if customer and customer.first_name else ""
        reply = VERIFIED_GREETING.format(name=name)
    elif result.reason == "wrong":
        reply = WRONG_CODE.format(n=result.attempts_remaining)
    elif result.reason == "locked":
        session.state = STATE_COLLECTING_IDENTITY
        reply = LOCKED_MSG
    else:
        session.state = STATE_COLLECTING_IDENTITY
        reply = EXPIRED_MSG

    transcript = list(session.transcript or [])
    transcript.append(
        {"role": "assistant", "content": reply, "timestamp": _utcnow_iso()}
    )
    session.transcript = transcript

    await db.commit()
    return VerifyCodeResponse(
        verified=result.ok,
        state=session.state,
        attempts_remaining=result.attempts_remaining,
        reply=reply,
    )
