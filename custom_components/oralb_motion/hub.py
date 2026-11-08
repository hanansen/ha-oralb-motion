"""Hub module managing Bluetooth connectivity with backoff and retry logic."""
import asyncio
import logging
from typing import Callable, Optional

from homeassistant.components.bluetooth import (
    BluetoothServiceInfoBleak,
    async_register_callback,
    async_track_unavailable,
)
from homeassistant.core import CALLBACK_TYPE, HomeAssistant, callback

from .decoder import OralBTelemetry, parse_telemetry

_LOGGER = logging.getLogger(__name__)

INITIAL_BACKOFF_SECONDS = 2
MAX_BACKOFF_SECONDS = 120
BACKOFF_FACTOR = 2.0


class OralBToothbrushHub:
    """Manages connection, reconnection, exponential backoff, and data dispatching."""

    def __init__(self, hass: HomeAssistant, address: str) -> None:
        """Initialize the hub."""
        self.hass = hass
        self._address = address.upper()
        self._telemetry: Optional[OralBTelemetry] = None
        self._subscribers: list[Callable[[OralBTelemetry], None]] = []

        self._unsubscribe_bt: Optional[CALLBACK_TYPE] = None
        self._unsubscribe_unavailable: Optional[CALLBACK_TYPE] = None

        self._reconnect_task: Optional[asyncio.Task] = None
        self._retry_attempt = 0
        self._is_connected = False

    @property
    def telemetry(self) -> Optional[OralBTelemetry]:
        """Return the current telemetry data."""
        return self._telemetry

    @property
    def address(self) -> str:
        """Return device address."""
        return self._address

    @callback
    def async_start(self) -> None:
        """Start listening for Bluetooth updates."""
        _LOGGER.debug("Starting Oral-B hub monitoring for %s", self._address)

        self._unsubscribe_bt = async_register_callback(
            self.hass,
            self._async_on_bluetooth_event,
            {"address": self._address},
            mode="active",
        )
        self._unsubscribe_unavailable = async_track_unavailable(
            self.hass,
            self._async_on_device_unavailable,
            self._address,
        )

    @callback
    def async_stop(self) -> None:
        """Unsubscribe from events and stop tasks cleanly."""
        _LOGGER.debug("Stopping Oral-B hub monitoring for %s", self._address)
        if self._unsubscribe_bt:
            self._unsubscribe_bt()
            self._unsubscribe_bt = None

        if self._unsubscribe_unavailable:
            self._unsubscribe_unavailable()
            self._unsubscribe_unavailable = None

        if self._reconnect_task and not self._reconnect_task.done():
            self._reconnect_task.cancel()
            self._reconnect_task = None

    def register_callback(self, cb: Callable[[OralBTelemetry], None]) -> Callable[[], None]:
        """Register a subscriber callback for telemetry updates."""
        self._subscribers.append(cb)

        def _remove() -> None:
            if cb in self._subscribers:
                self._subscribers.remove(cb)

        return _remove

    @callback
    def _async_on_bluetooth_event(self, service_info: BluetoothServiceInfoBleak, change: int) -> None:
        """Handle incoming Bluetooth advertisements/updates."""
        self._retry_attempt = 0  # Reset backoff on successful signal
        self._is_connected = True

        payload = service_info.manufacturer_data.get(0x00DC) or service_info.raw_advertisement
        if not payload:
            return

        parsed = parse_telemetry(payload)
        if parsed:
            self._telemetry = parsed
            for cb in self._subscribers:
                cb(parsed)

    @callback
    def _async_on_device_unavailable(self, service_info: BluetoothServiceInfoBleak) -> None:
        """Handle device going out of range or dropping connection."""
        _LOGGER.warning("Oral-B device %s unavailable, triggering backoff reconnect cycle", self._address)
        self._is_connected = False
        if not self._reconnect_task or self._reconnect_task.done():
            self._reconnect_task = self.hass.async_create_task(self._async_reconnect_with_backoff())

    async def _async_reconnect_with_backoff(self) -> None:
        """Exponential backoff reconnect handler."""
        while not self._is_connected:
            self._retry_attempt += 1
            delay = min(
                INITIAL_BACKOFF_SECONDS * (BACKOFF_FACTOR ** (self._retry_attempt - 1)),
                MAX_BACKOFF_SECONDS,
            )
            _LOGGER.debug(
                "Reconnection attempt #%d for %s in %.1f seconds",
                self._retry_attempt,
                self._address,
                delay,
            )
            await asyncio.sleep(delay)