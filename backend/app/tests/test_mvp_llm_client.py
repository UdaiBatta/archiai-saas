"""MVP workflow Phase 2.1 — structured-client tests (local + hosted providers)."""

import asyncio
import json

import httpx
import pytest

from app.services import llm_client


def _use_transport(monkeypatch, handler) -> None:
    transport = httpx.MockTransport(handler)

    def factory(*args, **kwargs):
        return httpx.AsyncClient(*args, transport=transport, **kwargs)

    monkeypatch.setattr(llm_client, "_client_factory", factory, raising=False)
    monkeypatch.setattr(llm_client.settings, "LLM_BASE_URL", "http://lm.test/v1")
    monkeypatch.setattr(llm_client.settings, "LLM_MODEL", "")
    monkeypatch.setattr(llm_client.settings, "LLM_API_KEY", "")


def _models_response() -> httpx.Response:
    return httpx.Response(200, json={"data": [{"id": "qwen-test-model"}]})


async def test_chat_structured_uses_loaded_model_and_json_schema(monkeypatch):
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if request.url.path == "/v1/models":
            return _models_response()
        payload = json.loads(request.content)
        assert payload["model"] == "qwen-test-model"
        assert payload["temperature"] == 0
        assert payload["reasoning_effort"] == "none"
        assert payload["max_tokens"] == 1024
        assert payload["response_format"] == {
            "type": "json_schema",
            "json_schema": {
                "name": "requirements",
                "schema": {"type": "object"},
                "strict": True,
            },
        }
        assert payload["messages"] == [
            {"role": "system", "content": "extract only"},
            {"role": "user", "content": "two bedrooms"},
        ]
        return httpx.Response(
            200,
            json={
                "choices": [
                    {"message": {"content": json.dumps({"rooms": []})}}
                ]
            },
        )

    _use_transport(monkeypatch, handler)
    result = await llm_client.chat_structured(
        "extract only", "two bedrooms", {"type": "object"}
    )

    assert result == {"rooms": []}
    assert [request.url.path for request in requests] == [
        "/v1/models",
        "/v1/chat/completions",
    ]


async def test_chat_structured_maps_timeout_to_typed_error(monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/v1/models":
            return _models_response()
        raise httpx.ReadTimeout("model was too slow", request=request)

    _use_transport(monkeypatch, handler)

    with pytest.raises(llm_client.LLMTimeout):
        await llm_client.chat_structured("system", "user", {"type": "object"})


async def test_chat_structured_maps_connection_failure_to_unavailable(monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("LM Studio is closed", request=request)

    _use_transport(monkeypatch, handler)

    with pytest.raises(llm_client.LLMUnavailable):
        await llm_client.chat_structured("system", "user", {"type": "object"})


async def test_chat_structured_rejects_malformed_model_json(monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/v1/models":
            return _models_response()
        return httpx.Response(
            200,
            json={"choices": [{"message": {"content": "not valid json"}}]},
        )

    _use_transport(monkeypatch, handler)

    with pytest.raises(llm_client.LLMInvalidOutput):
        await llm_client.chat_structured("system", "user", {"type": "object"})


async def test_chat_structured_serializes_concurrent_gpu_requests(monkeypatch):
    active = 0
    max_active = 0

    async def handler(request: httpx.Request) -> httpx.Response:
        nonlocal active, max_active
        if request.url.path == "/v1/models":
            return _models_response()
        active += 1
        max_active = max(max_active, active)
        await asyncio.sleep(0.01)
        active -= 1
        return httpx.Response(
            200,
            json={"choices": [{"message": {"content": "{}"}}]},
        )

    _use_transport(monkeypatch, handler)

    await asyncio.gather(
        llm_client.chat_structured("system", "first", {"type": "object"}),
        llm_client.chat_structured("system", "second", {"type": "object"}),
    )

    assert max_active == 1


async def test_local_mode_sends_no_auth_header(monkeypatch):
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if request.url.path == "/v1/models":
            return _models_response()
        return httpx.Response(
            200, json={"choices": [{"message": {"content": "{}"}}]}
        )

    _use_transport(monkeypatch, handler)

    await llm_client.chat_structured("system", "user", {"type": "object"})

    for request in requests:
        assert "authorization" not in request.headers


async def test_hosted_mode_sends_bearer_token_and_drops_reasoning_effort(monkeypatch):
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if request.url.path == "/v1/models":
            return _models_response()
        return httpx.Response(
            200, json={"choices": [{"message": {"content": "{}"}}]}
        )

    _use_transport(monkeypatch, handler)
    monkeypatch.setattr(llm_client.settings, "LLM_API_KEY", "test-key-123")

    await llm_client.chat_structured("system", "user", {"type": "object"})

    completions = [r for r in requests if r.url.path == "/v1/chat/completions"]
    assert len(completions) == 1
    assert completions[0].headers["authorization"] == "Bearer test-key-123"
    payload = json.loads(completions[0].content)
    # hosted APIs reject the LM-Studio-specific reasoning knob
    assert "reasoning_effort" not in payload
    assert payload["response_format"]["type"] == "json_schema"
    # hosted mode without an explicit model still discovers from /models
    assert [r.url.path for r in requests] == ["/v1/models", "/v1/chat/completions"]


async def test_hosted_mode_with_explicit_model_skips_discovery(monkeypatch):
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(
            200, json={"choices": [{"message": {"content": "{}"}}]}
        )

    _use_transport(monkeypatch, handler)
    monkeypatch.setattr(llm_client.settings, "LLM_API_KEY", "test-key")
    monkeypatch.setattr(llm_client.settings, "LLM_MODEL", "amazon.nova-micro-v1:0")

    result = await llm_client.chat_structured("system", "user", {"type": "object"})

    assert result == {}
    # hosted + explicit model: no /models round-trip at all
    assert [r.url.path for r in requests] == ["/v1/chat/completions"]
    payload = json.loads(requests[0].content)
    assert payload["model"] == "amazon.nova-micro-v1:0"
    assert requests[0].headers["authorization"] == "Bearer test-key"


async def test_hosted_mode_allows_concurrent_requests(monkeypatch):
    active = 0
    max_active = 0

    async def handler(request: httpx.Request) -> httpx.Response:
        nonlocal active, max_active
        active += 1
        max_active = max(max_active, active)
        await asyncio.sleep(0.01)
        active -= 1
        return httpx.Response(
            200, json={"choices": [{"message": {"content": "{}"}}]}
        )

    _use_transport(monkeypatch, handler)
    monkeypatch.setattr(llm_client.settings, "LLM_API_KEY", "test-key")
    monkeypatch.setattr(llm_client.settings, "LLM_MODEL", "test-model")

    await asyncio.gather(
        llm_client.chat_structured("system", "first", {"type": "object"}),
        llm_client.chat_structured("system", "second", {"type": "object"}),
    )

    # no local GPU to protect: the hosted semaphore admits concurrent calls
    assert max_active == 2
