import socket

from pydantic import model_validator
from pydantic_settings import BaseSettings

# Placeholder/obviously-weak secrets that must never run in production.
_WEAK_SECRET_KEYS = {
    "replace-with-a-long-random-secret",
    "change-me",
    "changeme",
    "secret",
    "your-secret-key",
    "dev",
    "development",
    "test",
    "",
}
_MIN_SECRET_KEY_LENGTH = 32


def _host_resolves(hostname: str) -> bool:
    try:
        socket.getaddrinfo(hostname, None)
    except socket.gaierror:
        return False
    return True


class Settings(BaseSettings):
    DATABASE_URL: str
    SECRET_KEY: str

    # Deployment environment: "development" (default) or "production". Controls
    # the SECRET_KEY strength gate and whether security headers are emitted.
    ENV: str = "development"

    # Comma-separated list of allowed CORS origins. Never use "*" together with
    # credentials.
    ALLOWED_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173"

    # OpenAI-compatible server for the MVP extraction pipeline. Local default:
    # LM Studio on the host machine (from inside Docker, compose overrides this
    # with http://host.docker.internal:1234/v1 — enable "Serve on Local
    # Network" in LM Studio or the container cannot reach it).
    LLM_BASE_URL: str = "http://localhost:1234/v1"
    LLM_TIMEOUT_S: float = 60.0
    # Optional override. Empty = read the exact identifier of whatever model the
    # server has loaded from GET /v1/models (a mismatched hard-coded name errors).
    # Set it when using a hosted provider (see .env.example presets).
    LLM_MODEL: str = ""
    # Optional bearer API key for a HOSTED provider (AWS Bedrock's
    # OpenAI-compatible endpoint, Groq, Gemini, OpenRouter). Empty = local
    # mode: no auth header, strict /models discovery, GPU-serialized calls.
    # Never commit a real key.
    LLM_API_KEY: str = ""
    # reasoning_effort sent with extraction calls. Empty = "none" for a local
    # model and omitted for a hosted one (some hosted APIs reject the field).
    # Set it for a hosted thinking model that accepts it: Gemini 3.x needs
    # "none", or its hidden reasoning eats the output budget and the JSON is
    # cut off mid-object.
    LLM_REASONING_EFFORT: str = ""

    # Razorpay (Phase 3). All optional so dev/tests run without them; order
    # creation is disabled and the webhook rejects everything until set.
    RAZORPAY_KEY_ID: str = ""
    RAZORPAY_KEY_SECRET: str = ""
    RAZORPAY_WEBHOOK_SECRET: str = ""

    model_config = {"env_file": ".env", "extra": "ignore"}

    @property
    def razorpay_configured(self) -> bool:
        return bool(self.RAZORPAY_KEY_ID and self.RAZORPAY_KEY_SECRET)

    @property
    def is_production(self) -> bool:
        return self.ENV.strip().lower() == "production"

    @property
    def allowed_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.ALLOWED_ORIGINS.split(",") if origin.strip()]

    @model_validator(mode="after")
    def normalize_local_database_url(self) -> "Settings":
        if "@db:" in self.DATABASE_URL and not _host_resolves("db"):
            self.DATABASE_URL = self.DATABASE_URL.replace("@db:", "@localhost:", 1)
        return self

    @model_validator(mode="after")
    def enforce_production_hardening(self) -> "Settings":
        if self.is_production:
            secret = self.SECRET_KEY.strip()
            if secret.lower() in _WEAK_SECRET_KEYS or len(secret) < _MIN_SECRET_KEY_LENGTH:
                raise ValueError(
                    "SECRET_KEY is weak or a placeholder; set a strong random value "
                    f"(>= {_MIN_SECRET_KEY_LENGTH} chars) before running in production."
                )
            if "*" in self.allowed_origins_list:
                raise ValueError("ALLOWED_ORIGINS must not contain '*' in production.")
        return self


settings = Settings()
