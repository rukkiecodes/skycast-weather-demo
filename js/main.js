import { searchCities, getForecast, reverseGeocode } from './api.js';
import { describeWeather } from './weather-codes.js';

/* ---------- DOM ---------- */
const $ = (selector) => document.querySelector(selector);

const form = $('#search-form');
const input = $('#search-input');
const searchBtn = $('#search-btn');
const suggestionsList = $('#suggestions');
const locateBtn = $('#locate-btn');
const unitButtons = document.querySelectorAll('[data-unit]');
const recentNav = $('#recent');
const quickPicks = $('#quick-picks');

const states = {
  empty: $('#state-empty'),
  loading: $('#state-loading'),
  error: $('#state-error'),
  weather: $('#weather'),
};

/* ---------- Storage ---------- */
const STORAGE = { unit: 'skycast:unit', recent: 'skycast:recent', last: 'skycast:last' };
const MAX_RECENT = 5;

function load(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked – the app still works without it */
  }
}

/* ---------- App state ---------- */
let unit = load(STORAGE.unit, 'celsius');
let recent = load(STORAGE.recent, []);
let currentPlace = null;
let retryAction = null;
let requestId = 0; // ignore responses that arrive after a newer request started

const QUICK_PICKS = [
  { name: 'Lagos', country: 'Nigeria', latitude: 6.45407, longitude: 3.39467 },
  { name: 'London', country: 'United Kingdom', latitude: 51.50853, longitude: -0.12574 },
  { name: 'New York', country: 'United States', latitude: 40.71427, longitude: -74.00597 },
  { name: 'Tokyo', country: 'Japan', latitude: 35.6895, longitude: 139.69171 },
];

/* ---------- Helpers ---------- */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function showState(name) {
  Object.entries(states).forEach(([key, node]) => {
    node.hidden = key !== name;
  });
  const busy = name === 'loading';
  searchBtn.disabled = busy;
  locateBtn.disabled = busy;
}

function showError(title, message, action) {
  $('#error-title').textContent = title;
  $('#error-message').textContent = message;
  retryAction = action;
  $('#retry-btn').hidden = !action;
  showState('error');
}

function placeLabel(place) {
  return [place.name, place.admin1, place.country]
    .filter((part, i, arr) => part && arr.indexOf(part) === i)
    .join(', ');
}

function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

// Open-Meteo returns local times like "2026-10-27T14:00" (no offset).
// Treat them as UTC so the browser's own timezone doesn't shift them.
function parseLocal(iso) {
  const [date, time = '00:00'] = iso.split('T');
  const [y, m, d] = date.split('-').map(Number);
  const [h, min] = time.split(':').map(Number);
  return new Date(Date.UTC(y, m - 1, d, h, min));
}

const fmtDateTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
});
const fmtWeekday = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short' });
const fmtDayMonth = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short' });

const hourOf = (iso) => iso.slice(11, 16);
const round = (n) => Math.round(n);

function compassDirection(degrees) {
  const points = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return points[Math.round(degrees / 45) % 8];
}

/* ---------- Loading weather ---------- */
async function loadWeather(place) {
  const id = ++requestId;
  currentPlace = place;
  showState('loading');

  try {
    const data = await getForecast(place.latitude, place.longitude, unit);
    if (id !== requestId) return;

    render(place, data);
    showState('weather');
    save(STORAGE.last, place);
    addRecent(place);
  } catch (error) {
    if (id !== requestId) return;
    console.error(error);
    showError(
      'Could not load the forecast',
      navigator.onLine ? error.message : 'You appear to be offline. Check your connection.',
      () => loadWeather(place),
    );
  }
}

async function searchAndLoad(query) {
  query = query.trim();
  if (!query) return;
  const id = ++requestId;
  showState('loading');

  try {
    const [first] = await searchCities(query, { count: 1 });
    if (id !== requestId) return;
    if (!first) {
      showError('City not found', `We couldn't find "${query}". Check the spelling or try a bigger city nearby.`);
      return;
    }
    loadWeather(first);
  } catch (error) {
    if (id !== requestId) return;
    console.error(error);
    showError('Search failed', error.message, () => searchAndLoad(query));
  }
}

function useMyLocation() {
  if (!('geolocation' in navigator)) {
    showError('Location not supported', 'Your browser does not support geolocation. Search for a city instead.');
    return;
  }
  showState('loading');

  navigator.geolocation.getCurrentPosition(
    async ({ coords }) => {
      const latitude = Number(coords.latitude.toFixed(4));
      const longitude = Number(coords.longitude.toFixed(4));
      let place = { name: `${latitude}, ${longitude}`, country: '', latitude, longitude };
      try {
        const found = await reverseGeocode(latitude, longitude);
        if (found.name) place = { ...place, ...found };
      } catch (error) {
        console.warn('Reverse geocoding failed, showing coordinates instead.', error);
      }
      loadWeather(place);
    },
    (error) => {
      const messages = {
        1: 'You denied location access. Allow it in your browser settings, or search for a city.',
        2: 'Your position could not be determined. Try searching for a city.',
        3: 'Getting your location took too long.',
      };
      showError('Location unavailable', messages[error.code] ?? error.message, error.code === 1 ? null : useMyLocation);
    },
    { timeout: 10000, maximumAge: 10 * 60 * 1000 },
  );
}

