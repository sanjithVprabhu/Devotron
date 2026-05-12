FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
RUN pip install uv
WORKDIR /repo
COPY pyproject.toml ./
COPY packages/python-shared/ packages/python-shared/
COPY apps/template-service/ apps/template-service/
RUN uv sync --package veda-template-service
ENV PATH="/repo/.venv/bin:${PATH}"
WORKDIR /repo/apps/template-service
EXPOSE 8088
CMD ["uvicorn", "template_service.main:app", "--host", "0.0.0.0", "--port", "8088"]
