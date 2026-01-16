import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateBoardDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;
}

export class UpdateBoardDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;
}