/* ---------- Rendering ---------- */
function render(place, data) {
  const { current, hourly, daily, current_units: units, daily_units: dailyUnits } = data;
  const tempUnit = units.temperature_2m; // "°C" or "°F"
  const weather = describeWeather(current.weather_code, current.is_day === 1);

  document.body.className = `theme-${weather.theme}`;
  document.title = `${round(current.temperature_2m)}${tempUnit} ${place.name} – SkyCast`;

  // Current
  $('#place-name').textContent = placeLabel(place);
  $('#place-time').textContent = `Local time: ${fmtDateTime.format(parseLocal(current.time))}`;
  $('#current-icon').textContent = weather.icon;
  $('#current-temp').textContent = `${round(current.temperature_2m)}${tempUnit}`;
  $('#current-desc').textContent = weather.label;
  $('#current-feels').textContent = `Feels like ${round(current.apparent_temperature)}${tempUnit}`;
  $('#current-range').textContent =
    `H: ${round(daily.temperature_2m_max[0])}°  L: ${round(daily.temperature_2m_min[0])}°`;

  $('#stat-humidity').textContent = `${current.relative_humidity_2m}${units.relative_humidity_2m}`;
  $('#stat-wind').textContent =
    `${round(current.wind_speed_10m)} ${units.wind_speed_10m} ${compassDirection(current.wind_direction_10m)}`;
  $('#stat-precip').textContent = `${current.precipitation} ${units.precipitation}`;
  $('#stat-sunrise').textContent = hourOf(daily.sunrise[0]);
  $('#stat-sunset').textContent = hourOf(daily.sunset[0]);
  $('#stat-uv').textContent = daily.uv_index_max[0] ?? '–';

  renderHourly(hourly, current.time, tempUnit);
  renderDaily(daily, dailyUnits);
}

function renderHourly(hourly, currentTime, tempUnit) {
  const list = $('#hourly-list');
  list.replaceChildren();

  // Start from the current hour, not midnight
  const currentHour = `${currentTime.slice(0, 13)}:00`;
  const start = Math.max(0, hourly.time.findIndex((t) => t >= currentHour));

  hourly.time.slice(start, start + 24).forEach((time, offset) => {
    const i = start + offset;
    const weather = describeWeather(hourly.weather_code[i], hourly.is_day[i] === 1);
    const item = el('li', 'hour');
    item.append(
      el('span', 'hour__time', offset === 0 ? 'Now' : hourOf(time)),
      el('span', 'hour__icon', weather.icon),
      el('span', 'hour__temp', `${round(hourly.temperature_2m[i])}°`),
      el('span', 'hour__rain', `💧 ${hourly.precipitation_probability[i] ?? 0}%`),
    );
    item.title = `${weather.label}, ${round(hourly.temperature_2m[i])}${tempUnit}`;
    list.append(item);
  });
}

function renderDaily(daily, dailyUnits) {
  const list = $('#daily-list');
  list.replaceChildren();

  const weekMin = Math.min(...daily.temperature_2m_min);
  const weekMax = Math.max(...daily.temperature_2m_max);
  const span = weekMax - weekMin || 1;

  daily.time.forEach((day, i) => {
    const date = parseLocal(day);
    const weather = describeWeather(daily.weather_code[i]);
    const min = daily.temperature_2m_min[i];
    const max = daily.temperature_2m_max[i];

    const item = el('li', 'day');
    item.title = `${weather.label}, ${round(min)}–${round(max)}${dailyUnits.temperature_2m_max}`;

    const name = el('span', 'day__name');
    name.append(el('strong', '', i === 0 ? 'Today' : fmtWeekday.format(date)), el('small', '', fmtDayMonth.format(date)));

    const bar = el('span', 'day__bar');
    const fill = el('span', 'day__fill');
    fill.style.left = `${((min - weekMin) / span) * 100}%`;
    fill.style.width = `${((max - min) / span) * 100}%`;
    bar.append(fill);

    item.append(
      name,
      el('span', 'day__icon', weather.icon),
      el('span', 'day__rain', `💧 ${daily.precipitation_probability_max[i] ?? 0}%`),
      el('span', 'day__min', `${round(min)}°`),
      bar,
      el('span', 'day__max', `${round(max)}°`),
    );
    list.append(item);
  });
}

/* ---------- Recent searches ---------- */
const samePlace = (a, b) =>
  Math.abs(a.latitude - b.latitude) < 0.01 && Math.abs(a.longitude - b.longitude) < 0.01;

function addRecent(place) {
  const { name, admin1, country, latitude, longitude } = place;
  recent = [{ name, admin1, country, latitude, longitude }, ...recent.filter((p) => !samePlace(p, place))]
    .slice(0, MAX_RECENT);
  save(STORAGE.recent, recent);
  renderRecent();
}

