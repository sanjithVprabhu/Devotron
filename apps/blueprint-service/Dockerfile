FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
RUN pip install uv
WORKDIR /repo
COPY pyproject.toml ./
COPY packages/python-shared/ packages/python-shared/
COPY apps/blueprint-service/ apps/blueprint-service/
RUN uv sync --package veda-blueprint-service
ENV PATH="/repo/.venv/bin:${PATH}"
WORKDIR /repo/apps/blueprint-service
EXPOSE 8084
CMD ["uvicorn", "blueprint_service.main:app", "--host", "0.0.0.0", "--port", "8084"]
