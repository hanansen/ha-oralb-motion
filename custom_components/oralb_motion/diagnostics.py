"""Diagnostics for Oral-B Motion."""
from __future__ import annotations

from typing import Any

from homeassistant.components.diagnostics import async_redact_data
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

TO_REDACT = {"address", "unique_id", "title"}


async def async_get_config_entry_diagnostics(
    hass: HomeAssistant, entry: ConfigEntry
) -> dict[str, Any]:
    hub = entry.runtime_data
    last = hub.last
    data = {
        "config_entry": entry.as_dict(),
        "hub": {
            "address": hub.address,
            "status": hub.status.replace(hub.address, "**REDACTED**"),
            "connected": hub.connected,
            "live_switch": hub.hold,
        },
        "last_sample": last.as_dict() if last else None,
    }
    return async_redact_data(data, TO_REDACT)