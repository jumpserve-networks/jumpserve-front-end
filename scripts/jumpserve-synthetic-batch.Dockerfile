FROM node:24-bookworm-slim AS verifier

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

FROM debian:bookworm-slim AS guest

COPY guest-init.sh /usr/local/sbin/jumpserve-guest-init
RUN mkdir -p /etc/initramfs-tools/conf.d \
    && printf '%s\n' MODULES=list FSTYPE=ext4 RESUME=none COMPRESS=gzip > /etc/initramfs-tools/conf.d/jumpserve \
    && apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends busybox-static e2fsprogs initramfs-tools \
       iperf3 iproute2 iputils-ping kmod linux-image-amd64 python3 tcpdump util-linux \
    && rm -rf /var/lib/apt/lists/* \
    && kernel=$(find /boot -maxdepth 1 -name 'vmlinuz-*' -printf '%f\n' | sort -V | tail -1) \
    && release="${kernel#vmlinuz-}" \
    && printf '%s\n' virtio_pci virtio_blk ext4 >> /etc/initramfs-tools/modules \
    && update-initramfs -u -k "$release" \
    && mkdir /artifacts /guest-root \
    && cp "/boot/$kernel" /artifacts/vmlinuz \
    && cp "/boot/initrd.img-$release" /artifacts/initrd \
    && chmod 755 /usr/local/sbin/jumpserve-guest-init \
    && cp -a /bin /etc /lib /lib64 /root /sbin /usr /var /guest-root \
    && mkdir /guest-root/dev /guest-root/input /guest-root/output /guest-root/proc \
       /guest-root/run /guest-root/sys /guest-root/tmp \
    && chmod 1777 /guest-root/tmp \
    && mke2fs -q -t ext4 -d /guest-root /artifacts/root.ext4 896M

FROM verifier AS generator
USER root
RUN apt-get update \
    && apt-get install -y --no-install-recommends qemu-system-x86 \
    && rm -rf /var/lib/apt/lists/*
COPY --from=guest /artifacts/ /opt/jumpserve-linux-testbed/
COPY linux-testbed.py /usr/local/bin/jumpserve-linux-testbed
RUN chmod 755 /usr/local/bin/jumpserve-linux-testbed
USER node
