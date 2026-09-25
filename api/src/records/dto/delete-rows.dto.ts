import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, Matches, MaxLength } from 'class-validator';

/** The panel's tables whose rows can be deleted, and what a row's key names. */
export const RECORD_TABLES = ['page', 'element', 'landing', 'exit', 'acquisition', 'recent'] as const;
export type RecordTable = (typeof RECORD_TABLES)[number];

export class DeleteRowsDto {
  @ApiProperty({ enum: RECORD_TABLES, description: 'Which table the row belongs to' })
  @IsIn(RECORD_TABLES)
  table!: RecordTable;

  @ApiProperty({
    description:
      "The row's key: a path for page/landing/exit, \"path | section | label\" for element, " +
      '"channel | source | landing" for acquisition, the event id for recent',
    example: '/es/servicios',
  })
  @IsString()
  @MaxLength(600)
  key!: string;

  @ApiProperty({ example: '2026-09-01', description: 'The period on screen: only its days are touched' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'from debe ser YYYY-MM-DD' })
  from!: string;

  @ApiProperty({ example: '2026-09-28' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'to debe ser YYYY-MM-DD' })
  to!: string;
}
