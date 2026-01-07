import { IsString, IsOptional, IsArray, MinLength, IsUrl } from 'class-validator';

export class CreateDocumentDto {
  @IsString()
  @MinLength(1)
  title!: string;

  @IsString()
  @MinLength(1)
  content!: string;

  @IsOptional()
  @IsUrl()
  url?: string;

  @IsString()
  @MinLength(1)
  source!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  dimensions?: string[];

  @IsOptional()
  @IsString()
  googleFileId?: string;

  @IsOptional()
  @IsString()
  googleModifiedTime?: string;
}

export class UpdateDocumentDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  content?: string;

  @IsOptional()
  @IsUrl()
  url?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  source?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  dimensions?: string[];

  @IsOptional()
  @IsString()
  googleFileId?: string;

  @IsOptional()
  @IsString()
  googleModifiedTime?: string;
}

export class SearchDocumentsDto {
  @IsString()
  @MinLength(1)
  query!: string;

  @IsOptional()
  limit?: number;
}

export class DocumentResponseDto {
  id!: string;
  title!: string;
  content!: string;
  url?: string;
  source!: string;
  dimensions!: string[];
  createdAt!: Date;
  updatedAt!: Date;
}

