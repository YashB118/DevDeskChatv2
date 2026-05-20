import { Module } from '@nestjs/common';
import { WahaStoreService } from './waha-store.service';

@Module({
  providers: [WahaStoreService],
  exports: [WahaStoreService],
})
export class WahaStoreModule {}
