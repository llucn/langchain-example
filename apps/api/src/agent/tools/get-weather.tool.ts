import { tool } from '@langchain/core/tools';
import { z } from 'zod';

const CONDITIONS = ['sunny', 'cloudy', 'rainy', 'windy', 'foggy'];

/** Deterministic mock: same city, same weather. */
export function mockWeather(city: string) {
  let h = 0;
  for (const ch of city.trim().toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return {
    city,
    condition: CONDITIONS[h % CONDITIONS.length],
    temperatureC: (h % 35) - 5,
    humidity: 30 + (h % 60),
    source: 'mock',
  };
}

export const getWeather = tool(async ({ city }) => JSON.stringify(mockWeather(city)), {
  name: 'getWeather',
  description: 'Get the current weather for a city.',
  schema: z.object({ city: z.string().min(1).describe('City name, e.g. Paris') }),
});
