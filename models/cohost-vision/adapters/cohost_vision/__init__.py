# SPDX-License-Identifier: Apache-2.0
"""Co-host adapters for the Tacit vision models: each one is a ``tt_kernel.cohost`` app member.

HaMeR, Gaze-LLE, RF-DETR and VGGT-1B each keep their own FastAPI app (the one their standalone
package serves), built on the group's shared mesh instead of a chip they open themselves.
"""
