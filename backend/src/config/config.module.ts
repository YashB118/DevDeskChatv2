import { Global, Module, type Provider } from '@nestjs/common';
import { APP_CONFIG } from './constants';
import { type AppConfig, loadEnv } from './env';

const configProvider: Provider = {
  provide: APP_CONFIG,
  useFactory: (): AppConfig => loadEnv(),
};

@Global()
@Module({
  providers: [configProvider],
  exports: [configProvider],
})
export class ConfigModule {}
