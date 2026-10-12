import json
import re
import uuid
from contextlib import asynccontextmanager
from datetime import date, datetime, timezone

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from admin import router as admin_router
from db.session import get_session, init_db
from llm.extract import classify_intent, extract_identity
from llm.ollama_client import chat, chat_with_tools, strip_think
from models import ChatSession, Customer
from tools import SHIPMENT_TOOLS, run_tool
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

app.include_router(admin_router)

SYSTEM_PROMPT = (
    "You are SecureShip's shipment-support assistant. "
    "Be concise, friendly, and professional. "
    "Help customers with questions about parcel shipments and deliveries."
)

VERIFIED_SYSTEM = SYSTEM_PROMPT + (
    " The customer's identity is verified. Answer questions about their shipments only "
    "with the lookup_shipments tool, and base every answer solely on what it returns; "
    "never invent tracking numbers, statuses, carriers, or dates. All lookups are "
    "automatically limited to this customer, so never ask for or accept a customer id, "
    "name, or account to look anyone else up. When the customer asks about their "
    "shipments without naming a specific one, ask them for the tracking number of the "
    "shipment they want, and mention they can ask to see all their shipments instead. "
    "When they give a tracking number, call lookup_shipments and report that specific "
    "shipment; if it is not among their shipments, tell them it was not found on their "
    "account. When they ask to see all their shipments, call lookup_shipments and list "
    "them. Do not say you are looking it up and then stop - call the tool and answer in "
    "the same reply. Present each shipment on its own lines: a header '📦 Shipment "
    "<tracking>', then '• Status:', '• Carrier:', '• From:', '• To:', '• Estimated "
    "delivery:', and '• Last update:', one per line."
)

