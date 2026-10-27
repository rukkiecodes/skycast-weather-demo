// WMO weather interpretation codes, as used by Open-Meteo.
// theme is used to pick a body background class.

const CODES = {
  0:  { label: 'Clear sky',              day: '☀️', night: '🌙', theme: 'clear' },
  1:  { label: 'Mainly clear',           day: '🌤️', night: '🌙', theme: 'clear' },
  2:  { label: 'Partly cloudy',          day: '⛅', night: '☁️', theme: 'cloudy' },
  3:  { label: 'Overcast',               day: '☁️', night: '☁️', theme: 'cloudy' },
  45: { label: 'Fog',                    day: '🌫️', night: '🌫️', theme: 'fog' },
  48: { label: 'Depositing rime fog',    day: '🌫️', night: '🌫️', theme: 'fog' },
  51: { label: 'Light drizzle',          day: '🌦️', night: '🌧️', theme: 'rain' },
  53: { label: 'Drizzle',                day: '🌦️', night: '🌧️', theme: 'rain' },
  55: { label: 'Dense drizzle',          day: '🌧️', night: '🌧️', theme: 'rain' },
  56: { label: 'Freezing drizzle',       day: '🌧️', night: '🌧️', theme: 'rain' },
  57: { label: 'Dense freezing drizzle', day: '🌧️', night: '🌧️', theme: 'rain' },
  61: { label: 'Light rain',             day: '🌦️', night: '🌧️', theme: 'rain' },
  63: { label: 'Rain',                   day: '🌧️', night: '🌧️', theme: 'rain' },
  65: { label: 'Heavy rain',             day: '🌧️', night: '🌧️', theme: 'rain' },
  66: { label: 'Freezing rain',          day: '🌧️', night: '🌧️', theme: 'rain' },
  67: { label: 'Heavy freezing rain',    day: '🌧️', night: '🌧️', theme: 'rain' },
  71: { label: 'Light snow',             day: '🌨️', night: '🌨️', theme: 'snow' },
  73: { label: 'Snow',                   day: '🌨️', night: '🌨️', theme: 'snow' },
  75: { label: 'Heavy snow',             day: '❄️', night: '❄️', theme: 'snow' },
  77: { label: 'Snow grains',            day: '🌨️', night: '🌨️', theme: 'snow' },
  80: { label: 'Light showers',          day: '🌦️', night: '🌧️', theme: 'rain' },
  81: { label: 'Showers',                day: '🌧️', night: '🌧️', theme: 'rain' },
  82: { label: 'Violent showers',        day: '⛈️', night: '⛈️', theme: 'storm' },
  85: { label: 'Snow showers',           day: '🌨️', night: '🌨️', theme: 'snow' },
  86: { label: 'Heavy snow showers',     day: '❄️', night: '❄️', theme: 'snow' },
  95: { label: 'Thunderstorm',           day: '⛈️', night: '⛈️', theme: 'storm' },
  96: { label: 'Thunderstorm with hail', day: '⛈️', night: '⛈️', theme: 'storm' },
  99: { label: 'Severe thunderstorm',    day: '⛈️', night: '⛈️', theme: 'storm' },
};

const UNKNOWN = { label: 'Unknown', day: '❔', night: '❔', theme: 'cloudy' };

export function describeWeather(code, isDay = true) {
  const info = CODES[code] ?? UNKNOWN;
  return {
    label: info.label,
    icon: isDay ? info.day : info.night,
    theme: isDay ? info.theme : 'night',
  };
}
