import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.config.settings import Settings, settings
from app.database.connection import Base, get_db
from app.main import app
from app.utils.rate_limit import rate_limiter

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

test_engine = create_async_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestSessionLocal = async_sessionmaker(test_engine, expire_on_commit=False)


_LLM_FIELDS = ("LLM_BASE_URL", "LLM_TIMEOUT_S", "LLM_MODEL", "LLM_API_KEY", "LLM_REASONING_EFFORT")


@pytest.fixture(autouse=True)
def default_llm_settings(monkeypatch):
    """A developer's backend/.env (e.g. a Gemini key) must not change test
    behaviour: every test starts from the code defaults for the LLM client."""
    for name in _LLM_FIELDS:
        monkeypatch.setattr(settings, name, Settings.model_fields[name].default)


@pytest_asyncio.fixture(autouse=True)
async def setup_db():
    # Each test starts with a clean rate-limiter so cumulative API calls across
    # tests don't spuriously trip the limits (the state is process-global).
    rate_limiter.reset()
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


async def override_get_db():
    async with TestSessionLocal() as session:
        yield session


@pytest_asyncio.fixture
async def client():
    app.dependency_overrides[get_db] = override_get_db
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as c:
        yield c
    app.dependency_overrides.clear()


# A small brief the canonical engine always fits; used by tests that need a
# saved design as setup rather than testing generation itself.
GENERATE_SPEC = {
    "building_type": "apartment",
    "floors": 1,
    "rooms": [
        {"type": "bedroom", "count": 2},
        {"type": "kitchen", "count": 1},
        {"type": "living_room", "count": 1},
        {"type": "bathroom", "count": 1},
    ],
    "plot": {"width_m": 10, "depth_m": 12},
    "facing": "east",
}


async def generate_design(client: AsyncClient, headers: dict, project_id: str | None = None):
    """POST /api/generate; with a project, return its saved canvas layout
    (GET .../latest), which carries designId/designVersionId and rooms."""
    response = await client.post(
        "/api/generate",
        json={"requirements": GENERATE_SPEC, "useDefaults": True, "projectId": project_id},
        headers=headers,
    )
    if project_id is None or response.status_code != 200:
        return response
    return await client.get(f"/api/design/project/{project_id}/latest", headers=headers)
