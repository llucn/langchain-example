import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateSettingsDto {
  @ApiPropertyOptional({ description: 'Setting name -> value; null resets to the environment' })
  @IsOptional()
  @IsObject()
  values?: Record<string, string | number | null>;

  @ApiPropertyOptional({ description: 'New token; empty leaves the stored token unchanged' })
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  githubToken?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  clearGithubToken?: boolean;
}

export class SettingsRefsDto {
  @IsString()
  @MaxLength(512)
  source: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  apiUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  token?: string;
}
