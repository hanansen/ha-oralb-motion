from homeassistant.components.sensor import SensorEntity, SensorStateClass
from homeassistant.const import DEGREE

from .entity import OralBMotionEntity

SENSORS = (("pitch", "Pitch", lambda s: s.pitch), ("roll", "Roll", lambda s: s.roll))


async def async_setup_entry(hass, entry, async_add_entities):
    hub = entry.runtime_data
    async_add_entities(AngleSensor(hub, k, n, fn) for k, n, fn in SENSORS)


class AngleSensor(OralBMotionEntity, SensorEntity):
    _attr_native_unit_of_measurement = DEGREE
    _attr_state_class = SensorStateClass.MEASUREMENT
    _attr_suggested_display_precision = 0

    def __init__(self, hub, key, name, fn):
        super().__init__(hub, key)
        self._attr_name = name
        self._fn = fn

    @property
    def native_value(self):
        return None if self.hub.last is None else round(self._fn(self.hub.last), 1)