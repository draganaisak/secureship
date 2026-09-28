import os
import re

import httpx

OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen3:8b")

_THINK_RE = re.compile(r"<think>.*?</think>", re.DOTALL)


async def chat(messages: list[dict], format: str | None = None) -> str:
    payload = {
        "model": OLLAMA_MODEL,
        "messages": messages,
        "stream": False,
        "think": False,
    }
    if format is not None:
        payload["format"] = format
    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(f"{OLLAMA_HOST}/api/chat", json=payload)
        resp.raise_for_status()
        data = resp.json()
    content = data["message"]["content"]
    return _THINK_RE.sub("", content).strip()
