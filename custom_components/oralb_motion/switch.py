from homeassistant.components.switch import SwitchEntity

from .entity import OralBMotionEntity


async def async_setup_entry(hass, entry, async_add_entities):
    async_add_entities([LiveSwitch(entry.runtime_data)])


class LiveSwitch(OralBMotionEntity, SwitchEntity):
    _attr_name = "Live motion stream"

    def __init__(self, hub):
        super().__init__(hub, "live")

    @property
    def is_on(self):
        return self.hub.hold

    @property
    def extra_state_attributes(self):
        return {"connected": self.hub.connected, "status": self.hub.status}

    async def async_turn_on(self, **kwargs):
        self.hub.set_hold(True)

    async def async_turn_off(self, **kwargs):
        self.hub.set_hold(False)