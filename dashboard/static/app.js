(() => {
  const config = window.dashboardConfig || {};
  const rooms = config.rooms || [];
  const pollSeconds = Math.max(Number(config.pollSeconds) || 5, 2);
  const alertsBody = document.querySelector('#alerts-table tbody');
  const sensorsBody = document.querySelector('#sensors-table tbody');
  const roomStatesContainer = document.getElementById('room-states');
  const refreshLabel = document.getElementById('refresh-interval');

  if (refreshLabel) {
    refreshLabel.textContent = pollSeconds;
  }

  const sensorCells = new Map();
  const roomCards = new Map();

  function fmtNumber(value, decimals = 0) {
    if (value === null || value === undefined || Number.isNaN(value)) {
      return '—';
    }
    const num = Number(value);
    if (!Number.isFinite(num)) {
      return String(value);
    }
    return num.toFixed(decimals);
  }

  function fmtMotion(value) {
    if (value === null || value === undefined) return '—';
    return value ? 'Active' : 'Inactive';
  }

  function badgeClassForLights(value) {
    if (value === 'On') return 'good';
    if (value && value.toLowerCase().includes('dim')) return 'warn';
    if (value === 'Off' || value === 'Dimming to Off') return 'alert';
    return 'warn';
  }

  function badgeClassForDoor(value) {
    if (value === 'Closed') return 'good';
    if (value === 'Open') return 'alert';
    return 'warn';
  }

  function badgeClassForHVAC(value) {
    if (value === 'ECO') return 'good';
    if (value === 'BOOST') return 'alert';
    return 'warn';
  }

  function createSensorRow(room) {
    const row = document.createElement('tr');
    const cells = {
      co2: document.createElement('td'),
      temp: document.createElement('td'),
      motion: document.createElement('td'),
      lux: document.createElement('td'),
      updated: document.createElement('td')
    };

    const roomCell = document.createElement('td');
    roomCell.textContent = room;
    row.appendChild(roomCell);

    Object.entries(cells).forEach(([key, cell]) => {
      cell.dataset.label = key.charAt(0).toUpperCase() + key.slice(1);
      row.appendChild(cell);
    });

    sensorsBody.appendChild(row);
    sensorCells.set(room, cells);
  }

  function ensureSensorRow(room) {
    if (!sensorCells.has(room)) {
      createSensorRow(room);
    }
  }

  function updateSensors(data) {
    rooms.forEach((room) => {
      ensureSensorRow(room);
      const cells = sensorCells.get(room);
      const entry = (data && data[room]) || {};
      cells.co2.textContent = fmtNumber(entry.co2, 0);
      cells.temp.textContent = fmtNumber(entry.temp, 1);
      cells.motion.textContent = fmtMotion(entry.motion);
      cells.lux.textContent = fmtNumber(entry.lux, 0);
      cells.updated.textContent = entry.updated || '—';
    });
  }

  function createRoomCard(room) {
    const card = document.createElement('div');
    card.className = 'room-card';
    card.dataset.room = room;
    const lights = document.createElement('span');
    const door = document.createElement('span');
    const hvac = document.createElement('span');

    const section = (label, span) => {
      const p = document.createElement('p');
      const strong = document.createElement('strong');
      strong.textContent = `${label}: `;
      p.appendChild(strong);
      const badge = document.createElement('span');
      badge.className = 'badge warn';
      badge.appendChild(span);
      p.appendChild(badge);
      return { container: p, badge };
    };

    const lightsRow = section('Lights', lights);
    const doorRow = section('Door', door);
    const hvacRow = section('HVAC', hvac);

    card.innerHTML = '';
    const heading = document.createElement('h3');
    heading.textContent = room;
    card.appendChild(heading);
    card.appendChild(lightsRow.container);
    card.appendChild(doorRow.container);
    card.appendChild(hvacRow.container);

    roomStatesContainer.appendChild(card);
    roomCards.set(room, {
      lights: { text: lights, badge: lightsRow.badge },
      door: { text: door, badge: doorRow.badge },
      hvac: { text: hvac, badge: hvacRow.badge }
    });
  }

  function ensureRoomCard(room) {
    if (!roomCards.has(room)) {
      createRoomCard(room);
    }
  }

  function updateRoomStates(data) {
    rooms.forEach((room) => {
      ensureRoomCard(room);
      const entry = (data && data[room]) || {};
      const card = roomCards.get(room);
      const lights = entry.lights || 'Unknown';
      const door = entry.door || 'Unknown';
      const hvac = entry.hvac || 'Unknown';

      card.lights.text.textContent = lights;
      card.lights.badge.className = `badge ${badgeClassForLights(lights)}`;
      card.door.text.textContent = door;
      card.door.badge.className = `badge ${badgeClassForDoor(door)}`;
      card.hvac.text.textContent = hvac;
      card.hvac.badge.className = `badge ${badgeClassForHVAC(hvac)}`;
    });
  }

  function renderAlerts(data) {
    if (!alertsBody) return;
    alertsBody.innerHTML = '';
    const rows = (data || []).slice(0, 50);
    rows.forEach((item) => {
      const tr = document.createElement('tr');
      const values = [item.roomId || '—', item.rule || '—', item.action || '—', item.msg || '', item.ts || '—'];
      values.forEach((value, idx) => {
        const td = document.createElement('td');
        td.textContent = value;
        switch (idx) {
          case 0:
            td.dataset.label = 'Room';
            break;
          case 1:
            td.dataset.label = 'Rule';
            break;
          case 2:
            td.dataset.label = 'Action';
            break;
          case 3:
            td.dataset.label = 'Message';
            break;
          case 4:
            td.dataset.label = 'Timestamp';
            break;
          default:
            break;
        }
        tr.appendChild(td);
      });
      alertsBody.appendChild(tr);
    });
  }

  function applyInitialData() {
    renderAlerts(config.initialAlerts);
    updateSensors(config.initialSensors);
    updateRoomStates(config.initialRooms);
  }

  async function fetchData() {
    try {
      const response = await fetch('/api/dashboard');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const payload = await response.json();
      renderAlerts(payload.alerts);
      updateSensors(payload.sensors);
      updateRoomStates(payload.rooms);
    } catch (err) {
      console.error('Failed to refresh dashboard', err);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    rooms.forEach((room) => {
      ensureSensorRow(room);
      ensureRoomCard(room);
    });
    applyInitialData();
    fetchData();
    setInterval(fetchData, pollSeconds * 1000);
  });
})();
