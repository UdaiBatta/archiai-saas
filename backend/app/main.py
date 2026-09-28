from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config.settings import settings
from app.database.connection import get_db
from app.services.llm_client import llm_reachable
from app.api.auth.router import router as auth_router
from app.api.billing.router import router as billing_router
from app.api.designs.router import router as designs_router
from app.api.mvp.router import router as mvp_router
from app.api.projects.router import router as projects_router
from app.api.shares.router import router as shares_router
from app.api.workspaces.router import router as workspaces_router

app = FastAPI(title="ArchiAI API", version="0.1.0")

# Reject oversize request bodies up front (Phase 0 H4), before any handler or
# body parsing runs. Sits above the 2 MB layout-JSON cap with headroom for
# framing/other fields.
MAX_REQUEST_BODY_BYTES = 3 * 1024 * 1024


@app.middleware("http")
async def limit_request_body_size(request: Request, call_next):
    content_length = request.headers.get("content-length")
    if content_length is not None:
        try:
            declared = int(content_length)
        except ValueError:
            declared = None
        if declared is not None and declared > MAX_REQUEST_BODY_BYTES:
            return JSONResponse(
                status_code=413,
                content={
                    "error": "Request body too large",
                    "code": "PAYLOAD_TOO_LARGE",
                    "status": 413,
                },
            )
    return await call_next(request)


# Security response headers (Phase 0 M2) — emitted in production, where the API
# is served over HTTPS behind the real frontend origin.
_SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
}


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    if settings.is_production:
        for header, value in _SECURITY_HEADERS.items():
            response.headers.setdefault(header, value)
    return response


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    # File exports name their download here; browsers hide it cross-origin otherwise.
    expose_headers=["Content-Disposition"],
)

STATUS_CODES = {
    400: "BAD_REQUEST",
    401: "UNAUTHORIZED",
    402: "PAYMENT_REQUIRED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    409: "CONFLICT",
    413: "PAYLOAD_TOO_LARGE",
    422: "UNPROCESSABLE_ENTITY",
    429: "TOO_MANY_REQUESTS",
    502: "BAD_GATEWAY",
    503: "SERVICE_UNAVAILABLE",
    504: "GATEWAY_TIMEOUT",
    500: "INTERNAL_SERVER_ERROR",
}


def format_validation_error(exc: RequestValidationError) -> str:
    messages = []
    for error in exc.errors():
        location = ".".join(str(part) for part in error.get("loc", []) if part != "body")
        message = str(error.get("msg", "Invalid value")).removeprefix("Value error, ")
        messages.append(f"{location}: {message}" if location else message)
    return "; ".join(messages) or "Validation error"


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": exc.detail,
            "code": STATUS_CODES.get(exc.status_code, "ERROR"),
            "status": exc.status_code,
        },
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content={
            "error": format_validation_error(exc),
            "code": "UNPROCESSABLE_ENTITY",
            "status": 422,
        },
    )


app.include_router(auth_router)
app.include_router(projects_router)
app.include_router(workspaces_router)
app.include_router(designs_router)
app.include_router(mvp_router)
app.include_router(shares_router)
app.include_router(billing_router)


@app.get("/api/health")
async def health(db: AsyncSession = Depends(get_db)):
    """Reports DB and LLM-server reachability separately (workflow Step 0.1).

    The LLM being down degrades only the extraction feature, so overall status
    stays "ok"; a DB failure is fatal, so status becomes "degraded" — Docker's
    healthcheck watches the HTTP 200 either way (boot ordering is handled by
    compose's service_healthy conditions, not by failing this endpoint).
    """
    try:
        await db.execute(text("SELECT 1"))
        db_status = "ok"
    except Exception:
        db_status = "error"
    llm_status = "ok" if await llm_reachable() else "unreachable"
    return {
        "status": "ok" if db_status == "ok" else "degraded",
        "version": "0.1.0",
        "db": db_status,
        "llm": llm_status,
    }
