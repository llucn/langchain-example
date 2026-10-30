import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { REVIEW_RATINGS, REVIEW_TAGS, CHAT_LOG_REVIEW_STATES } from '@app/shared';
import type { ReviewRating, ReviewTag, ChatLogReviewState } from '@app/shared';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class SaveReviewDto {
  @ApiProperty({ enum: REVIEW_RATINGS })
  @IsIn(REVIEW_RATINGS)
  rating: ReviewRating;

  @ApiPropertyOptional({ enum: REVIEW_TAGS, isArray: true })
  @IsOptional()
  @IsArray()
  @IsIn(REVIEW_TAGS, { each: true })
  tags?: ReviewTag[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  comment?: string;

  @ApiPropertyOptional({ description: 'Message reviews only' })
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  expectedResult?: string;

  @ApiPropertyOptional({ description: 'Message reviews only' })
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  difference?: string;
}

export class ListSessionsQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @ApiPropertyOptional({ description: 'User subject or name (substring)' })
  @IsOptional()
  @IsString()
  user?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  agent?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  appVersion?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ enum: CHAT_LOG_REVIEW_STATES })
  @IsOptional()
  @IsIn(CHAT_LOG_REVIEW_STATES)
  rating?: ChatLogReviewState;
}
