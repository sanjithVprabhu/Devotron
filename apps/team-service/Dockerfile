FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
RUN pip install uv
WORKDIR /repo
COPY pyproject.toml ./
COPY packages/python-shared/ packages/python-shared/
COPY apps/team-service/ apps/team-service/
RUN uv sync --package veda-team-service
ENV PATH="/repo/.venv/bin:${PATH}"
WORKDIR /repo/apps/team-service
EXPOSE 8087
CMD ["uvicorn", "team_service.main:app", "--host", "0.0.0.0", "--port", "8087"]
