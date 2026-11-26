FROM node:24-bookworm-slim

ARG BATCH_UID=1000
ARG BATCH_GID=1000

RUN apt-get update \
    && apt-get install -y --no-install-recommends bubblewrap ca-certificates curl iproute2 iputils-ping poppler-utils python3 \
    && rm -rf /var/lib/apt/lists/* \
    && npm install --global --no-audit --no-fund @openai/codex@0.171.0 ws@8.22.1 \
    && (getent group "$BATCH_GID" >/dev/null || groupadd --gid "$BATCH_GID" jumpserve) \
    && usermod --uid "$BATCH_UID" --gid "$BATCH_GID" node

LABEL org.jumpserve.batch.uid=$BATCH_UID org.jumpserve.batch.gid=$BATCH_GID
USER node