function renderRecent() {
  recentNav.replaceChildren();
  recentNav.hidden = recent.length === 0;
  if (!recent.length) return;

  recentNav.append(el('span', 'recent__label', 'Recent:'));
  recent.forEach((place) => {
    const chip = el('button', 'chip', place.name);
    chip.type = 'button';
    chip.title = placeLabel(place);
    if (currentPlace && samePlace(place, currentPlace)) chip.setAttribute('aria-current', 'true');
    chip.addEventListener('click', () => loadWeather(place));
    recentNav.append(chip);
  });

  const clear = el('button', 'chip chip--clear', 'Clear');
  clear.type = 'button';
  clear.addEventListener('click', () => {
    recent = [];
    save(STORAGE.recent, recent);
    renderRecent();
  });
  recentNav.append(clear);
}

/* ---------- Autocomplete ---------- */
let suggestions = [];
let activeIndex = -1;
let suggestController = null;

function closeSuggestions() {
  suggestions = [];
  activeIndex = -1;
  suggestionsList.hidden = true;
  suggestionsList.replaceChildren();
  input.setAttribute('aria-expanded', 'false');
  input.removeAttribute('aria-activedescendant');
}

function renderSuggestions(message) {
  suggestionsList.replaceChildren();

  if (message) {
    suggestionsList.append(el('li', 'suggestion suggestion--empty', message));
  }

  suggestions.forEach((place, i) => {
    const item = el('li', 'suggestion');
    item.id = `suggestion-${i}`;
    item.setAttribute('role', 'option');
    item.setAttribute('aria-selected', String(i === activeIndex));
    item.append(
      el('strong', '', place.name),
      el('span', '', [place.admin1, place.country].filter(Boolean).join(', ')),
    );
    // mousedown fires before the input loses focus
    item.addEventListener('mousedown', (event) => {
      event.preventDefault();
      choose(place);
    });
    suggestionsList.append(item);
  });

  suggestionsList.hidden = false;
  input.setAttribute('aria-expanded', 'true');
  if (activeIndex >= 0) input.setAttribute('aria-activedescendant', `suggestion-${activeIndex}`);
  else input.removeAttribute('aria-activedescendant');
}

function choose(place) {
  input.value = '';
  closeSuggestions();
  input.blur();
  loadWeather(place);
}

const fetchSuggestions = debounce(async (query) => {
  suggestController?.abort(); // cancel the previous request
  suggestController = new AbortController();

  try {
    suggestions = await searchCities(query, { signal: suggestController.signal });
    activeIndex = -1;
    if (input.value.trim() !== query) return; // user kept typing
    renderSuggestions(suggestions.length ? '' : 'No matching cities');
  } catch (error) {
    if (error.name !== 'AbortError') console.error(error);
  }
}, 300);

input.addEventListener('input', () => {
  const query = input.value.trim();
  if (query.length < 2) {
    suggestController?.abort();
    closeSuggestions();
    return;
  }
  fetchSuggestions(query);
});

input.addEventListener('keydown', (event) => {
  if (suggestionsList.hidden || !suggestions.length) {
    if (event.key === 'Escape') closeSuggestions();
    return;
  }
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    activeIndex = (activeIndex + 1) % suggestions.length;
    renderSuggestions();
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    activeIndex = (activeIndex - 1 + suggestions.length) % suggestions.length;
    renderSuggestions();
  } else if (event.key === 'Escape') {
    closeSuggestions();
  }
});

input.addEventListener('blur', closeSuggestions);

form.addEventListener('submit', (event) => {
  event.preventDefault();
  suggestController?.abort();
  if (activeIndex >= 0 && suggestions[activeIndex]) {
    choose(suggestions[activeIndex]);
    return;
  }
  const query = input.value;
  input.value = '';
  closeSuggestions();
  searchAndLoad(query);
});

/* ---------- Units ---------- */
function updateUnitButtons() {
  unitButtons.forEach((btn) => btn.setAttribute('aria-pressed', String(btn.dataset.unit === unit)));
}

unitButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    if (btn.dataset.unit === unit) return;
    unit = btn.dataset.unit;
    save(STORAGE.unit, unit);
    updateUnitButtons();
    if (currentPlace) loadWeather(currentPlace); // re-fetch with the new unit
  });
});

/* ---------- Other events ---------- */
locateBtn.addEventListener('click', useMyLocation);
$('#retry-btn').addEventListener('click', () => retryAction?.());

QUICK_PICKS.forEach((place) => {
  const chip = el('button', 'chip', place.name);
  chip.type = 'button';
  chip.addEventListener('click', () => loadWeather(place));
  quickPicks.append(chip);
});

/* ---------- Start ---------- */
updateUnitButtons();
renderRecent();

const lastPlace = load(STORAGE.last, null);
if (lastPlace) loadWeather(lastPlace);
else showState('empty');
