import json

from llm.ollama_client import chat

_INTENT_SYSTEM = (
    "You classify the LATEST user message in a shipment-support chat. "
    "Return ONLY JSON with two booleans:\n"
    '{"wants_shipment": bool, "wants_human": bool}\n'
    "wants_shipment: the user is asking about a shipment, package, delivery, "
    "order, or tracking status, or otherwise wants their shipment information.\n"
    "wants_human: the user is asking to speak to a human, agent, "
    "representative, or real person."
)

_IDENTITY_SYSTEM = (
    "Extract the customer's identity from the conversation. "
    "Return ONLY JSON with these keys: "
    '{"first_name": string|null, "last_name": string|null, '
    '"address": string|null, "phone": string|null}. '
    "Use null for any field the user has not clearly provided yet. "
    "Do not invent or guess values."
)


def _parse(raw: str) -> dict:
    text = raw.strip()
    if text.startswith("```"):
        text = text.strip("`")
        text = text.split("\n", 1)[-1] if "\n" in text else text
    try:
        parsed = json.loads(text)
        return parsed if isinstance(parsed, dict) else {}
    except (json.JSONDecodeError, ValueError):
        return {}


def _conversation(transcript: list[dict]) -> list[dict]:
    return [{"role": m["role"], "content": m["content"]} for m in transcript]


async def classify_intent(transcript: list[dict]) -> dict:
    messages = [{"role": "system", "content": _INTENT_SYSTEM}]
    messages += _conversation(transcript)
    data = _parse(await chat(messages, format="json"))
    return {
        "wants_shipment": bool(data.get("wants_shipment")),
        "wants_human": bool(data.get("wants_human")),
    }


async def extract_identity(transcript: list[dict]) -> dict:
    messages = [{"role": "system", "content": _IDENTITY_SYSTEM}]
    messages += _conversation(transcript)
    data = _parse(await chat(messages, format="json"))
    return {
        "first_name": data.get("first_name") or None,
        "last_name": data.get("last_name") or None,
        "address": data.get("address") or None,
        "phone": data.get("phone") or None,
    }
