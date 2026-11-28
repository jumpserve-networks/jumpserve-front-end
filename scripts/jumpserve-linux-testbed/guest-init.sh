#!/bin/sh
set -eu

mountpoint -q /proc || mount -t proc proc /proc
mountpoint -q /sys || mount -t sysfs sysfs /sys
mount -t tmpfs -o mode=0755,nosuid,nodev,size=32m tmpfs /run
mount -t tmpfs -o mode=1777,nosuid,nodev,size=128m tmpfs /tmp
modprobe 9pnet_virtio
mount -t 9p -o trans=virtio,version=9p2000.L,ro input /input
mount -t 9p -o trans=virtio,version=9p2000.L,rw output /output

export JUMPSERVE_TESTBED_OUTPUT=/output
cd /input
status=0
/bin/sh ./run.sh > /output/stdout.log 2> /output/stderr.log || status=$?
printf '%s\n' "$status" > /output/exit-code
sync
exec busybox poweroff -f
