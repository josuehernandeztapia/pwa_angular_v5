import { createEnvironment } from './environment.base';

export const environment = createEnvironment({
  testing: true,
  bypassAuth: true,
  features: {
    enableMockData: true
  }
});
