import { BadRequestException } from '@nestjs/common';
import type { FileAssetEntity } from '../fileAsset.entity';
import type { FileAssetAccessActor, FileAssetService } from '../fileAsset.service';
import {
  FileRefEntry,
  FileRefMapping,
  FileRefMappingStore,
  assertValidFileRef,
} from './file-ref-mapping';

export interface ResolveFileRefInput {
  fileRef: string;
  mapping: Partial<FileRefMapping> | FileRefMappingStore | null | undefined;
  actor: FileAssetAccessActor;
}

export interface ResolvedFileRef {
  fileRef: string;
  fileId: string;
  entry: FileRefEntry;
  file: FileAssetEntity;
}

type FileAssetAccessService = Pick<FileAssetService, 'findByFileIdForAccess' | 'assertAccessible'>;

export async function resolveFileRef(
  fileAssetService: FileAssetAccessService,
  input: ResolveFileRefInput,
): Promise<ResolvedFileRef> {
  assertValidFileRef(input.fileRef);

  const store =
    input.mapping instanceof FileRefMappingStore
      ? input.mapping
      : new FileRefMappingStore(input.mapping);
  const entry = store.findByFileRef(input.fileRef);
  if (!entry) {
    throw new BadRequestException('文件引用不存在或已失效。');
  }

  const file = await fileAssetService.findByFileIdForAccess(entry.fileId);
  fileAssetService.assertAccessible(file, input.actor);

  return {
    fileRef: entry.fileRef,
    fileId: entry.fileId,
    entry,
    file,
  };
}