ASK_TRACKING = (
    "Which shipment would you like to check? Please share the tracking number, or ask "
    "to see all your shipments."
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
TOOLS_FALLBACK = "I'm having trouble looking that up right now. Please try again in a moment."

MAX_TOOL_ROUNDS = 4

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


async def _verified_reply(
    db: AsyncSession, session: ChatSession, transcript: list[dict]
) -> tuple[str, list[str]]:
    messages = [{"role": "system", "content": VERIFIED_SYSTEM}]
    messages += [{"role": m["role"], "content": m["content"]} for m in transcript]
    tool_names: list[str] = []

    for _ in range(MAX_TOOL_ROUNDS):
        message = await chat_with_tools(messages, SHIPMENT_TOOLS)
        calls = message.get("tool_calls") or []
        if not calls:
            return strip_think(message.get("content", "")) or TOOLS_FALLBACK, tool_names
        messages.append(message)
        for call in calls:
            fn = call.get("function", {})
            name = fn.get("name", "")
            tool_names.append(name)
            result = await run_tool(name, fn.get("arguments") or {}, db, session)
            messages.append(
                {"role": "tool", "content": json.dumps(result), "tool_name": name}
            )

    return TOOLS_FALLBACK, tool_names


_TRACKING_RE = re.compile(r"MX\d{12}", re.IGNORECASE)
_LIST_ALL_RE = re.compile(r"\b(all|every|everything|list)\b", re.IGNORECASE)


def _find_tracking(transcript: list[dict]) -> str | None:
    for m in transcript:
        if m["role"] == "user":
            found = _TRACKING_RE.search(m["content"] or "")
            if found:
                return found.group(0).upper()
    return None


_STATUS_LABELS = {
    "label_created": "Label created",
    "in_transit": "In transit",
    "out_for_delivery": "Out for delivery",
    "delivered": "Delivered",
    "exception": "Exception",
}


def _fmt_date(iso: str) -> str:
    d = date.fromisoformat(iso[:10])
    return f"{d.strftime('%b')} {d.day}, {d.year}"


def _format_shipment(s: dict) -> str:
    status = _STATUS_LABELS.get(s["status"], s["status"].replace("_", " ").capitalize())
    return (
        f"📦 Shipment {s['tracking_number']}\n"
        f"• Status: {status}\n"
        f"• Carrier: {s['carrier']}\n"
        f"• From: {s['origin']}\n"
        f"• To: {s['destination']}\n"
        f"• Estimated delivery: {_fmt_date(s['estimated_delivery'])}\n"
        f"• Last update: {_fmt_date(s['last_update'])}"
    )


def _describe_shipment(s: dict) -> str:
    return "Here you go:\n\n" + _format_shipment(s)


async def _list_all_shipments(db: AsyncSession, session: ChatSession) -> str:
    data = await run_tool("lookup_shipments", {}, db, session)
    shipments = data.get("shipments", [])
    if not shipments:
        return "You don't have any shipments on your account right now."
    blocks = "\n\n".join(_format_shipment(s) for s in shipments)
    count = len(shipments)
    verb = "is" if count == 1 else "are"
    plural = "" if count == 1 else "s"
    return f"Here {verb} your {count} shipment{plural}:\n\n{blocks}"


async def _post_verify_reply(
    db: AsyncSession, session: ChatSession, transcript: list[dict]
) -> str:
    customer = await db.get(Customer, session.customer_id)
    name = customer.first_name if customer and customer.first_name else None
    greeting = f"You're verified{', ' + name if name else ''}! "

    tracking = _find_tracking(transcript)
    if tracking is None:
        return greeting + ASK_TRACKING
    return greeting + await _lookup_by_tracking(db, session, tracking)


async def _lookup_by_tracking(
    db: AsyncSession, session: ChatSession, tracking: str
) -> str:
    data = await run_tool("lookup_shipments", {}, db, session)
    shipments = data.get("shipments", [])
    match = next(
        (s for s in shipments if s["tracking_number"].upper() == tracking), None
    )
    if match is None:
        return (
            f"I couldn't find tracking number {tracking} on your account. Share a "
            "different tracking number, or ask to see all your shipments."
        )
    return _describe_shipment(match)


async def _verified_turn(
    db: AsyncSession, session: ChatSession, transcript: list[dict]
) -> tuple[str, list[str]]:
    latest = transcript[-1]["content"] if transcript else ""
    found = _TRACKING_RE.search(latest or "")
    if found:
        reply = await _lookup_by_tracking(db, session, found.group(0).upper())
        return reply, ["lookup_shipments"]
    if _LIST_ALL_RE.search(latest or ""):
        return await _list_all_shipments(db, session), ["lookup_shipments"]
    return await _verified_reply(db, session, transcript)


def _identity_scope(transcript: list[dict]) -> list[dict]:
    start = 0
    for i, m in enumerate(transcript):
        if m["role"] == "assistant" and m["content"] in _RESET_MARKERS:
            start = i + 1
    return transcript[start:]


async def _collect_identity(
    db: AsyncSession, session: ChatSession, transcript: list[dict]
) -> tuple[str, bool]:
    """Pull identity from the transcript and, if it matches, send the code.

    Returns (reply, show_code_modal). Shared by the anonymous->collect transition
    and the collecting-identity turn so details given up front are not ignored.
    """
    fields = await extract_identity(_identity_scope(transcript))
    if fields["last_name"] and fields["phone"]:
        customer = await match_customer(db, fields["last_name"], fields["phone"])
        if customer is not None:
            code = issue_code(session, customer)
            _log_mock_sms(session.id, code)
            session.state = STATE_CODE_SENT
            return CODE_SENT_MSG, True
        return NEUTRAL_REJECT, False
    missing_keys = [
        k for k in ("first_name", "last_name", "address", "phone") if not fields[k]
    ]
    if len(missing_keys) == 4:
        return ASK_IDENTITY, False
    return ASK_MISSING.format(missing=", ".join(_FIELD_LABELS[k] for k in missing_keys)), False


@app.post("/chat", response_model=ChatResponse, operation_id="sendChat")
async def chat_endpoint(req: ChatRequest, db: AsyncSession = Depends(get_session)):
    session = None
    if req.session_id is not None:
        session = await db.get(ChatSession, req.session_id)
    if session is None:
        session = ChatSession(state=STATE_ANONYMOUS)
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
    tool_calls_made: list[str] = []

    intent = await classify_intent(transcript)

    if intent["wants_human"]:
        first_name = await _known_first_name(db, session, transcript)
        session.state = STATE_ESCALATED
        escalate = True
        reply = ESCALATION_ACK

    elif session.state == STATE_ANONYMOUS:
        if intent["wants_shipment"]:
            session.state = STATE_COLLECTING_IDENTITY
            reply, show_code_modal = await _collect_identity(db, session, transcript)
        else:
            reply = await _faq_reply(transcript, SYSTEM_PROMPT)

    elif session.state == STATE_COLLECTING_IDENTITY:
        reply, show_code_modal = await _collect_identity(db, session, transcript)

    elif session.state == STATE_CODE_SENT:
        show_code_modal = True
        reply = ENTER_CODE_NUDGE

    elif session.state == STATE_VERIFIED:
        reply, tool_calls_made = await _verified_turn(db, session, transcript)

    else:
        reply = await _faq_reply(transcript, SYSTEM_PROMPT)

    assistant_turn = {
        "role": "assistant",
        "content": reply,
        "timestamp": _utcnow_iso(),
    }
    if tool_calls_made:
        assistant_turn["tool_calls"] = tool_calls_made
    transcript.append(assistant_turn)
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
        reply = await _post_verify_reply(db, session, list(session.transcript or []))
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
