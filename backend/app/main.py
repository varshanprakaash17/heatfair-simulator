"""HeatFair FastAPI application entry point.

Modular monolith: engine → services → API. Run locally with:

    uvicorn app.main:app --reload --port 8000
"""

from __future__ import annotations

import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import select
from starlette.exceptions import HTTPException as StarletteHTTPException

from .api import auth, dashboard, demo, health, organizations, policies, reports, scenarios, simulations, weather, workers
from .config import get_settings
from .db import SessionLocal, init_db
from .models import Organization
from .services.seed import ensure_demo_data

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("heatfair")

settings = get_settings()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    if settings.auto_seed_demo:
        with SessionLocal() as db:
            if db.execute(select(Organization)).first() is None:
                ensure_demo_data(db)
                logger.info("Seeded demo organisation, policies, scenarios and 500 synthetic workers")
    logger.info("HeatFair API ready (env=%s, db=%s)", settings.environment, "sqlite" if settings.is_sqlite else "postgres")
    yield


app = FastAPI(
    title="HeatFair API",
    description=(
        "Climate-fairness policy simulation and multi-objective optimisation API.\n\n"
        "All worker populations are synthetic. Exposure uses a heat-index estimate, "
        "not WBGT. Results are comparative estimates, not occupational-safety certification."
    ),
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_origin_regex=settings.cors_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)


@app.middleware("http")
async def add_timing_header(request: Request, call_next):
    started = time.perf_counter()
    response = await call_next(request)
    response.headers["X-Process-Time-Ms"] = f"{(time.perf_counter() - started) * 1000:.2f}"
    return response


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(_request: Request, exc: StarletteHTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail, "status": exc.status_code},
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={
            "detail": "Invalid request payload",
            "status": 422,
            "errors": [
                {"field": ".".join(str(p) for p in err.get("loc", [])), "message": err.get("msg")}
                for err in exc.errors()
            ],
        },
    )


for module in (
    auth,
    health,
    organizations,
    policies,
    scenarios,
    workers,
    simulations,
    reports,
    weather,
    dashboard,
    demo,
):
    app.include_router(module.router, prefix=settings.api_prefix)


@app.get("/", include_in_schema=False)
def root():
    return {
        "name": "HeatFair API",
        "docs": "/docs",
        "health": f"{settings.api_prefix}/health",
        "version": "1.0.0",
        "disclaimer": "Synthetic simulations only; not occupational-safety certification.",
    }
