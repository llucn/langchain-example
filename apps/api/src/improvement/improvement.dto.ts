import { ApiProperty } from '@nestjs/swagger';
import { MAX_IMPROVEMENT_REVIEWS } from '@app/shared';
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsUUID } from 'class-validator';

export class CreateImprovementDto {
  @ApiProperty({
    type: [String],
    description: `Ids of Bad message reviews (1 to ${MAX_IMPROVEMENT_REVIEWS})`,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_IMPROVEMENT_REVIEWS)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  reviewIds: string[];
}
