"""Oral-B Motion: live IMU stream from Oral-B iO brushes."""
from __future__ import annotations

from pathlib import Path

import voluptuous as vol

from homeassistant.components import frontend, panel_custom, websocket_api
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry, ConfigEntryState
from homeassistant.const import CONF_ADDRESS, Platform
from homeassistant.core import HomeAssistant, callback

from .const import DOMAIN, PANEL_URL, STATIC_URL
from .hub import OralBMotionHub

PLATFORMS = [Platform.SENSOR, Platform.SWITCH]
CARD_URL = f"{STATIC_URL}/oralb-motion-card.js"  # NEW


@websocket_api.websocket_command(
    {vol.Required("type"): "oralb_motion/subscribe", vol.Optional("entry_id"): str}
)
@websocket_api.async_response
async def ws_subscribe(hass, connection, msg):
    entries = [
        e for e in hass.config_entries.async_entries(DOMAIN)
        if e.state is ConfigEntryState.LOADED
        and msg.get("entry_id", e.entry_id) == e.entry_id
    ]
    if not entries:
        connection.send_error(msg["id"], "not_found", "No Oral-B Motion brush set up")
        return
    hub = entries[0].runtime_data

    @callback
    def forward(data):
        connection.send_message(websocket_api.event_message(msg["id"], data))

    connection.subscriptions[msg["id"]] = hub.subscribe(forward)
    connection.send_result(msg["id"])
    forward({"status": hub.status})


async def _ensure_frontend(hass: HomeAssistant) -> None:
    st = hass.data.setdefault(f"{DOMAIN}_state", {})
    if not st.get("ws"):
        websocket_api.async_register_command(hass, ws_subscribe)
        st["ws"] = True
    if not st.get("static"):
        await hass.http.async_register_static_paths(
            [StaticPathConfig(STATIC_URL, str(Path(__file__).parent / "frontend"), False)]
        )
        st["static"] = True
    if not st.get("card"):  # NEW
        frontend.add_extra_js_url(hass, CARD_URL)  # NEW
        st["card"] = True  # NEW
    if not st.get("panel"):
        await panel_custom.async_register_panel(
            hass,
            webcomponent_name="oralb-motion-panel",
            frontend_url_path=PANEL_URL,
            module_url=f"{STATIC_URL}/oralb-motion-panel.js",
            sidebar_title="Oral-B Motion",
            sidebar_icon="mdi:tooth-outline",
            require_admin=False,
        )
        st["panel"] = True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    entry.runtime_data = OralBMotionHub(hass, entry.data[CONF_ADDRESS], entry.title)
    await _ensure_frontend(hass)
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if ok:
        await entry.runtime_data.async_stop()
        others = [
            e for e in hass.config_entries.async_entries(DOMAIN)
            if e.entry_id != entry.entry_id and e.state is ConfigEntryState.LOADED
        ]
        if not others:
            frontend.async_remove_panel(hass, PANEL_URL)
            st = hass.data[f"{DOMAIN}_state"]
            st["panel"] = False
            if st.get("card"):  # NEW
                frontend.remove_extra_js_url(hass, CARD_URL)  # NEW
                st["card"] = False  # NEW
    return ok