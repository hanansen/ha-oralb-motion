"""Decode the ff0d motion notification (20 bytes, two readings + marker)."""
from __future__ import annotations

import math
import struct
from dataclasses import dataclass


@dataclass(frozen=True)
class MotionSample:
    ts: int  # ms, 16-bit, wraps
    gyro: tuple[int, int, int]  # raw int8, scale unknown
    accel: tuple[int, int, int]  # raw int8, ~32 == 1 g

    @property
    def pitch(self) -> float:  # provisional axis mapping
        ax, ay, az = self.accel
        return math.degrees(math.atan2(ax, math.hypot(ay, az)))

    @property
    def roll(self) -> float:  # provisional axis mapping
        _, ay, az = self.accel
        return math.degrees(math.atan2(ay, az))

    def as_dict(self) -> dict:
        return {"ts": self.ts, "gx": self.gyro[0], "gy": self.gyro[1],
                "gz": self.gyro[2], "ax": self.accel[0], "ay": self.accel[1],
                "az": self.accel[2]}


def decode_push(data: bytes) -> MotionSample | None:
    """Return the newest reading of a push (the older one is a repeat)."""
    if len(data) < 8:
        return None
    ts, gx, gy, gz, ax, ay, az = struct.unpack_from("<Hbbbbbb", data, 0)
    return MotionSample(ts, (gx, gy, gz), (ax, ay, az))