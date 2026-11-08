/**
 * Custom Lovelace Card for Oral-B Motion Toothbrush Monitoring.
 */
class OralBMotionCard extends HTMLElement {
  set hass(hass) {
    this._hass = hass;
    if (!this.content) {
      this.innerHTML = `
        <ha-card header="Oral-B Toothbrush">
          <div class="card-content" style="display: flex; flex-direction: column; gap: 12px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span>Status:</span>
              <strong id="oralb-state">Off</strong>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span>Brushing Time:</span>
              <span id="oralb-timer">0s</span>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span>Pressure Status:</span>
              <span id="oralb-pressure" style="padding: 2px 8px; border-radius: 4px; font-weight: bold;">Normal</span>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span>Active Quadrant:</span>
              <span id="oralb-sector">Sector 1</span>
            </div>
          </div>
        </ha-card>
      `;
      this.content = true;
    }

    if (this.config && this.config.entity) {
      const stateObj = hass.states[this.config.entity];
      if (stateObj) {
        const stateEl = this.querySelector('#oralb-state');
        const timerEl = this.querySelector('#oralb-timer');
        const pressureEl = this.querySelector('#oralb-pressure');
        const sectorEl = this.querySelector('#oralb-sector');

        stateEl.textContent = stateObj.state;
        timerEl.textContent = `${stateObj.attributes.brushing_time || 0}s`;

        const highPressure = stateObj.attributes.pressure === 'HIGH';
        pressureEl.textContent = stateObj.attributes.pressure || 'NORMAL';
        pressureEl.style.backgroundColor = highPressure ? 'var(--error-color, #db4437)' : 'var(--success-color, #43a047)';
        pressureEl.style.color = '#ffffff';

        sectorEl.textContent = stateObj.attributes.sector || 'N/A';
      }
    }
  }

  setConfig(config) {
    if (!config.entity) {
      throw new Error('Please define a valid Oral-B sensor entity');
    }
    this.config = config;
  }

  getCardSize() {
    return 3;
  }
}

customElements.define('oralb-motion-card', OralBMotionCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "oralb-motion-card",
  name: "Oral-B Motion Card",
  description: "A lightweight Lovelace card for tracking Oral-B brushing timer, pressure, and sectors."
});