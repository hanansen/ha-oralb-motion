from homeassistant.helpers.device_registry import CONNECTION_BLUETOOTH, DeviceInfo
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.entity import Entity

from .hub import OralBMotionHub


class OralBMotionEntity(Entity):
    _attr_has_entity_name = True
    _attr_should_poll = False

    def __init__(self, hub: OralBMotionHub, key: str) -> None:
        self.hub = hub
        self._attr_unique_id = f"{hub.address}_{key}"
        # same Bluetooth connection as the core Oral-B integration -> same device
        self._attr_device_info = DeviceInfo(
            connections={(CONNECTION_BLUETOOTH, hub.address)}, name=hub.name
        )

    async def async_added_to_hass(self) -> None:
        self.async_on_remove(
            async_dispatcher_connect(
                self.hass, self.hub.signal, self.async_write_ha_state
            )
        )