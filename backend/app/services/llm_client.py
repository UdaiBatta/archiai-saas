"""Provider-agnostic OpenAI-compatible LLM client.

``chat_structured`` is the only model-call boundary for MVP extraction.
Callers receive typed operational errors rather than raw httpx failures.

Two operating modes, chosen by whether ``settings.LLM_API_KEY`` is set:

- **Local** (default, no key): an LM Studio-style local OpenAI-compatible
  server (``LLM_BASE_URL``, default ``http://localhost:1234/v1``). Calls are
  serialized (Semaphore(1)) to protect the single local GPU, the exact model
  id is discovered from ``/models`` before every completion, and the
  LM-Studio-specific ``reasoning_effort: "none"`` is sent so reasoning models
  do not burn the latency budget before emitting JSON content.

- **Hosted** (key set): any hosted OpenAI-compatible endpoint — AWS Bedrock's
  OpenAI-compatible ``bedrock-runtime`` URL, Groq, Gemini's OpenAI
  compatibility layer, or OpenRouter. Requests carry a bearer token, the
  LM-Studio-specific knob is omitted (hosted APIs reject it), concurrency is
  relaxed (Semaphore(4) — no single GPU to protect), and an explicitly
  configured ``LLM_MODEL`` skips ``/models`` discovery entirely, since hosted
  catalogs do not necessarily advertise the same ids a local server lists.

In local mode LM Studio runs on the HOST (desktop app, direct GPU access),
not in Docker; from inside the backend container it is reached via
``http://host.docker.internal:1234/v1`` (compose default) with "Serve on
Local Network" enabled.
"""
import asyncio
import json
from collections.abc import Callable
from typing import Any

import httpx

from app.config.settings import settings


class LLMError(RuntimeError):
    """Base class for expected AI-provider service failures."""


class LLMTimeout(LLMError):
    """The provider accepted the connection but did not answer in time."""


class LLMUnavailable(LLMError):
    """The provider is down, has no model available, or rejected the request."""


class LLMInvalidOutput(LLMError):
    """The provider answered, but not with the requested JSON object."""


# Local mode serializes model inference behind one process-wide queue to
# protect the single local GPU. Hosted mode has no such constraint.
_local_semaphore = asyncio.Semaphore(1)
_hosted_semaphore = asyncio.Semaphore(4)

# Private seam used by unit tests to install httpx.MockTransport without adding
# another dependency such as respx.
_client_factory: Callable[..., httpx.AsyncClient] = httpx.AsyncClient

_MAX_STRUCTURED_OUTPUT_TOKENS = 2048


def _is_hosted() -> bool:
    """True when a hosted provider API key is configured."""
    return bool(settings.LLM_API_KEY.strip())


def _auth_headers() -> dict[str, str]:
    key = settings.LLM_API_KEY.strip()
    if not key:
        return {}
    return {"Authorization": f"Bearer {key}"}


def _semaphore() -> asyncio.Semaphore:
    return _hosted_semaphore if _is_hosted() else _local_semaphore


def _raise_for_status(response: httpx.Response, operation: str) -> None:
    try:
        response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        raise LLMUnavailable(
            f"AI provider {operation} failed with HTTP {response.status_code}."
        ) from exc


async def _loaded_model_id(client: httpx.AsyncClient) -> str:
    """Return the model id to send, discovering it from ``/models`` when needed.

    Hosted mode with an explicit ``LLM_MODEL`` skips discovery — hosted model
    catalogs differ from a local server's advertisement. Local mode keeps the
    strict behavior: the configured id must exactly match a loaded model, and
    an empty ``LLM_MODEL`` reads whatever the server has loaded.
    """
    configured = settings.LLM_MODEL.strip()
    if _is_hosted() and configured:
        return configured

    response = await client.get(
        f"{settings.LLM_BASE_URL.rstrip('/')}/models", headers=_auth_headers()
    )
    _raise_for_status(response, "model discovery")
    try:
        payload = response.json()
        model_ids = [
            item["id"]
            for item in payload["data"]
            if isinstance(item, dict) and isinstance(item.get("id"), str)
        ]
    except (KeyError, TypeError, ValueError) as exc:
        raise LLMInvalidOutput(
            "AI provider /models returned an invalid response envelope."
        ) from exc

    if not model_ids:
        raise LLMUnavailable("The AI provider is reachable, but lists no models.")

    if configured:
        if configured not in model_ids:
            raise LLMUnavailable(
                f"Configured LLM_MODEL '{configured}' is not available at the "
                "configured provider."
            )
        return configured
    return model_ids[0]


def _parse_completion(response: httpx.Response) -> dict[str, Any]:
    _raise_for_status(response, "structured completion")
    try:
        content = response.json()["choices"][0]["message"]["content"]
    except (IndexError, KeyError, TypeError, ValueError) as exc:
        raise LLMInvalidOutput(
            "AI provider returned an invalid chat-completion envelope."
        ) from exc

    if not isinstance(content, str):
        raise LLMInvalidOutput("AI completion content was not a JSON string.")
    try:
        result = json.loads(content)
    except json.JSONDecodeError as exc:
        raise LLMInvalidOutput("AI completion was not valid JSON.") from exc
    if not isinstance(result, dict):
        raise LLMInvalidOutput("AI completion must be a JSON object.")
    return result


async def chat_structured(
    system: str,
    user: str,
    schema: dict[str, Any],
    timeout_s: float = settings.LLM_TIMEOUT_S,
) -> dict[str, Any]:
    """Call the configured provider with strict JSON-schema output."""
    body: dict[str, Any] = {
        "temperature": 0,
        "max_tokens": _MAX_STRUCTURED_OUTPUT_TOKENS,
        "response_format": {
            "type": "json_schema",
            "json_schema": {
                "name": "requirements",
                "schema": schema,
                "strict": True,
            },
        },
    }
    # Extraction is schema filling, not a reasoning task: thinking models
    # otherwise spend the budget on hidden reasoning before any JSON. Local
    # servers take "none"; hosted ones only when configured (some reject it).
    effort = settings.LLM_REASONING_EFFORT or ("" if _is_hosted() else "none")
    if effort:
        body["reasoning_effort"] = effort

    async with _semaphore():
        try:
            async with _client_factory(timeout=timeout_s) as client:
                body["model"] = await _loaded_model_id(client)
                body["messages"] = [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ]
                response = await client.post(
                    f"{settings.LLM_BASE_URL.rstrip('/')}/chat/completions",
                    json=body,
                    headers=_auth_headers(),
                )
        except LLMError:
            raise
        except httpx.TimeoutException as exc:
            raise LLMTimeout(
                f"The AI provider did not respond within {timeout_s:g} seconds."
            ) from exc
        except httpx.RequestError as exc:
            raise LLMUnavailable(
                "The AI provider is unreachable. Check LLM_BASE_URL and "
                "credentials."
            ) from exc

        return _parse_completion(response)


async def llm_reachable(timeout_s: float = 2.0) -> bool:
    """True if the configured provider answers GET /models. Never raises."""
    try:
        async with httpx.AsyncClient(timeout=timeout_s) as client:
            response = await client.get(
                f"{settings.LLM_BASE_URL.rstrip('/')}/models",
                headers=_auth_headers(),
            )
        return response.status_code == 200
    except Exception:
        return False
