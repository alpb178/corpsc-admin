import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CredentialsService } from './credentials.service';
import { CreateCredentialDto } from './dto/create-credential.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('credentials')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class CredentialsController {
  constructor(private readonly credentials: CredentialsService) {}

  @Get('credentials')
  @ApiOperation({ summary: 'Lista las claves de envío (nunca el secreto)' })
  list() {
    return this.credentials.list();
  }

  @Post('credentials')
  @ApiOperation({ summary: 'Crea una clave de envío; el secreto se devuelve una sola vez' })
  create(@Body() dto: CreateCredentialDto) {
    return this.credentials.create(dto);
  }

  @Put('projects/:slug/credential/:credentialId')
  @ApiOperation({ summary: 'Habilita a un proyecto para enviar con esa clave' })
  assign(@Param('slug') slug: string, @Param('credentialId') credentialId: string) {
    return this.credentials.assign(slug, credentialId);
  }

  @Delete('projects/:slug/credential')
  @ApiOperation({ summary: 'Revoca el envío; los datos ya recibidos se conservan' })
  revoke(@Param('slug') slug: string) {
    return this.credentials.revoke(slug);
  }
}
