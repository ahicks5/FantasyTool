# Penthouse API — deploy anywhere that runs a container (Railway, Render, Fly).
FROM python:3.11-slim
WORKDIR /app
RUN pip install --no-cache-dir uv
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY edge ./edge
ENV PATH="/app/.venv/bin:$PATH" EDGE_CACHE_DIR=/data/cache EDGE_DB=/data/edge.db

# Headless Chromium for the share card. The `playwright` package alone is not enough — it
# ships no browser, so without this every /s/{id} link unfurls with a broken image and
# GET /api/share/{id}/card.png answers 503. That card is the growth loop, so it is not
# optional. Costs roughly 400MB of image; if your host cannot spare it, point
# EDGE_CHROMIUM at a Chromium already on the box instead and drop this line.
RUN playwright install --with-deps chromium

EXPOSE 8000
CMD ["uvicorn", "edge.api.app:app", "--host", "0.0.0.0", "--port", "8000"]
