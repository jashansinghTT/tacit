# syntax=docker/dockerfile:1
# SPDX-License-Identifier: Apache-2.0
#
# tacit-vision: HaMeR, Gaze-LLE, RF-DETR and VGGT-1B served from one process on one Blackhole
# chip (tt-model kind `cohost`). Built by build.sh, which stages the context:
#   ctx/models/cohost_vision/   the app-member adapters (adapters/cohost_vision here)
#   ctx/tt-cohost/tt_kernel/    tt-model's co-host runtime (tt_kernel.cohost, feat/cohost-kind beaa4a8)
#
# All four published images are built from the same tt-metal tree (main 8b98410e730 + the
# eth-dispatch patch; every tt_metal source file identical) and the same venv. VGGT's image is
# the base: it has the most model code and every package but scipy. The other three models'
# code comes from their own images, byte for byte, so each member runs exactly the code its
# standalone package serves.
ARG BASE_IMAGE=tt-model/vggt-1b-p150:2c77d478b134
ARG HAMER_IMAGE=tt-model/hamer-p150:3076831557f0
ARG GAZE_IMAGE=tt-model/gaze-lle-p150:94a42abd6b1a
ARG RFDETR_IMAGE=tt-model/rf-detr-p150:02df248674e8

FROM ${HAMER_IMAGE} AS hamer
FROM ${GAZE_IMAGE} AS gaze
FROM ${RFDETR_IMAGE} AS rfdetr

FROM ${BASE_IMAGE}
ARG BASE_IMAGE
USER root
COPY --from=hamer --chown=1000:1000 /opt/tt-metal/hamer /opt/tt-metal/hamer
COPY --from=gaze --chown=1000:1000 /opt/tt-metal/gaze_lle /opt/tt-metal/gaze_lle
COPY --from=rfdetr --chown=1000:1000 /opt/tt-metal/rf_detr /opt/tt-metal/rf_detr
# scipy: HaMeR reads MANO_RIGHT.pkl with it (only when that file is provided); the same wheel
# HaMeR's image installed, built against the same numpy 1.26.4
COPY --from=hamer /opt/tt-venv/lib/python3.12/site-packages/scipy /opt/tt-venv/lib/python3.12/site-packages/scipy
COPY --from=hamer /opt/tt-venv/lib/python3.12/site-packages/scipy.libs /opt/tt-venv/lib/python3.12/site-packages/scipy.libs
COPY --from=hamer /opt/tt-venv/lib/python3.12/site-packages/scipy-1.17.1.dist-info /opt/tt-venv/lib/python3.12/site-packages/scipy-1.17.1.dist-info
COPY ctx/tt-cohost /opt/tt-cohost
COPY ctx/models/cohost_vision /opt/tt-metal/models/cohost_vision
RUN chmod -R a+rX /opt/tt-cohost /opt/tt-metal/models/cohost_vision \
    && /opt/tt-venv/bin/python -m compileall -q /opt/tt-cohost /opt/tt-metal/models/cohost_vision \
       /opt/tt-metal/hamer /opt/tt-metal/gaze_lle /opt/tt-metal/rf_detr

# Weights come from the mounted HF cache, pre-fetched by `tt-model serve` at pinned revisions.
ENV PYTHONPATH=/opt/tt-cohost:/opt/tt-metal HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1
LABEL org.tenstorrent.tt-model=cohost-vision \
      org.tenstorrent.tt-model.kind=cohost \
      org.tenstorrent.tt-model.base-image=${BASE_IMAGE} \
      org.tenstorrent.tt-model.repo=tacit/cohost-vision \
      org.tenstorrent.tt-model.profiles=p150 \
      org.tenstorrent.tt-model.weights=changh95/hamer-weights
USER 1000:1000
RUN test "$(command -v python)" = /opt/tt-venv/bin/python \
    && python -c "import tt_kernel.cohost.launch, models.cohost_vision.hamer, models.cohost_vision.gaze, models.cohost_vision.rfdetr, models.cohost_vision.vggt; import hamer.server.app, gaze_lle.server.app, rf_detr.server.app, models.server.app, scipy.sparse; print('imports ok')"
CMD ["python", "-m", "tt_kernel.cohost.launch"]
