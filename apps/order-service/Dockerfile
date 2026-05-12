FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
RUN pip install uv
WORKDIR /repo
COPY pyproject.toml ./
COPY packages/python-shared/ packages/python-shared/
COPY apps/order-service/ apps/order-service/
RUN uv sync --package veda-order-service
ENV PATH="/repo/.venv/bin:${PATH}"
WORKDIR /repo/apps/order-service
EXPOSE 8086
CMD ["uvicorn", "order_service.main:app", "--host", "0.0.0.0", "--port", "8086"]
