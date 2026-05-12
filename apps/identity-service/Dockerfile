FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
RUN pip install uv
WORKDIR /repo
COPY pyproject.toml ./
COPY packages/python-shared/ packages/python-shared/
COPY apps/identity-service/ apps/identity-service/
RUN uv sync --package veda-identity-service
ENV PATH="/repo/.venv/bin:${PATH}"
WORKDIR /repo/apps/identity-service
EXPOSE 8083
CMD ["uvicorn", "identity_service.main:app", "--host", "0.0.0.0", "--port", "8083"]
