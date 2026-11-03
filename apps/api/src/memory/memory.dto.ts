import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MEMORY_MAX_LENGTH } from '@app/shared';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class MemoryContentDto {
  @ApiProperty({ maxLength: MEMORY_MAX_LENGTH })
  @IsString()
  @MinLength(1)
  @MaxLength(MEMORY_MAX_LENGTH * 4) // whitespace collapses; the service checks the exact limit
  content: string;
}

export class AdminMemoryQueryDto {
  @ApiPropertyOptional({ description: 'Case-insensitive substring of the owner email' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  email?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize: number = 50;
}
