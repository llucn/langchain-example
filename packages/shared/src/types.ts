export type ServiceStatus = 'up' | 'down';

export interface HealthResponse {
  status: 'ok' | 'error';
  timestamp: string;
  checks: {
    database: ServiceStatus;
    redis: ServiceStatus;
  };
}

export interface UserProfile {
  sub: string;
  email?: string;
  username?: string;
  groups?: string[];
}
