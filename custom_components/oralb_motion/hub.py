"""Connection manager for one brush."""
from __future__ import annotations

import asyncio
import contextlib
import logging
import time
from collections.abc import Callable

from bleak_retry_connector import BleakClientWithServiceCache, establish_connection

from homeassistant.components import bluetooth
from homeassistant.core import HomeAssistant
from homeassistant.helpers.dispatcher import async_dispatcher_send

from .const import DOMAIN, MOTION_CHAR
from .decoder import MotionSample, decode_push

_LOGGER = logging.getLogger(__name__)


class OralBMotionHub:
    def __init__(self, hass: HomeAssistant, address: str, name: str) -> None:
        self.hass = hass
        self.address = address.upper()
        self.name = name
        self.hold = False  # kept on by the switch
        self.connected = False
        self.status = "idle"
        self.last: MotionSample | None = None
        self._listeners: set[Callable[[dict], None]] = set()
        self._task: asyncio.Task | None = None
        self._last_push = 0.0

    @property
    def signal(self) -> str:
        return f"{DOMAIN}_update_{self.address}"

    def subscribe(self, cb: Callable[[dict], None]) -> Callable[[], None]:
        self._listeners.add(cb)
        self._sync()

        def unsub() -> None:
            self._listeners.discard(cb)
            self._sync()

        return unsub

    def set_hold(self, on: bool) -> None:
        self.hold = on
        self._sync()
        async_dispatcher_send(self.hass, self.signal)

    async def async_stop(self) -> None:
        self.hold = False
        self._listeners.clear()
        if self._task and not self._task.done():
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task

    # -- internals --
    def _wanted(self) -> bool:
        return self.hold or bool(self._listeners)

    def _sync(self) -> None:
        running = self._task is not None and not self._task.done()
        if self._wanted() and not running:
            self._task = self.hass.async_create_background_task(
                self._run(), f"{DOMAIN}_{self.address}"
            )
        elif not self._wanted() and running:
            self._task.cancel()

    def _set_status(self, status: str) -> None:
        self.status = status
        for cb in list(self._listeners):
            cb({"status": status})
        async_dispatcher_send(self.hass, self.signal)

    def _on_data(self, _char, data: bytearray) -> None:
        sample = decode_push(bytes(data))
        if sample is None:
            return
        self.last = sample
        payload = sample.as_dict()
        for cb in list(self._listeners):
            cb(payload)
        now = time.monotonic()
        if now - self._last_push >= 1.0:  # sensors update at 1 Hz
            self._last_push = now
            async_dispatcher_send(self.hass, self.signal)

    async def _run(self) -> None:
        while self._wanted():
            client = None
            try:
                device = bluetooth.async_ble_device_from_address(
                    self.hass, self.address, connectable=True
                )
                if device is None:
                    self._set_status("waiting - wake the brush")
                    await asyncio.sleep(2)
                    continue
                self._set_status("connecting")
                client = await establish_connection(
                    BleakClientWithServiceCache, device, self.name, max_attempts=3
                )
                await client.start_notify(MOTION_CHAR, self._on_data)
                self.connected = True
                self._set_status("connected")
                while client.is_connected and self._wanted():
                    await asyncio.sleep(1)
                self._set_status("brush disconnected (asleep?)")
            except asyncio.CancelledError:
                raise
            except Exception as err:  # noqa: BLE001
                _LOGGER.warning("%s: %s", self.address, err)
                self._set_status(f"error: {err}")
                await asyncio.sleep(3)
            finally:
                self.connected = False
                self.last = None
                if client is not None:
                    with contextlib.suppress(Exception):
                        await client.disconnect()
                async_dispatcher_send(self.hass, self.signal)
        self._set_status("idle")