# Receipt verifier (FastAPI + Chromium/Selenium).
#
# Debian codename is pinned (-bookworm) so the base OS does not silently change
# under us when the floating `slim` tag is re-pointed at a new release, and the
# digest pins the exact multi-arch image for reproducible builds.
# Update deliberately: docker buildx imagetools inspect python:3.12-slim-bookworm
FROM python:3.12-slim-bookworm@sha256:e697c81897302a4c4333bade000d98038fbb21eb064f8ee1fd42d02ebcd9d337

# Chromium is genuinely required: ethiobank_receipts/extractors/boa.py drives
# it through Selenium to read Bank of Abyssinia receipts. chromium-driver is
# found on PATH, and the extractor passes --disable-dev-shm-usage, so the
# default 64 MB /dev/shm is sufficient.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        chromium \
        chromium-driver \
        fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

ENV CHROME_BIN=/usr/bin/chromium \
    CHROMEDRIVER_PATH=/usr/bin/chromedriver \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

# Dependencies first so the layer is cached independently of source edits.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Run as an unprivileged user. The image previously ran as root; this service
# parses untrusted receipts and drives a browser, so it is the least trusted
# component in the stack. The Chromium flags include --no-sandbox, which works
# with a non-root user and avoids the need for extra capabilities.
RUN useradd --create-home --shell /usr/sbin/nologin --uid 10001 app

# Application source only — tests, caches and logs are excluded via
# .dockerignore.
COPY --chown=app:app . .

USER app
ENV HOME=/home/app

EXPOSE 8000

# Binds 0.0.0.0 so the API container can reach it on the compose network. The
# port is never published to the host (see docker-compose.prod.yml), so this is
# not public exposure.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
