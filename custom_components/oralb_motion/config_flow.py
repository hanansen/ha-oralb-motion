import voluptuous as vol

from homeassistant import config_entries
from homeassistant.components.bluetooth import async_discovered_service_info
from homeassistant.const import CONF_ADDRESS

from .const import DOMAIN, ORALB_COMPANY_ID


class OralBMotionConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    VERSION = 1

    async def async_step_user(self, user_input=None):
        if user_input is not None:
            address = user_input[CONF_ADDRESS]
            await self.async_set_unique_id(address)
            self._abort_if_unique_id_configured()
            return self.async_create_entry(
                title=f"Oral-B {address[-5:]}", data={CONF_ADDRESS: address}
            )
        current = self._async_current_ids()
        devices = {
            i.address: f"{i.name} ({i.address})"
            for i in async_discovered_service_info(self.hass, connectable=True)
            if ORALB_COMPANY_ID in i.manufacturer_data and i.address not in current
        }
        if not devices:
            return self.async_abort(reason="no_devices_found")
        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema({vol.Required(CONF_ADDRESS): vol.In(devices)}),
        )