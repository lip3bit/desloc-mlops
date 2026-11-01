FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PORT=8000

WORKDIR /app

RUN groupadd --system desloc && useradd --system --gid desloc --home-dir /app --no-create-home desloc

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY app ./app
RUN mkdir -p /app/logs && chown -R desloc:desloc /app/logs

USER desloc

EXPOSE 8000

CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
