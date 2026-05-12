FROM python:3.12-slim AS base
ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    UV_LINK_MODE=copy
RUN pip install uv

WORKDIR /repo
COPY pyproject.toml ./
COPY packages/python-shared/ packages/python-shared/
COPY packages/llm-router/ packages/llm-router/
COPY apps/orchestrator/ apps/orchestrator/
RUN uv sync --package veda-orchestrator

ENV PATH="/repo/.venv/bin:${PATH}"
WORKDIR /repo/apps/orchestrator
EXPOSE 8081
CMD ["uvicorn", "orchestrator.main:app", "--host", "0.0.0.0", "--port", "8081"]
