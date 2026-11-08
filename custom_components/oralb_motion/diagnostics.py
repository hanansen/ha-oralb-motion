"""Diagnostics support for Oral-B Motion integration."""
from __future__ import annotations

from typing import Any

from homeassistant.components.diagnostics import async_redact_data
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .const import DOMAIN

TO_REDACT = {"address", "unique_id", "mac"}


async def async_get_config_entry_diagnostics(
    hass: HomeAssistant, entry: ConfigEntry
) -> dict[str, Any]:
    """Return diagnostics for a config entry."""
    hub = hass.data[DOMAIN][entry.entry_id]

    diagnostics_data: dict[str, Any] = {
        "config_entry": entry.as_dict(),
        "hub_state": {
            "address": hub.address,
            "is_connected": getattr(hub, "_is_connected", False),
            "retry_attempt": getattr(hub, "_retry_attempt", 0),
        },
        "telemetry_data": None,
    }

    if hub.telemetry:
        telemetry = hub.telemetry
        diagnostics_data["telemetry_data"] = {
            "state": telemetry.state.name,
            "pressure": telemetry.pressure.name,
            "sector": telemetry.sector.name,
            "brushing_time": telemetry.brushing_time,
            "battery_level": telemetry.battery_level,
            "mode": telemetry.mode,
        }

    return async_redact_data(diagnostics_data, TO_REDACT)