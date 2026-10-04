import { Module } from '@nestjs/common';
import { UploadService } from './upload.service';
import { FilesController } from './files.controller';

@Module({
  controllers: [FilesController],
  providers: [UploadService],
  exports: [UploadService],
})
export class UploadModule {}
