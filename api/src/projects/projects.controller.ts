import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { ProjectsService } from './projects.service';
import { UpdateProjectDto } from './dto/update-project.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('projects')
@ApiBearerAuth()
@Controller('projects')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  @ApiOperation({ summary: "Lists the group's sites and the status of their sources" })
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  findAll(@Query('includeInactive') includeInactive?: string) {
    return this.projects.findAll(includeInactive === 'true');
  }

  @Get(':slug')
  @ApiOperation({ summary: 'Detail of a site and its data sources' })
  findOne(@Param('slug') slug: string) {
    return this.projects.findBySlug(slug);
  }

  @Patch(':slug')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: "Updates a site's settings" })
  update(@Param('slug') slug: string, @Body() dto: UpdateProjectDto) {
    return this.projects.update(slug, dto);
  }
}
