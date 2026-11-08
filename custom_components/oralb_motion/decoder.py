"""Decoder module for Oral-B Motion telemetry with typed dataclasses and payload validation."""
import logging
from dataclasses import dataclass
from enum import IntEnum
from typing import Optional

_LOGGER = logging.getLogger(__name__)

EXPECTED_MIN_PAYLOAD_LENGTH = 6


class Sector(IntEnum):
    """Oral-B brushing sector/quadrant."""
    UNKNOWN = 0
    SECTOR_1 = 1
    SECTOR_2 = 2
    SECTOR_3 = 3
    SECTOR_4 = 4
    SECTOR_5 = 5
    SECTOR_6 = 6


class PressureState(IntEnum):
    """Oral-B pressure state."""
    NORMAL = 0
    HIGH = 1
    UNKNOWN = 99


class OperatingState(IntEnum):
    """Oral-B toothbrush operating state."""
    OFF = 0
    RUNNING = 1
    PAUSED = 2
    FLIGHT_MODE = 3
    UNKNOWN = 99


@dataclass(frozen=True)
class OralBTelemetry:
    """Dataclass holding structured and validated Oral-B telemetry data."""
    state: OperatingState
    pressure: PressureState
    sector: Sector
    brushing_time: int  # in seconds
    battery_level: Optional[int] = None
    mode: Optional[int] = None

    @property
    def is_active(self) -> bool:
        """Return true if the toothbrush is currently active."""
        return self.state == OperatingState.RUNNING


def parse_telemetry(payload: bytes) -> Optional[OralBTelemetry]:
    """
    Safely parse raw bytes from Bluetooth advertising or GATT characteristic notifications.

    Includes padding checks and error handling for malformed payloads.
    """
    if not payload:
        _LOGGER.debug("Received empty payload")
        return None

    # Handle short or unexpected byte lengths safely via padding guard
    if len(payload) < EXPECTED_MIN_PAYLOAD_LENGTH:
        _LOGGER.warning(
            "Malformed payload: expected at least %d bytes, got %d (%s)",
            EXPECTED_MIN_PAYLOAD_LENGTH,
            len(payload),
            payload.hex(),
        )
        return None

    try:
        raw_state = payload[0]
        raw_pressure = payload[1]
        raw_sector = payload[2]
        brushing_time = int.from_bytes(payload[3:5], byteorder="big", signed=False)
        battery_level = payload[5] if len(payload) > 5 else None
        mode = payload[6] if len(payload) > 6 else None

        state = (
            OperatingState(raw_state)
            if raw_state in OperatingState._value2member_map_
            else OperatingState.UNKNOWN
        )
        pressure = (
            PressureState(raw_pressure)
            if raw_pressure in PressureState._value2member_map_
            else PressureState.UNKNOWN
        )
        sector = (
            Sector(raw_sector)
            if raw_sector in Sector._value2member_map_
            else Sector.UNKNOWN
        )

        # Sanity validation on parsed bounds
        if battery_level is not None and not (0 <= battery_level <= 100):
            battery_level = None

        return OralBTelemetry(
            state=state,
            pressure=pressure,
            sector=sector,
            brushing_time=max(0, brushing_time),
            battery_level=battery_level,
            mode=mode,
        )
    except (IndexError, ValueError, TypeError) as err:
        _LOGGER.error("Failed to decode Oral-B payload (raw: %s): %s", payload.hex(), err)
        return None