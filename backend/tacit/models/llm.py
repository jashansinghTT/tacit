"""gpt-oss-20b on chip 2 through its OpenAI-compatible API: chat, streaming, and JSON answers.

Greedy decoding (temperature 0) runs about 85 tokens/s on the fused decode path; any sampling
temperature falls back to host sampling at about 15-19 tokens/s, so every call here is greedy.
"""
from __future__ import annotations

import json
import re
import time
from typing import AsyncIterator

import httpx

from .base import ModelUnavailable, client, served, stats
from ..config import endpoints, llm_model_id


def _body(messages: list[dict], max_tokens: int, temperature: float, effort: str, stream: bool) -> dict:
    return {"model": llm_model_id(), "messages": messages, "max_tokens": max_tokens, "temperature": temperature,
            "reasoning_effort": effort, "stream": stream}


async def chat(messages: list[dict], max_tokens: int = 600, temperature: float = 0.0, effort: str = "low",
               timeout: float = 120) -> tuple[str, dict]:
    ep = endpoints()["llm"]
    st = stats("llm")
    t0 = time.perf_counter()
    try:
        r = await client().post(ep.url + "/v1/chat/completions", json=_body(messages, max_tokens, temperature, effort, False),
                                timeout=timeout)
        r.raise_for_status()
    except httpx.HTTPError as e:
        st.errors += 1
        st.last_error = str(e)
        raise ModelUnavailable(ep, str(e)) from e
    ms = (time.perf_counter() - t0) * 1000
    st.calls += 1
    st.latencies.append(ms)
    msg = r.json()["choices"][0]["message"]
    return (msg.get("content") or "").strip(), served(ep, ms)


async def chat_stream(messages: list[dict], max_tokens: int = 500, temperature: float = 0.0,
                      effort: str = "low") -> AsyncIterator[str]:
    """Yield answer text deltas (reasoning tokens are dropped)."""
    ep = endpoints()["llm"]
    st = stats("llm")
    t0 = time.perf_counter()
    try:
        async with client().stream("POST", ep.url + "/v1/chat/completions",
                                   json=_body(messages, max_tokens, temperature, effort, True), timeout=120) as r:
            r.raise_for_status()
            async for line in r.aiter_lines():
                if not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                if data == "[DONE]":
                    break
                try:
                    delta = json.loads(data)["choices"][0].get("delta", {})
                except (json.JSONDecodeError, KeyError, IndexError):
                    continue
                if delta.get("content"):
                    yield delta["content"]
    except httpx.HTTPError as e:
        st.errors += 1
        st.last_error = str(e)
        raise ModelUnavailable(ep, str(e)) from e
    st.calls += 1
    st.latencies.append((time.perf_counter() - t0) * 1000)


def extract_json(text: str):
    """The first JSON object or array in a model answer (tolerates code fences and prose)."""
    fenced = re.search(r"```(?:json)?\s*(.+?)```", text, re.S)
    if fenced:
        text = fenced.group(1)
    starts = [i for i in (text.find("{"), text.find("[")) if i >= 0]
    if not starts:
        raise ValueError("no JSON in answer")
    start = min(starts)
    opener = text[start]
    closer = "}" if opener == "{" else "]"
    depth, in_str, esc = 0, False, False
    for i in range(start, len(text)):
        ch = text[i]
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
        elif ch == opener:
            depth += 1
        elif ch == closer:
            depth -= 1
            if depth == 0:
                return json.loads(text[start:i + 1])
    raise ValueError("unterminated JSON in answer")


async def chat_json(messages: list[dict], max_tokens: int = 1500, attempts: int = 2, effort: str = "low"):
    """Ask for JSON and parse it, retrying once with the parse error fed back."""
    last_err = None
    sb = None
    for _ in range(attempts):
        text, sb = await chat(messages, max_tokens=max_tokens, temperature=0.0, effort=effort)
        try:
            return extract_json(text), sb
        except (ValueError, json.JSONDecodeError) as e:
            last_err = e
            messages = messages + [{"role": "assistant", "content": text},
                                   {"role": "user", "content": f"That was not valid JSON ({e}). Reply with only the JSON."}]
    raise ValueError(f"model did not return JSON: {last_err}")
