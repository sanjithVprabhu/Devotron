FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
RUN pip install uv
WORKDIR /repo
COPY pyproject.toml ./
COPY packages/ packages/
COPY apps/catalog-service/ apps/catalog-service/
RUN uv sync --package veda-catalog-service
ENV PATH="/repo/.venv/bin:${PATH}"
WORKDIR /repo/apps/catalog-service
EXPOSE 8085
CMD ["uvicorn", "catalog_service.main:app", "--host", "0.0.0.0", "--port", "8085"]
