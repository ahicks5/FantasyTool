# Edge API — deploy anywhere that runs a container (Railway, Render, Fly). Free tiers are fine.
FROM python:3.11-slim
WORKDIR /app
RUN pip install --no-cache-dir uv
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY edge ./edge
ENV PATH="/app/.venv/bin:$PATH" EDGE_CACHE_DIR=/data/cache EDGE_DB=/data/edge.db
EXPOSE 8000
CMD ["uvicorn", "edge.api.app:app", "--host", "0.0.0.0", "--port", "8000"]
