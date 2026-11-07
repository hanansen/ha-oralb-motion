\# Oral-B Motion



Home Assistant custom integration that streams live motion data (accelerometer and gyro) from Oral-B iO toothbrushes over Bluetooth, with a live 3D tilt view in the sidebar.



Inspired by \[Abhay Kashyap's "Teethmaxxing" post](https://abhay.fyi/teethmaxxing/).



\## Features

\- Sidebar panel with a live tilt visualisation of the brush

\- "Live motion stream" switch, plus provisional pitch and roll sensors (1 Hz)

\- Attaches to the brush's device from the core Oral-B integration



\## Requirements

\- Home Assistant 2024.7 or newer with a working Bluetooth adapter or proxy

\- An Oral-B iO brush (developed on an iO Series 6, untested elsewhere)



\## Install (HACS)

1\. HACS → ⋮ → Custom repositories → add this repo as type \*\*Integration\*\*

2\. Download "Oral-B Motion", then restart Home Assistant

3\. Wake the brush, then Settings → Devices \& Services → Add Integration → Oral-B Motion



Close the Oral-B app first: the brush only accepts one connection at a time.



\## Known limitations

\- Tilt only, with no yaw yet (the gyro scale isn't calibrated)

\- The axis mapping for pitch and roll is provisional

\- Written from public reverse-engineering notes, not affiliated with Oral-B or P\&G

