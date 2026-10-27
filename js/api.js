// All network requests live in this file.

const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const REVERSE_URL = 'https://api.bigdatacloud.net/data/reverse-geocode-client';

async function getJSON(url, options = {}) {
  const response = await fetch(url, options);
  // fetch only rejects on network failure, so check the HTTP status ourselves
  if (!response.ok) {
    throw new Error(`Request failed (${response.status} ${response.statusText})`);
  }
  return response.json();
}

/** City name -> list of matching places. Returns [] when nothing matches. */
export async function searchCities(name, { signal, count = 5 } = {}) {
  const url = new URL(GEOCODE_URL);
  url.search = new URLSearchParams({ name, count, language: 'en', format: 'json' });
  const data = await getJSON(url, { signal });
  return data.results ?? []; // the API omits "results" when there are no matches
}

/** Lat/lon -> current, hourly and daily weather. */
export async function getForecast(latitude, longitude, unit = 'celsius') {
  const url = new URL(FORECAST_URL);
  url.search = new URLSearchParams({
    latitude,
    longitude,
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m,wind_direction_10m',
    hourly: 'temperature_2m,weather_code,precipitation_probability,is_day',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset,uv_index_max',
    timezone: 'auto',
    forecast_days: 7,
    temperature_unit: unit,
    wind_speed_unit: unit === 'fahrenheit' ? 'mph' : 'kmh',
    precipitation_unit: unit === 'fahrenheit' ? 'inch' : 'mm',
  });
  return getJSON(url);
}

/** Lat/lon -> { name, country } using BigDataCloud's free client endpoint. */
export async function reverseGeocode(latitude, longitude) {
  const url = new URL(REVERSE_URL);
  url.search = new URLSearchParams({ latitude, longitude, localityLanguage: 'en' });
  const data = await getJSON(url);
  return {
    name: data.city || data.locality || data.principalSubdivision || '',
    country: data.countryName || '',
  };
}
