FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
RUN pip install uv
WORKDIR /repo
COPY pyproject.toml ./
COPY packages/ packages/
COPY capabilities/integration/ capabilities/integration/
COPY apps/integration-hub/ apps/integration-hub/
RUN uv sync --package veda-integration-hub
ENV PATH="/repo/.venv/bin:${PATH}"
WORKDIR /repo/apps/integration-hub
EXPOSE 8089
CMD ["uvicorn", "integration_hub.main:app", "--host", "0.0.0.0", "--port", "8089"]
