import { collectDefaultMetrics, register } from 'prom-client';

collectDefaultMetrics();

export { register };
