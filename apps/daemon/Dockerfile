FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1
RUN pip install uv
WORKDIR /repo
COPY pyproject.toml ./
COPY packages/ packages/
COPY capabilities/ capabilities/
COPY apps/daemon/ apps/daemon/
RUN uv sync --package veda-daemon
ENV PATH="/repo/.venv/bin:${PATH}"
WORKDIR /repo/apps/daemon
EXPOSE 8082
CMD ["uvicorn", "daemon.main:app", "--host", "0.0.0.0", "--port", "8082"]
