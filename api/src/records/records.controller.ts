import { Body, Controller, Delete, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { RecordsService } from './records.service';
import { DeleteRowsDto } from './dto/delete-rows.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('records')
@ApiBearerAuth()
@Controller('projects/:slug/records')
@UseGuards(JwtAuthGuard, RolesGuard)
// Deleting data is for those who read it for a living, not only for whoever
// configures the hub: analysts too. Never a viewer.
@Roles(Role.ADMIN, Role.ANALYST)
export class RecordsController {
  constructor(private readonly records: RecordsService) {}

  @Delete('rows')
  @ApiOperation({ summary: "Deletes one row of a site's table —its raw events— within a period, and recomputes it" })
  deleteRows(@Param('slug') slug: string, @Body() dto: DeleteRowsDto) {
    return this.records.deleteRows(slug, dto);
  }

  @Delete()
  @ApiOperation({ summary: "Deletes everything a site ever sent: events, metrics, visitors and its submissions log" })
  wipe(@Param('slug') slug: string) {
    return this.records.wipe(slug);
  }
}
